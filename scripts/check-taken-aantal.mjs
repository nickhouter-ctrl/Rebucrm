import { createSupabaseAdmin } from './db.mjs'
const sb = await createSupabaseAdmin()
const { data: admin } = await sb.from('administraties').select('id').ilike('naam', '%Rebu%').single()

const { count: totaal } = await sb.from('taken').select('id', { count: 'exact', head: true }).eq('administratie_id', admin.id)
console.log(`Totaal taken: ${totaal}`)

const { count: open } = await sb.from('taken').select('id', { count: 'exact', head: true }).eq('administratie_id', admin.id).neq('status', 'afgerond')
console.log(`Open (niet afgerond): ${open}`)

// Status verdeling
const { data } = await sb.from('taken').select('status').eq('administratie_id', admin.id).limit(10000)
const perStatus = {}
for (const t of data || []) perStatus[t.status] = (perStatus[t.status] || 0) + 1
console.log('Per status:', perStatus)

// Dubbele (zelfde titel+relatie+toegewezen)
const alle = []
let from = 0
while (true) {
  const { data: batch } = await sb.from('taken').select('id, titel, relatie_id, toegewezen_aan, status, created_at').eq('administratie_id', admin.id).range(from, from + 999)
  if (!batch || batch.length === 0) break
  alle.push(...batch); from += 1000
}
const grp = new Map()
for (const t of alle) {
  const k = `${t.titel}|${t.relatie_id || ''}|${t.toegewezen_aan || ''}`
  if (!grp.has(k)) grp.set(k, [])
  grp.get(k).push(t)
}
const dups = Array.from(grp.values()).filter(g => g.length > 1)
console.log(`Dubbele taken-groepen: ${dups.length}, samen ${dups.reduce((s, g) => s + g.length - 1, 0)} duplicaten`)
