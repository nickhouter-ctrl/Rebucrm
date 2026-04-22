// Verwijdert lege (€0) SnelStart boekingen en pusht opnieuw
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

async function ssGet(path) {
  const r = await fetch(`https://b2bapi.snelstart.nl/v2${path}`, { headers })
  if (!r.ok) throw new Error(`GET ${path} ${r.status}: ${await r.text()}`)
  return r.json()
}
async function ssPost(path, body) {
  const r = await fetch(`https://b2bapi.snelstart.nl/v2${path}`, { method: 'POST', headers, body: JSON.stringify(body) })
  if (!r.ok) throw new Error(`POST ${path} ${r.status}: ${await r.text()}`)
  return r.json()
}
async function ssDelete(path) {
  const r = await fetch(`https://b2bapi.snelstart.nl/v2${path}`, { method: 'DELETE', headers })
  if (!r.ok) throw new Error(`DELETE ${path} ${r.status}: ${await r.text()}`)
}

// Lijst van facturen die €0 in SS hebben maar totaal>0 in CRM
const TE_FIXEN = ['F-2026-00167', 'F-2026-00168']

// Haal alle SS verkoopfacturen + grootboeken
const ssFacturen = []
for (let skip = 0; skip < 20000; skip += 100) {
  const list = await ssGet(`/verkoopfacturen?$top=100&$skip=${skip}`)
  if (!Array.isArray(list) || list.length === 0) break
  ssFacturen.push(...list)
  if (list.length < 100) break
}

const grootboeken = await ssGet('/grootboeken?$top=200')
const omzet = grootboeken.filter(g => g.nummer >= 8000 && g.nummer < 9000)
const gb = {
  Hoog: omzet.find(g => g.nummer === 8000),
  Laag: omzet.find(g => g.nummer === 8110),
  Geen: omzet.find(g => g.nummer === 8199),
}

for (const factuurnummer of TE_FIXEN) {
  // Vind SS factuur
  const ssF = ssFacturen.find(v => v.factuurnummer === factuurnummer)
  if (!ssF) { console.log(`${factuurnummer}: niet in SS gevonden`); continue }

  // Verwijder de boeking in SS
  const boekingId = ssF.verkoopBoeking?.id
  if (boekingId) {
    try {
      await ssDelete(`/verkoopboekingen/${boekingId}`)
      console.log(`  ${factuurnummer}: SS boeking ${boekingId} verwijderd`)
    } catch (err) {
      console.log(`  ${factuurnummer}: delete faalde: ${err.message}`)
      continue
    }
  }

  // Reset CRM snelstart velden + hergebruik push via bestaande logic
  await supabase.from('facturen').update({ snelstart_boeking_id: null, snelstart_synced_at: null })
    .eq('administratie_id', adminId).eq('factuurnummer', factuurnummer)

  // Haal CRM factuur op en push
  const { data: f } = await supabase
    .from('facturen')
    .select('id, factuurnummer, datum, vervaldatum, onderwerp, relatie_id, regels:factuur_regels(omschrijving, aantal, prijs, btw_percentage), relatie:relaties(id, bedrijfsnaam, email, adres, postcode, plaats, contactpersoon, snelstart_relatie_id)')
    .eq('administratie_id', adminId)
    .eq('factuurnummer', factuurnummer)
    .single()

  if (!f || !f.relatie || !f.regels || f.regels.length === 0) {
    console.log(`  ${factuurnummer}: kan niet pushen (geen relatie of regels)`)
    continue
  }

  // Relatie id (al gekoppeld)
  let ssRelatieId = f.relatie.snelstart_relatie_id
  if (!ssRelatieId) {
    // Cache nodig
    if (!globalThis.__allRel) {
      const rels = []
      for (let skip = 0; skip < 20000; skip += 100) {
        const chunk = await ssGet(`/relaties?$top=100&$skip=${skip}`)
        if (!Array.isArray(chunk) || chunk.length === 0) break
        rels.push(...chunk)
        if (chunk.length < 100) break
      }
      globalThis.__allRel = rels
    }
    const email = (f.relatie.email || '').toLowerCase().trim()
    const m = globalThis.__allRel.find(r => (r.email || '').toLowerCase().trim() === email)
      || globalThis.__allRel.find(r => (r.naam || '').toLowerCase().trim() === f.relatie.bedrijfsnaam.toLowerCase().trim())
    if (m) ssRelatieId = m.id
  }
  if (!ssRelatieId) { console.log(`  ${factuurnummer}: geen SS relatie`); continue }

  let factuurBedragIncl = 0
  const btwMap = {}
  const boekingsregels = f.regels.map(r => {
    const excl = Number(r.aantal) * Number(r.prijs)
    const pct = Number(r.btw_percentage)
    const btwBedrag = excl * pct / 100
    factuurBedragIncl += excl + btwBedrag
    const soort = pct === 21 ? 'Hoog' : pct === 9 ? 'Laag' : 'Geen'
    const vs = pct === 21 ? 'VerkopenHoog' : pct === 9 ? 'VerkopenLaag' : null
    if (vs) btwMap[vs] = (btwMap[vs] || 0) + btwBedrag
    return { omschrijving: String(r.omschrijving).slice(0, 200), bedrag: Number(excl.toFixed(2)), grootboek: { id: gb[soort].id }, btwSoort: soort }
  })
  const btw = Object.entries(btwMap).map(([btwSoort, b]) => ({ btwSoort, btwBedrag: Number(b.toFixed(2)) }))

  const body = {
    factuurNummer: f.factuurnummer,
    factuurDatum: f.datum,
    boekingsDatum: f.datum,
    vervalDatum: f.vervaldatum || f.datum,
    factuurBedrag: Number(factuurBedragIncl.toFixed(2)),
    omschrijving: (f.onderwerp || f.factuurnummer).slice(0, 200),
    klant: { id: ssRelatieId },
    boekingsregels,
    btw,
  }

  try {
    const boeking = await ssPost('/verkoopboekingen', body)
    await supabase.from('facturen').update({
      snelstart_boeking_id: boeking.id,
      snelstart_synced_at: new Date().toISOString(),
    }).eq('id', f.id)
    console.log(`  ✓ ${factuurnummer} opnieuw gepusht (€${factuurBedragIncl.toFixed(2)})`)
  } catch (err) {
    console.log(`  ✗ ${factuurnummer}: ${err.message.slice(0, 300)}`)
  }
}
