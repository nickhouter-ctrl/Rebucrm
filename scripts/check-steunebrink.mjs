import { createSupabaseAdmin } from './db.mjs'
const sb = await createSupabaseAdmin()
const { data: admin } = await sb.from('administraties').select('id').ilike('naam', '%Rebu%').single()

console.log('=== J. Steunebrink relaties ===')
const { data: rels } = await sb.from('relaties')
  .select('id, bedrijfsnaam, contactpersoon, email, telefoon, created_at')
  .eq('administratie_id', admin.id)
  .ilike('bedrijfsnaam', '%steunebrink%')
for (const r of rels) console.log(`  ${r.id} | "${r.bedrijfsnaam}" | ${r.contactpersoon || '-'} | ${r.email || '-'}`)

console.log('\n=== Alle dubbele relaties (>=2 met zelfde genormaliseerde naam) ===')
const all = []
let from = 0
while (true) {
  const { data } = await sb.from('relaties').select('id, bedrijfsnaam, email, telefoon, created_at, type')
    .eq('administratie_id', admin.id).range(from, from + 999)
  if (!data || data.length === 0) break
  all.push(...data); from += 1000
}
function norm(s) { return (s || '').toLowerCase().replace(/\s+b\.?v\.?|\s+vof|\s+v\.?o\.?f\.?/g, '').replace(/[^a-z0-9]/g, '') }
const groups = new Map()
for (const r of all) {
  const k = norm(r.bedrijfsnaam)
  if (!k || k.length < 3) continue
  if (!groups.has(k)) groups.set(k, [])
  groups.get(k).push(r)
}
const dups = Array.from(groups.values()).filter(g => g.length > 1)
console.log(`${dups.length} groepen met dubbele relaties, totaal ${dups.reduce((s, g) => s + g.length - 1, 0)} te mergen`)

console.log('\n=== Dubbele verkoopkansen (projecten met zelfde naam + relatie) ===')
const projs = []
from = 0
while (true) {
  const { data } = await sb.from('projecten').select('id, naam, relatie_id, status, created_at')
    .eq('administratie_id', admin.id).range(from, from + 999)
  if (!data || data.length === 0) break
  projs.push(...data); from += 1000
}
const pGroups = new Map()
for (const p of projs) {
  const k = norm(p.naam) + '|' + (p.relatie_id || '')
  if (!k || k.length < 5) continue
  if (!pGroups.has(k)) pGroups.set(k, [])
  pGroups.get(k).push(p)
}
const pDups = Array.from(pGroups.values()).filter(g => g.length > 1)
console.log(`${pDups.length} dubbele verkoopkansen-groepen, ${pDups.reduce((s, g) => s + g.length - 1, 0)} te mergen`)
for (const g of pDups.slice(0, 5)) {
  console.log(`  "${g[0].naam}" × ${g.length}`)
}
