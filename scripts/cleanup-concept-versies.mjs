// Verwijdert concept-versies met totaal=0 ALS er een andere versie met
// zelfde offertenummer bestaat die WEL een prijs heeft.
import { createSupabaseAdmin } from './db.mjs'
const sb = await createSupabaseAdmin()
const { data: admin } = await sb.from('administraties').select('id').ilike('naam', '%Rebu%').single()

const all = []
let from = 0
while (true) {
  const { data } = await sb.from('offertes').select('id, offertenummer, versie_nummer, status, totaal, subtotaal').eq('administratie_id', admin.id).range(from, from + 999)
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

let verwijderd = 0
let verwijderdIds = []
for (const [nr, versies] of perNr) {
  if (versies.length < 2) continue
  const heeftPrijs = versies.some(v => Number(v.totaal) > 0)
  if (!heeftPrijs) continue
  // Verwijder alleen de concept-versies met totaal=0
  const removable = versies.filter(v => v.status === 'concept' && (Number(v.totaal) || 0) === 0)
  if (removable.length === 0) continue
  // Verzamel IDs
  for (const v of removable) verwijderdIds.push(v.id)
  verwijderd += removable.length
}
console.log(`Te verwijderen concept-versies (met prijs-versie elders): ${verwijderd}`)

if (process.argv.includes('--dry')) process.exit(0)

// In batches van 100
for (let i = 0; i < verwijderdIds.length; i += 100) {
  const chunk = verwijderdIds.slice(i, i + 100)
  // Verwijder eerst gekoppelde regels/documenten
  await sb.from('offerte_regels').delete().in('offerte_id', chunk)
  await sb.from('documenten').delete().in('entiteit_id', chunk).in('entiteit_type', ['offerte_leverancier', 'offerte_leverancier_data', 'offerte_leverancier_parsed'])
  // Dan de offertes zelf
  const { error } = await sb.from('offertes').delete().in('id', chunk)
  if (error) console.error('Batch delete fout:', error.message)
  console.log(`  verwijderd: ${Math.min(i + 100, verwijderdIds.length)} / ${verwijderdIds.length}`)
}
console.log(`Klaar. ${verwijderd} concept-versies verwijderd.`)
