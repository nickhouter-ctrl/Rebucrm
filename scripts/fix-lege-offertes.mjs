import { createSupabaseAdmin } from './db.mjs'
const sb = await createSupabaseAdmin()
const { data: admin } = await sb.from('administraties').select('id').ilike('naam', '%Rebu%').single()

// 1. Offertes met totaal > 0
const offertes = []
let from = 0
while (true) {
  const { data } = await sb.from('offertes')
    .select('id, offertenummer, totaal, subtotaal, btw_totaal, onderwerp, status')
    .eq('administratie_id', admin.id).gt('totaal', 0).range(from, from + 999)
  if (!data || data.length === 0) break
  offertes.push(...data); from += 1000
}

// 2. Check regels
const ids = offertes.map(o => o.id)
const regelCount = new Map()
for (let i = 0; i < ids.length; i += 100) {
  const chunk = ids.slice(i, i + 100)
  const { data: rows } = await sb.from('offerte_regels').select('offerte_id').in('offerte_id', chunk)
  for (const r of rows || []) regelCount.set(r.offerte_id, (regelCount.get(r.offerte_id) || 0) + 1)
}
const leeg = offertes.filter(o => !regelCount.get(o.id))
console.log(`Offertes met totaal>0 zonder regels: ${leeg.length}`)
console.log(`Totaal bedrag: €${leeg.reduce((s, o) => s + Number(o.totaal), 0).toFixed(2)}`)

if (process.argv.includes('--dry')) process.exit(0)

let fixed = 0
for (const o of leeg) {
  const totaalIncl = Number(o.totaal)
  const excl = Number(o.subtotaal) > 0 ? Number(o.subtotaal) : Math.round((totaalIncl / 1.21) * 100) / 100
  const btw = Math.round((totaalIncl - excl) * 100) / 100
  const { error } = await sb.from('offerte_regels').insert({
    offerte_id: o.id,
    omschrijving: o.onderwerp || 'Kunststof kozijnen leveren',
    aantal: 1,
    prijs: excl,
    btw_percentage: 21,
    totaal: excl,
    volgorde: 0,
  })
  if (error) { console.error(`${o.offertenummer}: ${error.message}`); continue }
  await sb.from('offertes').update({ subtotaal: excl, btw_totaal: btw, totaal: totaalIncl }).eq('id', o.id)
  fixed++
  if (fixed % 100 === 0) console.log(`  voortgang: ${fixed}`)
}
console.log(`Gefixt: ${fixed} / ${leeg.length}`)
