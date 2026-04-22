import fs from 'fs'
for (const line of fs.readFileSync('.env.local', 'utf-8').split('\n')) {
  const m = line.match(/^([^#=]+)=(.*)$/); if (m) process.env[m[1].trim()] = m[2].trim().replace(/^["']|["']$/g, '')
}
const auth = await fetch('https://auth.snelstart.nl/b2b/token', {
  method: 'POST',
  headers: { 'Ocp-Apim-Subscription-Key': process.env.SNELSTART_SUBSCRIPTION_KEY, 'Content-Type': 'application/x-www-form-urlencoded' },
  body: new URLSearchParams({ grant_type: 'clientkey', clientkey: process.env.SNELSTART_CLIENT_KEY }),
}).then(r => r.json())
const headers = { Authorization: `Bearer ${auth.access_token}`, 'Ocp-Apim-Subscription-Key': process.env.SNELSTART_SUBSCRIPTION_KEY }
const ss = []
for (let skip = 0; skip < 20000; skip += 100) {
  const r = await fetch(`https://b2bapi.snelstart.nl/v2/verkoopfacturen?$top=100&$skip=${skip}`, { headers }).then(r => r.json())
  if (!Array.isArray(r) || r.length === 0) break
  ss.push(...r); if (r.length < 100) break
}
const vandaag = new Date().toISOString().slice(0, 10)
const alleOpen = ss.filter(f => Math.abs(Number(f.openstaandSaldo || 0)) > 0.01)

console.log('\n=== Alle facturen met openstaandSaldo != 0 ===')
console.log('nr | openstaand | vervalDatum | boekingId')
let somPositief = 0, somVervallenInclNeg = 0, somVervallenExclNeg = 0
for (const f of alleOpen) {
  const vd = f.vervalDatum ? f.vervalDatum.slice(0, 10) : '-'
  const o = Number(f.openstaandSaldo || 0)
  const vervallen = vd !== '-' && vd < vandaag
  const mark = vervallen ? 'JA' : '  '
  console.log(`${mark} ${f.factuurnummer} | €${o.toFixed(2)} | ${vd}`)
  if (o > 0) somPositief += o
  if (vervallen) somVervallenInclNeg += o
  if (vervallen && o > 0) somVervallenExclNeg += o
}
console.log(`\nTotaal openstaand (alle, inclusief negatief): €${alleOpen.reduce((s,f)=>s+Number(f.openstaandSaldo),0).toFixed(2)}`)
console.log(`Totaal vervallen (incl negatief): €${somVervallenInclNeg.toFixed(2)}`)
console.log(`Totaal vervallen (alleen positief): €${somVervallenExclNeg.toFixed(2)}`)

// Nog specifiek voor F-2025-00064
const c = ss.find(f => f.factuurnummer === 'F-2025-00064')
if (c) {
  console.log(`\nF-2025-00064 (creditnota):`)
  console.log(`  vervalDatum: ${c.vervalDatum}`)
  console.log(`  openstaand: ${c.openstaandSaldo}`)
}

// Haal detail op voor F-2025-00432 om deels-betaald check te doen
for (const nr of ['F-2025-00432', 'F-2026-00155', 'F-2025-00064']) {
  const f = ss.find(x => x.factuurnummer === nr)
  if (!f || !f.verkoopBoeking?.id) continue
  const detail = await fetch(`https://b2bapi.snelstart.nl/v2/verkoopboekingen/${f.verkoopBoeking.id}`, { headers }).then(r => r.json())
  console.log(`\n${nr} detail keys:`, Object.keys(detail).join(', '))
  console.log(`  factuurBedrag: ${detail.factuurBedrag}`)
  console.log(`  openstaand/saldo fields:`, Object.keys(detail).filter(k => /open|saldo|betaal|bedrag/i.test(k)))
}
