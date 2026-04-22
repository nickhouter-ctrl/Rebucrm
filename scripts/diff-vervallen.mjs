import { createSupabaseAdmin } from './db.mjs'
const sb = await createSupabaseAdmin()
const { data: admin } = await sb.from('administraties').select('id').ilike('naam', '%Rebu%').single()

const auth = await fetch('https://auth.snelstart.nl/b2b/token', {
  method: 'POST',
  headers: { 'Ocp-Apim-Subscription-Key': process.env.SNELSTART_SUBSCRIPTION_KEY, 'Content-Type': 'application/x-www-form-urlencoded' },
  body: new URLSearchParams({ grant_type: 'clientkey', clientkey: process.env.SNELSTART_CLIENT_KEY }),
}).then(r => r.json())

const ss = []
for (let skip = 0; skip < 20000; skip += 100) {
  const r = await fetch(`https://b2bapi.snelstart.nl/v2/verkoopfacturen?$top=100&$skip=${skip}`, {
    headers: { Authorization: `Bearer ${auth.access_token}`, 'Ocp-Apim-Subscription-Key': process.env.SNELSTART_SUBSCRIPTION_KEY }
  }).then(r => r.json())
  if (!Array.isArray(r) || r.length === 0) break
  ss.push(...r); if (r.length < 100) break
}

const vandaag = new Date().toISOString().slice(0, 10)
const open = ss.filter(f => Number(f.openstaandSaldo || 0) > 0.01)

console.log(`SS facturen met openstaand > 0: ${open.length}`)
console.log('factuurnummer | openstaand | vervaldatum | vervallen (vandaag ' + vandaag + ')')
for (const f of open) {
  const vd = f.vervalDatum ? f.vervalDatum.slice(0, 10) : '-'
  const vervallen = vd !== '-' && vd < vandaag ? 'JA' : 'nee'
  console.log(`  ${f.factuurnummer} | €${f.openstaandSaldo} | ${vd} | ${vervallen}`)
}
const vervallenSom = open.filter(f => f.vervalDatum && f.vervalDatum.slice(0,10) < vandaag).reduce((s, f) => s + Number(f.openstaandSaldo || 0), 0)
console.log(`SS vervallen totaal (mijn berekening): €${vervallenSom.toFixed(2)}`)
