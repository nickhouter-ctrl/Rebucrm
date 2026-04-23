// V2: per offertenummer houden we max 1 versie over:
// - Als >=1 versie prijs heeft: houd hoogste versie met prijs
// - Als geen prijs: houd hoogste versie_nummer, verwijder rest
import { createSupabaseAdmin } from './db.mjs'
const sb = await createSupabaseAdmin()
const { data: admin } = await sb.from('administraties').select('id').ilike('naam', '%Rebu%').single()

const all = []
let from = 0
while (true) {
  const { data } = await sb.from('offertes').select('id, offertenummer, versie_nummer, status, totaal').eq('administratie_id', admin.id).range(from, from + 999)
  if (!data || data.length === 0) break
  all.push(...data); from += 1000
}
console.log(`Totaal offertes: ${all.length}`)

const perNr = new Map()
for (const o of all) {
  if (!o.offertenummer) continue
  if (!perNr.has(o.offertenummer)) perNr.set(o.offertenummer, [])
  perNr.get(o.offertenummer).push(o)
}

const verwijderdIds = []
for (const [nr, versies] of perNr) {
  if (versies.length < 2) continue
  // Sorteer: prijs > 0 eerst (desc), dan versie_nummer desc
  versies.sort((a, b) => {
    const aP = Number(a.totaal) > 0 ? 0 : 1
    const bP = Number(b.totaal) > 0 ? 0 : 1
    if (aP !== bP) return aP - bP
    return (Number(b.versie_nummer) || 0) - (Number(a.versie_nummer) || 0)
  })
  const keep = versies[0]
  for (const v of versies.slice(1)) {
    // Alleen verwijderen als TOTAAL=0 OF als er andere versie met prijs is
    if (Number(v.totaal) === 0 || Number(keep.totaal) > 0) {
      verwijderdIds.push(v.id)
    }
  }
}
console.log(`Te verwijderen: ${verwijderdIds.length}`)

if (process.argv.includes('--dry')) process.exit(0)

for (let i = 0; i < verwijderdIds.length; i += 100) {
  const chunk = verwijderdIds.slice(i, i + 100)
  await sb.from('offerte_regels').delete().in('offerte_id', chunk)
  await sb.from('documenten').delete().in('entiteit_id', chunk).in('entiteit_type', ['offerte_leverancier', 'offerte_leverancier_data', 'offerte_leverancier_parsed'])
  const { error } = await sb.from('offertes').delete().in('id', chunk)
  if (error) console.error('batch fout:', error.message)
}

const { count } = await sb.from('offertes').select('id', { count: 'exact', head: true }).eq('administratie_id', admin.id)
console.log(`\nVerwijderd: ${verwijderdIds.length}`)
console.log(`Nu: ${count} offertes`)
