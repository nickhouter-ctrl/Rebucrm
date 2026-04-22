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
const f = all.filter(f => ['verzonden', 'deels_betaald', 'vervallen'].includes(f.status)
  || (f.status === 'gecrediteerd' && Number(f.betaald_bedrag || 0) > Number(f.totaal || 0) + 0.01))
const open = f.reduce((s, f) => s + Number(f.totaal) - Number(f.betaald_bedrag || 0), 0)
console.log(`CRM openstaand: €${open.toFixed(2)} (${f.length} facturen)`)
