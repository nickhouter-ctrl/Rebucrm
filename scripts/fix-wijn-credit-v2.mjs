import { createSupabaseAdmin } from './db.mjs'
const sb = await createSupabaseAdmin()
const { data: admin } = await sb.from('administraties').select('id').ilike('naam', '%Rebu%').single()
const adminId = admin.id

const apiKey = (process.env.SNELSTART_SUBSCRIPTION_KEY || '').trim()
const clientKey = (process.env.SNELSTART_CLIENT_KEY || '').trim()
const authResp = await fetch('https://auth.snelstart.nl/b2b/token', {
  method: 'POST',
  headers: { 'Ocp-Apim-Subscription-Key': apiKey, 'Content-Type': 'application/x-www-form-urlencoded' },
  body: new URLSearchParams({ grant_type: 'clientkey', clientkey: clientKey }),
}).then(r => r.json())
const token = authResp.access_token
const hdrs = { Authorization: `Bearer ${token}`, 'Ocp-Apim-Subscription-Key': apiKey, 'Content-Type': 'application/json', Accept: 'application/json' }

// Zoek origineel in SS en koppel snelstart_boeking_id
const list = await fetch(`https://b2bapi.snelstart.nl/v2/verkoopfacturen?$filter=${encodeURIComponent(`factuurnummer eq 'F-2025-00401'`)}&$top=1`, { headers: hdrs }).then(r => r.json())
console.log('SS lookup:', list?.[0])
if (list && list[0]?.verkoopBoeking?.id) {
  await sb.from('facturen').update({ snelstart_boeking_id: list[0].verkoopBoeking.id, snelstart_synced_at: new Date().toISOString() }).eq('factuurnummer', 'F-2025-00401')
  console.log(`✓ Origineel al in SS, gekoppeld: ${list[0].verkoopBoeking.id}`)
}

// Haal origineel
const { data: orig } = await sb.from('facturen').select('*, relatie:relaties(*), regels:factuur_regels(*)').eq('factuurnummer', 'F-2025-00401').single()

// Maak credit
const { data: nr } = await sb.rpc('volgende_nummer', { p_administratie_id: adminId, p_type: 'factuur' })
const vandaag = new Date().toISOString().slice(0, 10)
const { data: credit, error } = await sb.from('facturen').insert({
  administratie_id: adminId,
  factuurnummer: nr,
  datum: vandaag, vervaldatum: vandaag,
  onderwerp: `Creditnota ${orig.factuurnummer}`,
  status: 'verzonden', factuur_type: 'credit',
  relatie_id: orig.relatie_id, order_id: orig.order_id, offerte_id: orig.offerte_id,
  gerelateerde_factuur_id: orig.id,
  subtotaal: -Math.abs(Number(orig.subtotaal || 0)),
  btw_totaal: -Math.abs(Number(orig.btw_totaal || 0)),
  totaal: -Math.abs(Number(orig.totaal || 0)),
}).select('id, factuurnummer').single()
if (error) { console.error('insert:', error.message); process.exit(1) }
console.log(`Credit aangemaakt: ${credit.factuurnummer}`)

await sb.from('factuur_regels').insert((orig.regels || []).map(r => ({
  factuur_id: credit.id,
  omschrijving: `Credit: ${r.omschrijving}`,
  aantal: Number(r.aantal),
  prijs: -Math.abs(Number(r.prijs)),
  btw_percentage: r.btw_percentage,
  totaal: -Math.abs(Number(r.aantal) * Number(r.prijs)),
  volgorde: r.volgorde || 0,
})))

// Push credit naar SS
const gbs = (await fetch('https://b2bapi.snelstart.nl/v2/grootboeken?$top=200', { headers: hdrs }).then(r => r.json())).filter(g => g.nummer >= 8000 && g.nummer < 9000)
const gb = { Hoog: gbs.find(g => g.nummer === 8000), Laag: gbs.find(g => g.nummer === 8110), Geen: gbs.find(g => g.nummer === 8199) }

const ssRelId = orig.relatie.snelstart_relatie_id || list?.[0]?.relatie?.id
if (!ssRelId) { console.error('geen SS relatie'); process.exit(1) }

// BOE-0039: factuurBedrag moet EXACT gelijk zijn aan som(excl regels) + som(btw)
let totExcl = 0
const btwMap = {}
const regels = (orig.regels || []).map(r => {
  const excl = Number((-Math.abs(Number(r.aantal) * Number(r.prijs))).toFixed(2))
  const pct = Number(r.btw_percentage)
  const btw = Number((excl * pct / 100).toFixed(2))
  totExcl = Number((totExcl + excl).toFixed(2))
  const soort = pct === 21 ? 'Hoog' : pct === 9 ? 'Laag' : 'Geen'
  const vs = pct === 21 ? 'VerkopenHoog' : pct === 9 ? 'VerkopenLaag' : null
  if (vs) btwMap[vs] = Number(((btwMap[vs] || 0) + btw).toFixed(2))
  return { omschrijving: `Credit: ${r.omschrijving}`.slice(0, 200), bedrag: excl, grootboek: { id: gb[soort].id }, btwSoort: soort }
})
const totBtw = Object.values(btwMap).reduce((s, b) => Number((s + b).toFixed(2)), 0)
const totIncl = Number((totExcl + totBtw).toFixed(2))
const btw = Object.entries(btwMap).map(([btwSoort, b]) => ({ btwSoort, btwBedrag: b }))

const body = {
  factuurNummer: nr,
  factuurDatum: vandaag, boekingsDatum: vandaag, vervalDatum: vandaag,
  factuurBedrag: Number(totIncl.toFixed(2)),
  omschrijving: `Creditnota ${orig.factuurnummer}`.slice(0, 200),
  klant: { id: ssRelId },
  boekingsregels: regels, btw,
}
const r = await fetch('https://b2bapi.snelstart.nl/v2/verkoopboekingen', { method: 'POST', headers: hdrs, body: JSON.stringify(body) })
if (!r.ok) { console.error('push:', await r.text()); process.exit(1) }
const boeking = await r.json()
await sb.from('facturen').update({ snelstart_boeking_id: boeking.id, snelstart_synced_at: new Date().toISOString() }).eq('id', credit.id)
await sb.from('facturen').update({ status: 'gecrediteerd' }).eq('id', orig.id)
console.log(`✓ Credit gepusht: ${boeking.id}`)
