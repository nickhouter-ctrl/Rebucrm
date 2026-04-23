import { createSupabaseAdmin } from './db.mjs'
const sb = await createSupabaseAdmin()
const { data: admin } = await sb.from('administraties').select('id').ilike('naam', '%Rebu%').single()

// Offertes met totaal > 0 maar zonder regels
const all = []
let from = 0
while (true) {
  const { data } = await sb.from('offertes')
    .select('id, offertenummer, onderwerp, status, totaal, subtotaal, btw_totaal, created_at, relatie:relaties(bedrijfsnaam)')
    .eq('administratie_id', admin.id).gt('totaal', 0).range(from, from + 999)
  if (!data || data.length === 0) break
  all.push(...data); from += 1000
}

const ids = all.map(o => o.id)
const regelCount = new Map()
for (let i = 0; i < ids.length; i += 100) {
  const chunk = ids.slice(i, i + 100)
  const { data: rows } = await sb.from('offerte_regels').select('offerte_id').in('offerte_id', chunk)
  for (const r of rows || []) regelCount.set(r.offerte_id, (regelCount.get(r.offerte_id) || 0) + 1)
}

const leeg = all.filter(o => !regelCount.get(o.id))
console.log(`Offertes met totaal>0 zonder regels: ${leeg.length}`)
console.log(`Totaal bedrag: €${leeg.reduce((s, o) => s + Number(o.totaal), 0).toFixed(2)}`)
const perStatus = {}
for (const o of leeg) perStatus[o.status] = (perStatus[o.status] || 0) + 1
console.log('Per status:', perStatus)

// Toon geaccepteerde offertes zonder regels (belangrijkst voor facturatie)
const geaccepteerd = leeg.filter(o => o.status === 'geaccepteerd').slice(0, 20)
console.log(`\nGeaccepteerde offertes zonder regels (eerste 20 van ${leeg.filter(o => o.status === 'geaccepteerd').length}):`)
for (const o of geaccepteerd) {
  console.log(`  ${o.offertenummer} | €${o.totaal} | ${o.relatie?.bedrijfsnaam || '-'} | ${o.onderwerp || '-'}`)
}
