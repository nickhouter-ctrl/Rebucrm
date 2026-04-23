// V3: fuzzy dedup binnen dezelfde relatie — substring match + stemming
import { createSupabaseAdmin } from './db.mjs'
const sb = await createSupabaseAdmin()
const { data: admin } = await sb.from('administraties').select('id').ilike('naam', '%Rebu%').single()

const alle = []
let from = 0
while (true) {
  const { data } = await sb.from('projecten')
    .select('id, naam, relatie_id, status, created_at')
    .eq('administratie_id', admin.id).range(from, from + 999)
  if (!data || data.length === 0) break
  alle.push(...data); from += 1000
}

function clean(s) {
  if (!s) return ''
  return s.toLowerCase()
    .replace(/^(re|fw|fwd|aw|antw)\s*:\s*/gi, '')
    .replace(/^(re|fw|fwd|aw|antw)\s*:\s*/gi, '')
    .replace(/offerte\s+met\s+nr\.?\s*[a-z0-9-]+\s*,?\s*/gi, '')
    .replace(/\s+van\s+rebu\s+kozijnen\b/gi, '')
    .replace(/^(offerte|aanvraag|aanvraag\s+offerte|opdracht|werk)\s+/gi, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
}

// Groep per relatie
const perRelatie = new Map()
for (const p of alle) {
  const rid = p.relatie_id || 'geen'
  if (!perRelatie.has(rid)) perRelatie.set(rid, [])
  perRelatie.get(rid).push({ ...p, clean: clean(p.naam) })
}

// Binnen relatie: group projects whose 'clean' name is a substring of another (or equal)
// OR has significant overlap (first 5+ chars common)
const paren = [] // [keep, dup]
for (const [, lst] of perRelatie) {
  if (lst.length <= 1) continue
  // Sort by length asc zodat kortste 'naam' als key dient
  lst.sort((a, b) => a.clean.length - b.clean.length)
  const gemerged = new Set()
  for (let i = 0; i < lst.length; i++) {
    if (gemerged.has(lst[i].id)) continue
    for (let j = i + 1; j < lst.length; j++) {
      if (gemerged.has(lst[j].id)) continue
      const a = lst[i].clean, b = lst[j].clean
      if (a.length < 4 || b.length < 4) continue
      // Same cleaned name
      if (a === b) { paren.push([lst[i], lst[j]]); gemerged.add(lst[j].id); continue }
      // Substring match (only if shorter >= 8 chars zodat generieke termen niet matchen)
      // Substring match alleen als kortste specifiek genoeg is en geen generiek woord
      if (a.length >= 15 && b.includes(a)) { paren.push([lst[i], lst[j]]); gemerged.add(lst[j].id); continue }
    }
  }
}
console.log(`Te mergen: ${paren.length} paren`)

if (process.argv.includes('--dry')) {
  for (const [k, d] of paren.slice(0, 15)) {
    console.log(`\n  KEEP: "${k.naam}" [${k.status}]`)
    console.log(`   DUP: "${d.naam}" [${d.status}]`)
  }
  process.exit(0)
}

let verwijderd = 0
// Status-prioriteit: actief behouden boven afgerond
const prio = { actief: 0, gewonnen: 0, on_hold: 1, afgerond: 2, geannuleerd: 3, verloren: 3, vervallen: 3 }
for (const [aRef, bRef] of paren) {
  // Kies welke te behouden
  const ap = prio[aRef.status] ?? 4, bp = prio[bRef.status] ?? 4
  let keep = aRef, dup = bRef
  if (bp < ap) { keep = bRef; dup = aRef }
  else if (ap === bp && new Date(aRef.created_at) > new Date(bRef.created_at)) { keep = bRef; dup = aRef }
  // Merge
  await sb.from('offertes').update({ project_id: keep.id }).eq('project_id', dup.id)
  await sb.from('taken').update({ project_id: keep.id }).eq('project_id', dup.id)
  await sb.from('emails').update({ project_id: keep.id }).eq('project_id', dup.id)
  const { error } = await sb.from('projecten').delete().eq('id', dup.id)
  if (error) console.error(`Delete ${dup.naam}: ${error.message}`)
  else verwijderd++
  if (verwijderd % 50 === 0) console.log(`  voortgang: ${verwijderd}`)
}

const { count } = await sb.from('projecten').select('id', { count: 'exact', head: true }).eq('administratie_id', admin.id)
console.log(`\nVerwijderd: ${verwijderd}`)
console.log(`Verkoopkansen nu: ${count}`)
