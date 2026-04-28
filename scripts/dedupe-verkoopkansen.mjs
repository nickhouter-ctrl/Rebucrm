// Dedupliceer verkoopkansen per relatie:
// 1. Verkoopkansen op 22+23 april die ZONDER offerte zijn (auto-aangemaakt
//    door email-flow zonder echte deal) → verwijder
// 2. Verkoopkansen waar onderwerp een bestaande offertenr bevat én er is
//    een andere verkoopkans voor dezelfde offerte → samenvoegen
//
// Run zonder argument voor preview, met 'fix' om uit te voeren.

import { createSupabaseAdmin } from './db.mjs'

const sb = await createSupabaseAdmin()
const dryRun = process.argv[2] !== 'fix'

const start = '2026-04-22T00:00:00'
const eind = '2026-04-24T00:00:00'

// Alle projecten in import-periode
const all = []
let from = 0
while (true) {
  const { data } = await sb.from('projecten')
    .select('id, naam, status, relatie_id, created_at, offertes:offertes(id, offertenummer, status)')
    .gte('created_at', start).lt('created_at', eind)
    .range(from, from + 499)
  if (!data || data.length === 0) break
  all.push(...data)
  if (data.length < 500) break
  from += 500
}
console.log(`Verkoopkansen aangemaakt 22-23 april: ${all.length}`)

const zonderOfferte = all.filter(p => !p.offertes || p.offertes.length === 0)
console.log(`Waarvan ZONDER offerte: ${zonderOfferte.length}`)

// Eveneens duplicaten op naam + relatie_id binnen die set
const dup = new Map()
for (const p of zonderOfferte) {
  const key = `${p.relatie_id}|${(p.naam || '').toLowerCase().trim()}`
  if (!dup.has(key)) dup.set(key, [])
  dup.get(key).push(p)
}
const dupGroepen = [...dup.entries()].filter(([, arr]) => arr.length > 1)
console.log(`Duplicaat-groepen (zelfde naam + relatie): ${dupGroepen.length}`)

console.log('\n--- Voorbeelden ---')
for (const p of zonderOfferte.slice(0, 10)) {
  console.log(`  ${p.id.slice(0, 8)} | ${p.created_at.slice(0, 10)} | ${p.status.padEnd(10)} | ${p.naam}`)
}

if (dryRun) {
  console.log(`\n[DRY RUN] Run met 'fix' om de ${zonderOfferte.length} verkoopkansen-zonder-offerte te verwijderen.`)
  process.exit(0)
}

console.log('\nVerwijderen...')
const ids = zonderOfferte.map(p => p.id)
const BATCH = 100
let deleted = 0
for (let i = 0; i < ids.length; i += BATCH) {
  const batch = ids.slice(i, i + BATCH)
  const { error } = await sb.from('projecten').delete().in('id', batch)
  if (error) console.error(`Batch ${i}:`, error.message)
  else { deleted += batch.length; process.stdout.write(`\r  ${Math.min(i + BATCH, ids.length)}/${ids.length}`) }
}
console.log(`\nVerwijderd: ${deleted}`)
