// Verkoopkansen waar alle offertes ouder dan 90 dagen zijn → status 'afgerond'
import { createSupabaseAdmin } from './db.mjs'
const sb = await createSupabaseAdmin()
const { data: admin } = await sb.from('administraties').select('id').ilike('naam', '%Rebu%').single()

const projs = []
let from = 0
while (true) {
  const { data } = await sb.from('projecten').select('id, status, created_at').eq('administratie_id', admin.id).eq('status', 'actief').range(from, from + 999)
  if (!data || data.length === 0) break
  projs.push(...data); from += 1000
}

const offertes = []
from = 0
while (true) {
  const { data } = await sb.from('offertes').select('project_id, datum, created_at, status').eq('administratie_id', admin.id).not('project_id', 'is', null).range(from, from + 999)
  if (!data || data.length === 0) break
  offertes.push(...data); from += 1000
}

const offByProj = new Map()
for (const o of offertes) {
  if (!offByProj.has(o.project_id)) offByProj.set(o.project_id, [])
  offByProj.get(o.project_id).push(o)
}

const DAG90 = 90 * 24 * 60 * 60 * 1000
const nu = Date.now()
let updated = 0
for (const p of projs) {
  const offs = offByProj.get(p.id) || []
  if (offs.length === 0) continue
  const meestRecent = Math.max(...offs.map(o => new Date(o.datum || o.created_at).getTime()))
  if (nu - meestRecent > DAG90) {
    await sb.from('projecten').update({ status: 'afgerond' }).eq('id', p.id)
    updated++
  }
}
console.log(`Verkoopkansen > 90 dagen oud → afgerond: ${updated}`)

const { count: actief } = await sb.from('projecten').select('id', { count: 'exact', head: true }).eq('administratie_id', admin.id).eq('status', 'actief')
console.log(`Actieve verkoopkansen nu: ${actief}`)
