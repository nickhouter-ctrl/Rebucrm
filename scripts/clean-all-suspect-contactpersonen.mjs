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

function tokens(s) {
  return (s||'').toLowerCase().replace(/[^a-z0-9 ]/g,' ').split(/\s+/).filter(t => t.length >= 3 && !['bouw','bedrijf','timmer','werken','montage','projecten','techniek','geveltechniek','kozijnen','group','beheer','interieur','bouwbedrijf','installatie','service','onderhoud','administratie','holding','beheer','verkoop','planning','werkvoorbereiding','bouwbedrijfvd','info','aftersales'].includes(t))
}

let gewist = 0
const sample = []
for (const r of crm) {
  if (!r.contactpersoon) continue
  const cpTok = new Set(tokens(r.contactpersoon))
  if (cpTok.size === 0) continue
  const bnTok = new Set(tokens(r.bedrijfsnaam))
  // Overlap?
  let overlap = false
  for (const t of cpTok) if (bnTok.has(t)) { overlap = true; break }
  if (overlap) continue
  if (sample.length < 40) sample.push({ bedrijf: r.bedrijfsnaam, cp: r.contactpersoon })
  gewist++
  if (!DRY) await sb.from('relaties').update({ contactpersoon: null }).eq('id', r.id)
}

console.log(`Verdachte contactpersonen gewist: ${gewist}`)
for (const s of sample) console.log(`  "${s.bedrijf}" had cp="${s.cp}"`)
