// Substring match binnen zelfde relatie: "ref nijbroek" ⊂ "nijbroek" etc.
import { createSupabaseAdmin } from './db.mjs'
const sb = await createSupabaseAdmin()
const { data: admin } = await sb.from('administraties').select('id').ilike('naam', '%Rebu%').single()

const all = []
let from = 0
while (true) {
  const { data } = await sb.from('projecten').select('id, naam, relatie_id, status, created_at').eq('administratie_id', admin.id).range(from, from + 999)
  if (!data || data.length === 0) break
  all.push(...data); from += 1000
}
function norm(s) {
  return (s || '').toLowerCase()
    .replace(/^(re|fw|fwd|aw|antw|reactie)\s*:?\s*/gi, '')
    .replace(/^(re|fw|fwd|aw|antw|reactie)\s*:?\s*/gi, '')
    .replace(/offerte\s+met\s+nr\.?\s*[a-z0-9-]+\s*,?\s*/gi, '')
    .replace(/\s+van\s+rebu\s+kozijnen\b/gi, '')
    .replace(/^(offerte\s*(aan[vn]raag|aanvr)|aanvr(?:aag)?|opdracht|werk|offerte|prijsopgave)\s+/gi, '')
    .replace(/\bref\.?\b/gi, ' ')
    .replace(/\bcastricum\b|\bhaarlem\b|\bzaandijk\b|\bzaandam\b|\bkrommenie\b|\bassendelft\b/gi, ' ')
    .replace(/[^a-z0-9]+/g, ' ').trim()
}

const perRel = new Map()
for (const p of all) {
  const rid = p.relatie_id || 'geen'
  if (!perRel.has(rid)) perRel.set(rid, [])
  perRel.get(rid).push({ ...p, n: norm(p.naam) })
}

let merged = 0
const prio = { actief: 0, gewonnen: 0, on_hold: 1, afgerond: 2, geannuleerd: 3, verloren: 3, vervallen: 3 }
for (const [, lst] of perRel) {
  if (lst.length <= 1) continue
  lst.sort((a, b) => a.n.length - b.n.length)
  const gemerged = new Set()
  for (let i = 0; i < lst.length; i++) {
    if (gemerged.has(lst[i].id)) continue
    const a = lst[i].n
    if (a.length < 3) continue
    for (let j = i + 1; j < lst.length; j++) {
      if (gemerged.has(lst[j].id)) continue
      const b = lst[j].n
      if (b.length < 3) continue
      // Match: exact OR substring match (min 4 chars match)
      const matches = a === b || (a.length >= 4 && (b.includes(a) || a.includes(b)))
      if (!matches) continue
      // Bepaal welke te houden (hogere prio-status)
      const candidates = [lst[i], lst[j]].sort((x, y) => {
        const xp = prio[x.status] ?? 4, yp = prio[y.status] ?? 4
        if (xp !== yp) return xp - yp
        return new Date(x.created_at) - new Date(y.created_at)
      })
      const keep = candidates[0], dup = candidates[1]
      await sb.from('offertes').update({ project_id: keep.id }).eq('project_id', dup.id)
      await sb.from('taken').update({ project_id: keep.id }).eq('project_id', dup.id)
      await sb.from('emails').update({ project_id: keep.id }).eq('project_id', dup.id)
      const { error } = await sb.from('projecten').delete().eq('id', dup.id)
      if (!error) { merged++; gemerged.add(dup.id) }
    }
  }
}
console.log(`Merged: ${merged}`)
const { count } = await sb.from('projecten').select('id', { count: 'exact', head: true }).eq('administratie_id', admin.id)
console.log(`Verkoopkansen nu: ${count}`)
