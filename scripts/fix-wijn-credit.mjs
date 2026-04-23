import { createSupabaseAdmin } from './db.mjs'
const sb = await createSupabaseAdmin()
const { data: admin } = await sb.from('administraties').select('id').ilike('naam', '%Rebu%').single()
const adminId = admin.id

// 1. Origineel
const { data: orig } = await sb.from('facturen')
  .select('*, relatie:relaties(*), regels:factuur_regels(*)')
  .eq('factuurnummer', 'F-2025-00401').single()
console.log(`Origineel: ${orig.factuurnummer} status=${orig.status} €${orig.totaal}`)

// 2. Zet terug naar 'verzonden' zodat push kan
await sb.from('facturen').update({ status: 'verzonden', snelstart_synced_at: null }).eq('id', orig.id)

// 3. Push origineel naar SnelStart via raw Mollie-style direct call
const apiKey = (process.env.SNELSTART_SUBSCRIPTION_KEY || '').trim()
const clientKey = (process.env.SNELSTART_CLIENT_KEY || '').trim()

const authResp = await fetch('https://auth.snelstart.nl/b2b/token', {
  method: 'POST',
  headers: { 'Ocp-Apim-Subscription-Key': apiKey, 'Content-Type': 'application/x-www-form-urlencoded' },
  body: new URLSearchParams({ grant_type: 'clientkey', clientkey: clientKey }),
}).then(r => r.json())
const token = authResp.access_token
const ssHeaders = { Authorization: `Bearer ${token}`, 'Ocp-Apim-Subscription-Key': apiKey, 'Content-Type': 'application/json', Accept: 'application/json' }

async function ssGet(p) { const r = await fetch(`https://b2bapi.snelstart.nl/v2${p}`, { headers: ssHeaders }); if (!r.ok) throw new Error(`${p} ${r.status}`); return r.json() }
async function ssPost(p, b) { const r = await fetch(`https://b2bapi.snelstart.nl/v2${p}`, { method: 'POST', headers: ssHeaders, body: JSON.stringify(b) }); if (!r.ok) throw new Error(`${p} ${r.status}: ${await r.text()}`); return r.json() }

const gbs = (await ssGet('/grootboeken?$top=200')).filter(g => g.nummer >= 8000 && g.nummer < 9000)
const gb = { Hoog: gbs.find(g => g.nummer === 8000), Laag: gbs.find(g => g.nummer === 8110), Geen: gbs.find(g => g.nummer === 8199) }

// Relatie zoeken / aanmaken
const relatie = orig.relatie
let ssRelId = relatie.snelstart_relatie_id
if (!ssRelId) {
  const allRels = []
  for (let skip = 0; skip < 20000; skip += 100) {
    const chunk = await ssGet(`/relaties?$top=100&$skip=${skip}`)
    if (!Array.isArray(chunk) || chunk.length === 0) break
    allRels.push(...chunk)
    if (chunk.length < 100) break
  }
  const found = allRels.find(r => (r.email || '').toLowerCase() === (relatie.email || '').toLowerCase())
    || allRels.find(r => (r.naam || '').toLowerCase() === relatie.bedrijfsnaam.toLowerCase())
  if (found) ssRelId = found.id
  else {
    const body = { relatiesoort: ['Klant'], naam: relatie.bedrijfsnaam.slice(0, 50) }
    if (relatie.email) body.email = relatie.email
    const nieuw = await ssPost('/relaties', body)
    ssRelId = nieuw.id
  }
  await sb.from('relaties').update({ snelstart_relatie_id: ssRelId }).eq('id', relatie.id)
}
console.log(`SS relatie: ${ssRelId}`)

