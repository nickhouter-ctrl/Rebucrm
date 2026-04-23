import { createSupabaseAdmin } from './db.mjs'

const DRY = process.argv.includes('--dry')
const sb = await createSupabaseAdmin()
const { data: admin } = await sb.from('administraties').select('id').ilike('naam', '%Rebu%').single()
const adminId = admin.id

// Alle actieve/on_hold projecten zonder offerte, aangemaakt >= 2026-04-13
const all = []
let from = 0
while (true) {
  const { data: batch } = await sb.from('projecten').select('id, naam, bron, created_at').eq('administratie_id', adminId).in('status', ['actief','on_hold']).gte('created_at', '2026-04-13').range(from, from + 999)
  if (!batch || !batch.length) break
  all.push(...batch); from += 1000
}

const ids = all.filter(p => p.bron !== 'import').map(p => p.id)

// Batch check: haal alle offerte/order/factuur/taken project_ids op
async function ophalen(tabel) {
  const set = new Set()
  const CHUNK = 200
  for (let i = 0; i < ids.length; i += CHUNK) {
    const chunk = ids.slice(i, i + CHUNK)
    const { data } = await sb.from(tabel).select('project_id').in('project_id', chunk)
    for (const r of data || []) set.add(r.project_id)
  }
  return set
}
const [offSet, ordSet, factSet, takenSet] = await Promise.all([
  ophalen('offertes'), ophalen('orders'), ophalen('facturen'), ophalen('taken'),
])

const ghost = all.filter(p =>
  p.bron !== 'import' &&
  !offSet.has(p.id) &&
  !ordSet.has(p.id) &&
  !factSet.has(p.id) &&
  !takenSet.has(p.id)
)

console.log(`Totaal recent: ${all.length}, zonder enige aanhang: ${ghost.length}`)
console.log('\nVoorbeelden:')
for (const p of ghost.slice(0, 10)) console.log(`  "${p.naam}" | ${p.created_at?.slice(0,10)}`)

if (!DRY) {
  const ids = ghost.map(p => p.id)
  const CHUNK = 100
  for (let i = 0; i < ids.length; i += CHUNK) {
    const chunk = ids.slice(i, i + CHUNK)
    const { error } = await sb.from('projecten').update({ status: 'geannuleerd' }).in('id', chunk)
    if (error) console.error(error)
  }
  console.log(`\n${ids.length} ghost-verkoopkansen op status=geannuleerd gezet`)
}
