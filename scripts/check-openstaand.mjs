import { createSupabaseAdmin } from './db.mjs'
const sb = await createSupabaseAdmin()
const { data: admin } = await sb.from('administraties').select('id').ilike('naam', '%Rebu%').single()
const all = []
let from = 0
while (true) {
  const { data } = await sb.from('facturen').select('factuurnummer, totaal, betaald_bedrag, status').eq('administratie_id', admin.id).range(from, from + 999)
  if (!data || data.length === 0) break
  all.push(...data); from += 1000
}
const filtered = all.filter(f => !['concept', 'geannuleerd'].includes(f.status))
const open = filtered.reduce((s, f) => s + Number(f.totaal) - Number(f.betaald_bedrag || 0), 0)
console.log(`Openstaand (alle niet-concept/geannuleerd): €${open.toFixed(2)}`)
// Check welke facturen bijdragen
const nietNul = filtered.filter(f => Math.abs(Number(f.totaal) - Number(f.betaald_bedrag || 0)) > 0.01)
console.log(`Facturen met verschil: ${nietNul.length}`)
let som = 0
for (const f of nietNul.sort((a,b) => (Number(b.totaal)-Number(b.betaald_bedrag||0)) - (Number(a.totaal)-Number(a.betaald_bedrag||0)))) {
  const v = Number(f.totaal) - Number(f.betaald_bedrag || 0)
  som += v
  if (Math.abs(v) > 500) console.log(`  ${f.factuurnummer} ${f.status}: tot €${f.totaal} bet €${f.betaald_bedrag||0} → €${v.toFixed(2)}`)
}
