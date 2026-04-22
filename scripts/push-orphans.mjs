// Push alle orphan CRM facturen naar SnelStart — reproduceert de prod push-logica lokaal
// zodat we errors kunnen zien.
import { createSupabaseAdmin } from './db.mjs'

const supabase = await createSupabaseAdmin()
const { data: admin } = await supabase.from('administraties').select('id').ilike('naam', '%Rebu%').single()
const adminId = admin.id

// 1. SnelStart token
const auth = await fetch('https://auth.snelstart.nl/b2b/token', {
  method: 'POST',
  headers: { 'Ocp-Apim-Subscription-Key': process.env.SNELSTART_SUBSCRIPTION_KEY, 'Content-Type': 'application/x-www-form-urlencoded' },
  body: new URLSearchParams({ grant_type: 'clientkey', clientkey: process.env.SNELSTART_CLIENT_KEY }),
}).then(r => r.json())
if (!auth.access_token) { console.error('Auth failed:', auth); process.exit(1) }
const token = auth.access_token
const headers = { Authorization: `Bearer ${token}`, 'Ocp-Apim-Subscription-Key': process.env.SNELSTART_SUBSCRIPTION_KEY, 'Content-Type': 'application/json', Accept: 'application/json' }

async function ssGet(path) {
  const r = await fetch(`https://b2bapi.snelstart.nl/v2${path}`, { headers })
  if (!r.ok) throw new Error(`GET ${path} ${r.status}: ${await r.text()}`)
  return r.json()
}
async function ssPost(path, body) {
  const r = await fetch(`https://b2bapi.snelstart.nl/v2${path}`, { method: 'POST', headers, body: JSON.stringify(body) })
  const txt = await r.text()
  if (!r.ok) throw new Error(`POST ${path} ${r.status}: ${txt}`)
  return JSON.parse(txt)
}

// 2. Huidige SS factuurnummers ophalen
const ssNummers = new Set()
for (let skip = 0; skip < 20000; skip += 100) {
  const list = await ssGet(`/verkoopfacturen?$top=100&$skip=${skip}`)
  if (!Array.isArray(list) || list.length === 0) break
  for (const f of list) if (f.factuurnummer) ssNummers.add(f.factuurnummer)
  if (list.length < 100) break
}
console.log(`SnelStart heeft ${ssNummers.size} facturen`)

// 3. Grootboeken ophalen
const grootboeken = await ssGet('/grootboeken?$top=200')
const omzet = grootboeken.filter(g => g.nummer >= 8000 && g.nummer < 9000)
const gb = {
  Hoog: omzet.find(g => g.nummer === 8000) || omzet.find(g => g.btwSoort === 'Hoog'),
  Laag: omzet.find(g => g.nummer === 8110) || omzet.find(g => g.btwSoort === 'Laag'),
  Geen: omzet.find(g => g.nummer === 8199) || omzet.find(g => g.btwSoort === 'Geen'),
}
console.log('Grootboeken:', { Hoog: gb.Hoog?.nummer, Laag: gb.Laag?.nummer, Geen: gb.Geen?.nummer })

// 4. CRM orphans bepalen
const { data: crm } = await supabase
  .from('facturen')
  .select('id, factuurnummer, datum, vervaldatum, totaal, status, onderwerp, relatie_id, snelstart_boeking_id, regels:factuur_regels(id, omschrijving, aantal, prijs, btw_percentage), relatie:relaties(id, bedrijfsnaam, email, adres, postcode, plaats, contactpersoon, snelstart_relatie_id)')
  .eq('administratie_id', adminId)

const orphans = crm.filter(f => {
  if (ssNummers.has(f.factuurnummer)) return false
  if (f.snelstart_boeking_id) return false
  if (['concept', 'gecrediteerd', 'geannuleerd'].includes(f.status)) return false
  if (['verzonden', 'deels_betaald', 'vervallen'].includes(f.status)) return true
  if (f.status === 'betaald') {
    const m = f.factuurnummer.match(/^F-(\d{4})-0*(\d+)$/)
    if (!m) return false
    const jaar = parseInt(m[1]), nr = parseInt(m[2])
    return jaar > 2026 || (jaar === 2026 && nr >= 166)
  }
  return false
})
console.log(`Te pushen: ${orphans.length} facturen`)

let gepusht = 0
const errors = []
for (const f of orphans) {
  try {
    if (!f.relatie) { errors.push(`${f.factuurnummer}: geen relatie`); continue }
    if (!f.regels || f.regels.length === 0) { errors.push(`${f.factuurnummer}: geen regels`); continue }

    // Relatie: opzoeken of aanmaken in SS
    let ssRelatieId = f.relatie.snelstart_relatie_id
    if (!ssRelatieId) {
      if (!globalThis.__ssRels) {
        const allRel = []
        for (let skip = 0; skip < 20000; skip += 100) {
          const chunk = await ssGet(`/relaties?$top=100&$skip=${skip}`)
          if (!Array.isArray(chunk) || chunk.length === 0) break
          allRel.push(...chunk)
          if (chunk.length < 100) break
        }
        globalThis.__ssRels = allRel
      }
      const allRel = globalThis.__ssRels
      if (f.relatie.email) {
        const m = allRel.find(r => (r.email || '').toLowerCase().trim() === f.relatie.email.toLowerCase().trim())
        if (m) ssRelatieId = m.id
      }
      if (!ssRelatieId) {
        const m = allRel.find(r => (r.naam || '').toLowerCase().trim() === f.relatie.bedrijfsnaam.toLowerCase().trim())
        if (m) ssRelatieId = m.id
      }
    }
    if (!ssRelatieId) {
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
      const nieuweRel = await ssPost('/relaties', body)
      ssRelatieId = nieuweRel.id
      await supabase.from('relaties').update({ snelstart_relatie_id: ssRelatieId }).eq('id', f.relatie.id)
    }

    // Boeking opbouwen
    let factuurBedragIncl = 0
    const btwMap = {}
    const boekingsregels = f.regels.map(r => {
      const excl = Number(r.aantal) * Number(r.prijs)
      const pct = Number(r.btw_percentage)
      const btwBedrag = excl * pct / 100
      factuurBedragIncl += excl + btwBedrag
      const soort = pct === 21 ? 'Hoog' : pct === 9 ? 'Laag' : 'Geen'
      const verkoopSoort = pct === 21 ? 'VerkopenHoog' : pct === 9 ? 'VerkopenLaag' : null
      if (verkoopSoort) btwMap[verkoopSoort] = (btwMap[verkoopSoort] || 0) + btwBedrag
      return {
        omschrijving: String(r.omschrijving).slice(0, 200),
        bedrag: Number(excl.toFixed(2)),
        grootboek: { id: gb[soort].id },
        btwSoort: soort,
      }
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

    const boeking = await ssPost('/verkoopboekingen', body)
    await supabase.from('facturen').update({
      snelstart_boeking_id: boeking.id,
      snelstart_synced_at: new Date().toISOString(),
    }).eq('id', f.id)
    gepusht++
    console.log(`  ✓ ${f.factuurnummer} (€${factuurBedragIncl.toFixed(2)})`)
  } catch (err) {
    errors.push(`${f.factuurnummer}: ${err instanceof Error ? err.message : String(err)}`)
    console.log(`  ✗ ${f.factuurnummer}: ${err instanceof Error ? err.message.slice(0, 200) : err}`)
  }
}

console.log(`\nGepusht: ${gepusht}, fouten: ${errors.length}`)
if (errors.length) console.log('Fouten:\n', errors.join('\n'))
