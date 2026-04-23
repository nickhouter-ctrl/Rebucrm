// Per relatie: alle projecten met dezelfde genorm. onderwerp → merge tot 1
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
    .replace(/^(re|fw|fwd|aw|antw)\s*:\s*/gi, '')
    .replace(/^(re|fw|fwd|aw|antw)\s*:\s*/gi, '')
    .replace(/offerte\s+met\s+nr\.?\s*[a-z0-9-]+\s*,?\s*/gi, '')
    .replace(/\s+van\s+rebu\s+kozijnen\b/gi, '')
    .replace(/^(offerte|aanvraag|offerteaanvraag|aanvraag\s+offerte|opdracht|werk|reactie|re)\s+/gi, '')
    .replace(/[^a-z0-9]+/g, ' ').trim()
}

const groepen = new Map()
for (const p of all) {
  const key = `${p.relatie_id || 'geen'}|${norm(p.naam)}`
  if (norm(p.naam).length < 3) continue
  if (!groepen.has(key)) groepen.set(key, [])
  groepen.get(key).push(p)
}

let merged = 0
const prio = { actief: 0, gewonnen: 0, on_hold: 1, afgerond: 2, geannuleerd: 3, verloren: 3, vervallen: 3 }
for (const [, grp] of groepen) {
  if (grp.length <= 1) continue
  grp.sort((a, b) => {
    const ap = prio[a.status] ?? 4, bp = prio[b.status] ?? 4
    if (ap !== bp) return ap - bp
    return new Date(a.created_at) - new Date(b.created_at)
  })
  const keep = grp[0]
  for (const dup of grp.slice(1)) {
    await sb.from('offertes').update({ project_id: keep.id }).eq('project_id', dup.id)
    await sb.from('taken').update({ project_id: keep.id }).eq('project_id', dup.id)
    await sb.from('emails').update({ project_id: keep.id }).eq('project_id', dup.id)
    const { error } = await sb.from('projecten').delete().eq('id', dup.id)
    if (!error) merged++
  }
}

// Orphan projecten verwijderen
const { data: linkedList } = await sb.from('offertes').select('project_id').eq('administratie_id', admin.id).not('project_id', 'is', null)
const withOff = new Set((linkedList || []).map(o => o.project_id))
const { data: metTaken } = await sb.from('taken').select('project_id').eq('administratie_id', admin.id).not('project_id', 'is', null)
const withTaken = new Set((metTaken || []).map(t => t.project_id))
const { data: metEmails } = await sb.from('emails').select('project_id').eq('administratie_id', admin.id).not('project_id', 'is', null)
const withEmails = new Set((metEmails || []).map(e => e.project_id))
const alleNu = []
let f2 = 0
while (true) {
  const { data } = await sb.from('projecten').select('id').eq('administratie_id', admin.id).range(f2, f2 + 999)
  if (!data || data.length === 0) break
  alleNu.push(...data); f2 += 1000
}
const orphans = alleNu.filter(p => !withOff.has(p.id) && !withTaken.has(p.id) && !withEmails.has(p.id))
console.log(`Merged: ${merged}`)
console.log(`Orphan (geen offerte/taak/email) projecten: ${orphans.length}`)
for (let i = 0; i < orphans.length; i += 100) {
  const chunk = orphans.slice(i, i + 100).map(p => p.id)
  await sb.from('projecten').delete().in('id', chunk)
}

const { count } = await sb.from('projecten').select('id', { count: 'exact', head: true }).eq('administratie_id', admin.id)
console.log(`Verkoopkansen nu: ${count}`)
