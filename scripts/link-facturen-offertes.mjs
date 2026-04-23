import { createSupabaseAdmin } from './db.mjs'

const DRY = process.argv.includes('--dry')
const sb = await createSupabaseAdmin()
const { data: admin } = await sb.from('administraties').select('id').ilike('naam', '%Rebu%').single()
const adminId = admin.id

const facturen = []
let fromF = 0
while (true) {
  const { data: batch } = await sb.from('facturen')
    .select('id, factuurnummer, datum, relatie_id, offerte_id, order_id, onderwerp, subtotaal, factuur_type')
    .eq('administratie_id', adminId).is('offerte_id', null).range(fromF, fromF + 999)
  if (!batch?.length) break
  facturen.push(...batch); fromF += 1000
}
console.log(`Facturen zonder offerte_id: ${facturen.length}`)

const offertes = []
let fromO = 0
while (true) {
  const { data: batch } = await sb.from('offertes')
    .select('id, offertenummer, datum, relatie_id, subtotaal, project_id, status, onderwerp')
    .eq('administratie_id', adminId).range(fromO, fromO + 999)
  if (!batch?.length) break
  offertes.push(...batch); fromO += 1000
}
// Per relatie gesorteerd op datum
const offByRel = new Map()
for (const o of offertes) {
  if (!o.relatie_id) continue
  if (!offByRel.has(o.relatie_id)) offByRel.set(o.relatie_id, [])
  offByRel.get(o.relatie_id).push(o)
}
for (const arr of offByRel.values()) arr.sort((a, b) => (a.datum || '').localeCompare(b.datum || ''))

let gekoppeld = 0
const sample = []
for (const f of facturen) {
  if (!f.relatie_id || !f.datum) continue
  const kandidaten = offByRel.get(f.relatie_id) || []
  // Vind offerte met matching subtotaal (±5%) of dichtstbijzijnde datum ≤ factuurdatum
  const fDate = new Date(f.datum)
  const window = kandidaten.filter(o => {
    if (!o.datum) return false
    const diff = (fDate - new Date(o.datum)) / 86400000
    return diff >= -14 && diff <= 270 // offerte mag 2w na of 9mnd vóór factuur zijn
  })
  if (window.length === 0) continue
  // Priority: status=geaccepteerd, dichtstbij in datum, anders de grootste subtotaal
  window.sort((a, b) => {
    const aAcc = a.status === 'geaccepteerd' ? 1 : 0
    const bAcc = b.status === 'geaccepteerd' ? 1 : 0
    if (aAcc !== bAcc) return bAcc - aAcc
    const aD = Math.abs(fDate - new Date(a.datum))
    const bD = Math.abs(fDate - new Date(b.datum))
    return aD - bD
  })
  const best = window[0]
  if (!best) continue
  if (sample.length < 15) sample.push({ fact: f.factuurnummer, off: best.offertenummer, rel: f.relatie_id.slice(0, 8) })
  gekoppeld++
  if (!DRY) await sb.from('facturen').update({ offerte_id: best.id }).eq('id', f.id)
}

console.log(`\n${gekoppeld} facturen gekoppeld aan offerte`)
console.log('\nVoorbeelden:')
for (const s of sample) console.log(`  ${s.fact} → ${s.off}`)
