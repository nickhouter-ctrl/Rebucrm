import { createSupabaseAdmin } from './db.mjs'

const DRY = process.argv.includes('--dry')
const sb = await createSupabaseAdmin()
const { data: admin } = await sb.from('administraties').select('id').ilike('naam', '%Rebu%').single()
const adminId = admin.id

const crm = []
let from = 0
while (true) {
  const { data: batch } = await sb.from('relaties').select('id, bedrijfsnaam, contactpersoon').eq('administratie_id', adminId).range(from, from + 999)
  if (!batch || batch.length === 0) break
  crm.push(...batch); from += 1000
}

function norm(s) { return (s||'').toLowerCase().replace(/[^a-z0-9 ]/g,'').replace(/\s+/g,' ').trim() }

const bedrijfsnamen = []
for (const r of crm) { const n = norm(r.bedrijfsnaam); if (n) bedrijfsnamen.push(n) }
const bedrijfSet = new Set(bedrijfsnamen)

function verontreinigd(cpNorm, eigenNorm) {
  if (!cpNorm || cpNorm.length < 3) return false
  if (eigenNorm && (eigenNorm.includes(cpNorm) || cpNorm.includes(eigenNorm))) return false
  if (bedrijfSet.has(cpNorm)) return true
  if (cpNorm.length >= 5) {
    for (const bn of bedrijfsnamen) {
      if (bn === eigenNorm) continue
      if (bn.length < 5) continue
      if (bn.slice(0, 3) !== cpNorm.slice(0, 3)) continue
      if (bn.includes(cpNorm) || cpNorm.includes(bn)) return true
    }
  }
  return false
}

let gewist = 0, getrimd = 0
const sample = []
for (const r of crm) {
  if (!r.contactpersoon) continue
  const trimmed = r.contactpersoon.trim()
  const cp = norm(r.contactpersoon)
  const eigen = norm(r.bedrijfsnaam)
  if (verontreinigd(cp, eigen)) {
    if (sample.length < 30) sample.push({ bedrijf: r.bedrijfsnaam, cp: r.contactpersoon })
    gewist++
    if (!DRY) await sb.from('relaties').update({ contactpersoon: null }).eq('id', r.id)
  } else if (trimmed !== r.contactpersoon) {
    getrimd++
    if (!DRY) await sb.from('relaties').update({ contactpersoon: trimmed || null }).eq('id', r.id)
  }
}

console.log(`Contactpersoon gewist: ${gewist}, whitespace getrimd: ${getrimd}`)
for (const s of sample) console.log(`  "${s.bedrijf}" had contactpersoon "${s.cp}"`)