// Push origineel
function bouwBoeking(factuur, isCredit = false) {
  const regels = factuur.regels || []
  const sign = isCredit ? -1 : 1
  let totIncl = 0
  const btwMap = {}
  const boekingsregels = regels.map(r => {
    const excl = Math.abs(Number(r.aantal) * Number(r.prijs)) * sign
    const pct = Number(r.btw_percentage)
    const btw = excl * pct / 100
    totIncl += excl + btw
    const soort = pct === 21 ? 'Hoog' : pct === 9 ? 'Laag' : 'Geen'
    const vs = pct === 21 ? 'VerkopenHoog' : pct === 9 ? 'VerkopenLaag' : null
    if (vs) btwMap[vs] = (btwMap[vs] || 0) + btw
    return {
      omschrijving: String(r.omschrijving).slice(0, 200),
      bedrag: Number(excl.toFixed(2)),
      grootboek: { id: gb[soort].id },
      btwSoort: soort,
    }
  })
  const btw = Object.entries(btwMap).map(([btwSoort, b]) => ({ btwSoort, btwBedrag: Number(b.toFixed(2)) }))
  return {
    factuurNummer: factuur.factuurnummer,
    factuurDatum: factuur.datum,
    boekingsDatum: factuur.datum,
    vervalDatum: factuur.vervaldatum || factuur.datum,
    factuurBedrag: Number(totIncl.toFixed(2)),
    omschrijving: (factuur.onderwerp || factuur.factuurnummer).slice(0, 200),
    klant: { id: ssRelId },
    boekingsregels,
    btw,
  }
}

try {
  const boeking1 = await ssPost('/verkoopboekingen', bouwBoeking(orig))
  await sb.from('facturen').update({ snelstart_boeking_id: boeking1.id, snelstart_synced_at: new Date().toISOString() }).eq('id', orig.id)
  console.log(`✓ Origineel gepusht: ${boeking1.id}`)
} catch (e) { console.log(`✗ Origineel push: ${e.message.slice(0, 200)}`) }

// 4. Maak credit-factuur (negatief)
const { data: nieuwNr } = await sb.rpc('volgende_nummer', { p_administratie_id: adminId, p_type: 'factuur' })
console.log(`Credit-factuurnummer: ${nieuwNr}`)
const vandaag = new Date().toISOString().slice(0, 10)
const negSub = -Number(orig.subtotaal || 0), negBtw = -Number(orig.btw_totaal || 0), negTot = -Number(orig.totaal || 0)
const { data: credit, error: credErr } = await sb.from('facturen').insert({
  administratie_id: adminId,
  factuurnummer: nieuwNr,
  datum: vandaag,
  vervaldatum: vandaag,
  onderwerp: `Creditnota ${orig.factuurnummer}`,
  status: 'verzonden',
  factuur_type: 'credit',
  relatie_id: orig.relatie_id,
  order_id: orig.order_id,
  offerte_id: orig.offerte_id,
  gerelateerde_factuur_id: orig.id,
  subtotaal: negSub, btw_totaal: negBtw, totaal: negTot,
}).select('id, factuurnummer, datum, vervaldatum, onderwerp').single()
if (credErr) { console.error('Credit insert ERR:', credErr.message); process.exit(1) }

await sb.from('factuur_regels').insert((orig.regels || []).map(r => ({
  factuur_id: credit.id,
  omschrijving: `Credit: ${r.omschrijving}`,
  aantal: Number(r.aantal),
  prijs: -Math.abs(Number(r.prijs)),
  btw_percentage: r.btw_percentage,
  totaal: -Math.abs(Number(r.aantal) * Number(r.prijs)),
  volgorde: r.volgorde || 0,
})))

// Get regels voor credit push
const { data: creditMetRegels } = await sb.from('facturen').select('*, regels:factuur_regels(*)').eq('id', credit.id).single()
try {
  const boeking2 = await ssPost('/verkoopboekingen', bouwBoeking(creditMetRegels))
  await sb.from('facturen').update({ snelstart_boeking_id: boeking2.id, snelstart_synced_at: new Date().toISOString() }).eq('id', credit.id)
  console.log(`✓ Credit gepusht: ${boeking2.id}`)
} catch (e) { console.log(`✗ Credit push: ${e.message.slice(0, 200)}`) }

// 5. Origineel weer op 'gecrediteerd'
await sb.from('facturen').update({ status: 'gecrediteerd' }).eq('id', orig.id)
console.log('Klaar')
