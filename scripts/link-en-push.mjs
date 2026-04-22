import { createSupabaseAdmin } from './db.mjs'

const supabase = await createSupabaseAdmin()
const { data: admin } = await supabase.from('administraties').select('id').ilike('naam', '%Rebu%').single()
const adminId = admin.id

const auth = await fetch('https://auth.snelstart.nl/b2b/token', {
  method: 'POST',
  headers: { 'Ocp-Apim-Subscription-Key': process.env.SNELSTART_SUBSCRIPTION_KEY, 'Content-Type': 'application/x-www-form-urlencoded' },
  body: new URLSearchParams({ grant_type: 'clientkey', clientkey: process.env.SNELSTART_CLIENT_KEY }),
}).then(r => r.json())
const token = auth.access_token
const headers = { Authorization: `Bearer ${token}`, 'Ocp-Apim-Subscription-Key': process.env.SNELSTART_SUBSCRIPTION_KEY, 'Content-Type': 'application/json', Accept: 'application/json' }

async function ssGet(p) { const r = await fetch(`https://b2bapi.snelstart.nl/v2${p}`, { headers }); if (!r.ok) throw new Error(`${p} ${r.status}: ${await r.text()}`); return r.json() }
async function ssPost(p, b) { const r = await fetch(`https://b2bapi.snelstart.nl/v2${p}`, { method: 'POST', headers, body: JSON.stringify(b) }); if (!r.ok) throw new Error(`${p} ${r.status}: ${await r.text()}`); return r.json() }

// 1. ABA Alkmaar relatie
const ABA_ID = '4c6dce37-7467-4de9-93b0-21c29d5931cc'

// 2. Stefan en Anna aanmaken
const { data: stefanAnna, error: saErr } = await supabase.from('relaties').insert({
  administratie_id: adminId,
  bedrijfsnaam: 'Stefan en Anna',
  type: 'particulier',
  standaard_marge: 40,
}).select('id').single()
if (saErr) { console.error('Stefan en Anna aanmaken:', saErr.message); process.exit(1) }
console.log(`Stefan en Anna aangemaakt: ${stefanAnna.id}`)

// 3. Link facturen
await supabase.from('facturen').update({ relatie_id: ABA_ID }).eq('administratie_id', adminId).eq('factuurnummer', 'F-2026-00176')
await supabase.from('facturen').update({ relatie_id: stefanAnna.id }).eq('administratie_id', adminId).eq('factuurnummer', 'F-2026-00170')
console.log('Facturen gekoppeld')

// 4. Grootboeken
const gbList = (await ssGet('/grootboeken?$top=200')).filter(g => g.nummer >= 8000 && g.nummer < 9000)
const gb = { Hoog: gbList.find(g => g.nummer === 8000), Laag: gbList.find(g => g.nummer === 8110), Geen: gbList.find(g => g.nummer === 8199) }

// 5. SS relaties ophalen
const ssRels = []
for (let skip = 0; skip < 20000; skip += 100) {
  const c = await ssGet(`/relaties?$top=100&$skip=${skip}`)
  if (!Array.isArray(c) || c.length === 0) break
  ssRels.push(...c); if (c.length < 100) break
}

for (const factuurnummer of ['F-2026-00170', 'F-2026-00176']) {
  const { data: f } = await supabase
    .from('facturen')
    .select('id, factuurnummer, datum, vervaldatum, onderwerp, regels:factuur_regels(omschrijving, aantal, prijs, btw_percentage), relatie:relaties(id, bedrijfsnaam, email, adres, postcode, plaats, contactpersoon, snelstart_relatie_id)')
    .eq('administratie_id', adminId).eq('factuurnummer', factuurnummer).single()

  if (!f || !f.relatie) { console.log(`${factuurnummer}: geen relatie`); continue }
  if (!f.regels || f.regels.length === 0) { console.log(`${factuurnummer}: geen regels`); continue }

  let ssRelatieId = f.relatie.snelstart_relatie_id
  if (!ssRelatieId) {
    const email = (f.relatie.email || '').toLowerCase().trim()
    const m = (email && ssRels.find(r => (r.email || '').toLowerCase().trim() === email))
      || ssRels.find(r => (r.naam || '').toLowerCase().trim() === f.relatie.bedrijfsnaam.toLowerCase().trim())
    if (m) ssRelatieId = m.id
  }
  if (!ssRelatieId) {
    // Aanmaken in SS
    const naam = f.relatie.bedrijfsnaam.length > 50 ? f.relatie.bedrijfsnaam.slice(0, 50).trim() : f.relatie.bedrijfsnaam
    const body = { relatiesoort: ['Klant'], naam }
    if (f.relatie.email) body.email = f.relatie.email
    if (f.relatie.adres || f.relatie.postcode || f.relatie.plaats) {
      body.vestigingsAdres = {
        contactpersoon: f.relatie.contactpersoon || undefined,
        straat: f.relatie.adres || undefined,
        postcode: f.relatie.postcode || undefined,
        plaats: f.relatie.plaats || undefined,
        landISOCode: 'NL',
      }
    }
    const nieuw = await ssPost('/relaties', body)
    ssRelatieId = nieuw.id
    await supabase.from('relaties').update({ snelstart_relatie_id: ssRelatieId }).eq('id', f.relatie.id)
    console.log(`  ${factuurnummer}: SS relatie ${naam} aangemaakt (${ssRelatieId})`)
  }

  let total = 0
  const btwMap = {}
  const regels = f.regels.map(r => {
    const excl = Number(r.aantal) * Number(r.prijs)
    const pct = Number(r.btw_percentage)
    const btwBedrag = excl * pct / 100
    total += excl + btwBedrag
    const soort = pct === 21 ? 'Hoog' : pct === 9 ? 'Laag' : 'Geen'
    const vs = pct === 21 ? 'VerkopenHoog' : pct === 9 ? 'VerkopenLaag' : null
    if (vs) btwMap[vs] = (btwMap[vs] || 0) + btwBedrag
    return { omschrijving: String(r.omschrijving).slice(0, 200), bedrag: Number(excl.toFixed(2)), grootboek: { id: gb[soort].id }, btwSoort: soort }
  })
  const btw = Object.entries(btwMap).map(([btwSoort, b]) => ({ btwSoort, btwBedrag: Number(b.toFixed(2)) }))

  const boeking = await ssPost('/verkoopboekingen', {
    factuurNummer: f.factuurnummer,
    factuurDatum: f.datum,
    boekingsDatum: f.datum,
    vervalDatum: f.vervaldatum || f.datum,
    factuurBedrag: Number(total.toFixed(2)),
    omschrijving: (f.onderwerp || f.factuurnummer).slice(0, 200),
    klant: { id: ssRelatieId },
    boekingsregels: regels,
    btw,
  })
  await supabase.from('facturen').update({
    snelstart_boeking_id: boeking.id,
    snelstart_synced_at: new Date().toISOString(),
  }).eq('id', f.id)
  console.log(`  ✓ ${factuurnummer} gepusht (€${total.toFixed(2)}) naar ${f.relatie.bedrijfsnaam}`)
}
