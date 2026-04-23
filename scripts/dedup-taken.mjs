import { createSupabaseAdmin } from './db.mjs'
const sb = await createSupabaseAdmin()
const { data: admin } = await sb.from('administraties').select('id').ilike('naam', '%Rebu%').single()

const alle = []
let from = 0
while (true) {
  const { data } = await sb.from('taken')
    .select('id, titel, relatie_id, toegewezen_aan, status, deadline, created_at')
    .eq('administratie_id', admin.id).range(from, from + 999)
  if (!data || data.length === 0) break
  alle.push(...data); from += 1000
}

const grp = new Map()
for (const t of alle) {
  const k = `${(t.titel || '').trim()}|${t.relatie_id || ''}|${t.toegewezen_aan || ''}`
  if (!grp.has(k)) grp.set(k, [])
  grp.get(k).push(t)
}

let verwijderd = 0
for (const [, groep] of grp) {
  if (groep.length <= 1) continue
  // Sorteer: behoud taak met status afgerond (belangrijk voor historie), anders oudste
  groep.sort((a, b) => {
    const aAfgerond = a.status === 'afgerond' ? 0 : 1
    const bAfgerond = b.status === 'afgerond' ? 0 : 1
    if (aAfgerond !== bAfgerond) return aAfgerond - bAfgerond
    return new Date(a.created_at) - new Date(b.created_at)
  })
  const keep = groep[0]
  const remove = groep.slice(1).map(t => t.id)
  // Verhuis taak_notities naar behouden taak
  for (const id of remove) {
    await sb.from('taak_notities').update({ taak_id: keep.id }).eq('taak_id', id)
  }
  const { error } = await sb.from('taken').delete().in('id', remove)
  if (error) console.error('Delete fout:', error.message)
  else verwijderd += remove.length
  if (verwijderd % 500 === 0) console.log(`  voortgang: ${verwijderd} verwijderd`)
}

const { count } = await sb.from('taken').select('id', { count: 'exact', head: true }).eq('administratie_id', admin.id)
console.log(`\nDuplicaten verwijderd: ${verwijderd}`)
console.log(`Taken nu: ${count}`)
