import { createSupabaseAdmin } from './db.mjs'
const sb = await createSupabaseAdmin()
const { data: admin } = await sb.from('administraties').select('id').ilike('naam', '%Rebu%').single()

const alle = []
let from = 0
while (true) {
  const { data } = await sb.from('projecten')
    .select('id, naam, relatie_id, status, bron, budget, created_at')
    .eq('administratie_id', admin.id).range(from, from + 999)
  if (!data || data.length === 0) break
  alle.push(...data); from += 1000
}

function norm(s) { return (s || '').toLowerCase().replace(/^re:\s*|^fw:\s*|^fwd:\s*/i, '').replace(/\s+/g, ' ').trim() }

const grp = new Map()
for (const p of alle) {
  const k = norm(p.naam) + '|' + (p.relatie_id || 'geen')
  if (!k || k.length < 5) continue
  if (!grp.has(k)) grp.set(k, [])
  grp.get(k).push(p)
}

let verwijderd = 0
for (const [, groep] of grp) {
  if (groep.length <= 1) continue
  // Behoud: actieve status eerst, dan oudste
  groep.sort((a, b) => {
    const prio = { actief: 0, gewonnen: 0, on_hold: 1, afgerond: 2, geannuleerd: 3, verloren: 3, vervallen: 3 }
    const ap = prio[a.status] ?? 4, bp = prio[b.status] ?? 4
    if (ap !== bp) return ap - bp
    return new Date(a.created_at) - new Date(b.created_at)
  })
  const keep = groep[0]
  for (const dup of groep.slice(1)) {
    // Verhuis offertes/taken/facturen/emails etc naar keep
    await sb.from('offertes').update({ project_id: keep.id }).eq('project_id', dup.id)
    await sb.from('taken').update({ project_id: keep.id }).eq('project_id', dup.id)
    await sb.from('emails').update({ project_id: keep.id }).eq('project_id', dup.id)
    const { error } = await sb.from('projecten').delete().eq('id', dup.id)
    if (error) console.error('Delete fout', dup.naam, ':', error.message)
    else verwijderd++
  }
  if (verwijderd % 50 === 0 && verwijderd > 0) console.log(`  voortgang: ${verwijderd} verwijderd`)
}

const { count } = await sb.from('projecten').select('id', { count: 'exact', head: true }).eq('administratie_id', admin.id)
console.log(`\nVerkoopkansen duplicaten verwijderd: ${verwijderd}`)
console.log(`Verkoopkansen nu: ${count}`)
