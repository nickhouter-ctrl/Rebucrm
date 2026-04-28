// Dedupliceer dubbele offertes binnen verkoopkansen.
// Heuristiek: per (project_id, subtotaal) combinatie, als er meerdere
// offerte-groepen zijn met identiek bedrag → behoud OUDSTE (laagste
// created_at), verwijder de rest. Behoudt versie-keten van het origineel.
//
// Run zonder argument voor preview, met 'fix' om te verwijderen.

import { createSupabaseAdmin } from './db.mjs'

const sb = await createSupabaseAdmin()
const dryRun = process.argv[2] !== 'fix'

const all = []
let from = 0
while (true) {
  const { data } = await sb.from('offertes')
    .select('id, offertenummer, status, versie_nummer, groep_id, project_id, relatie_id, subtotaal, totaal, created_at, datum')
    .range(from, from + 999)
  if (!data || data.length === 0) break
  all.push(...data)
  if (data.length < 1000) break
  from += 1000
}
console.log(`Totaal offertes in DB: ${all.length}`)

// Groep per (project_id, subtotaal-rounded). Skip records zonder project of subtotaal.
const buckets = new Map()
for (const o of all) {
  if (!o.project_id) continue
  const sub = Math.round(Number(o.subtotaal || 0) * 100) / 100
  if (sub <= 0) continue
  const key = `${o.project_id}|${sub}`
  if (!buckets.has(key)) buckets.set(key, new Map())
  const groepKey = o.groep_id || o.id
  if (!buckets.get(key).has(groepKey)) buckets.get(key).set(groepKey, [])
  buckets.get(key).get(groepKey).push(o)
}

// Per bucket: meerdere groepen met zelfde bedrag → duplicaten
const teVerwijderenGroepen = []
let bewaardeGroepen = 0
for (const [, groepenMap] of buckets) {
  if (groepenMap.size <= 1) continue
  // Sorteer groepen op oudste rij (created_at)
  const groepen = [...groepenMap.entries()].map(([groepKey, rijen]) => ({
    groepKey,
    rijen,
    eerste: rijen.reduce((a, b) => (a.created_at < b.created_at ? a : b)),
  }))
  groepen.sort((a, b) => a.eerste.created_at.localeCompare(b.eerste.created_at))
  // Behoud groepen[0], verwijder de rest
  bewaardeGroepen++
  for (let i = 1; i < groepen.length; i++) {
    teVerwijderenGroepen.push({
      groepKey: groepen[i].groepKey,
      rijen: groepen[i].rijen,
      reden: `dup van groep ${groepen[0].eerste.offertenummer} (${groepen[0].eerste.created_at.slice(0,10)})`,
    })
  }
}

const totaalRijen = teVerwijderenGroepen.reduce((s, g) => s + g.rijen.length, 0)
console.log(`Duplicaat-groepen gevonden: ${teVerwijderenGroepen.length} groepen, ${totaalRijen} rijen totaal`)
console.log(`Bewaarde groepen (origineel per bucket): ${bewaardeGroepen}`)

console.log('\n--- Voorbeelden ---')
for (const g of teVerwijderenGroepen.slice(0, 10)) {
  const r = g.rijen[0]
  console.log(`  groep ${g.groepKey.slice(0, 8)} | ${r.offertenummer} v${r.versie_nummer} | €${r.subtotaal} | ${r.created_at.slice(0,10)} | ${g.reden}`)
}
if (teVerwijderenGroepen.length > 10) console.log(`  ... +${teVerwijderenGroepen.length - 10} meer`)

if (dryRun) {
  console.log(`\n[DRY RUN] Run met 'fix' om ${totaalRijen} offerte-rijen te verwijderen (${teVerwijderenGroepen.length} duplicate groepen).`)
  process.exit(0)
}

// Verwijder gerelateerde records eerst (cascade), dan de offertes
const offerteIds = teVerwijderenGroepen.flatMap(g => g.rijen.map(r => r.id))
console.log(`\nVerwijderen van ${offerteIds.length} offertes...`)
const BATCH = 100
let deleted = 0
for (let i = 0; i < offerteIds.length; i += BATCH) {
  const batch = offerteIds.slice(i, i + BATCH)
  const { error } = await sb.from('offertes').delete().in('id', batch)
  if (error) {
    console.error(`Batch ${i}:`, error.message)
  } else {
    deleted += batch.length
    process.stdout.write(`\r  ${Math.min(i + BATCH, offerteIds.length)}/${offerteIds.length}`)
  }
}
console.log(`\nVerwijderd: ${deleted} offertes (${teVerwijderenGroepen.length} duplicate groepen).`)
