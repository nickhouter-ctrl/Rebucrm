// Verwijdert taken die automatisch zijn aangemaakt door de email-sync
// (imap.ts processNewEmail). Herkent ze aan de exacte titels die toen
// zijn gebruikt:
//   - "Nieuwe aanvraag - offerte nog te maken"
//   - "Offerte reactie: <nr> - offerte aanpassen"
//
// Run als dry-run met argument 'preview', of zonder argument om
// daadwerkelijk te verwijderen.

import { createSupabaseAdmin } from './db.mjs'

const sb = await createSupabaseAdmin()
const dryRun = process.argv[2] === 'preview'

const { data: aanvraagTaken, error: e1 } = await sb
  .from('taken')
  .select('id, titel, status, created_at, relatie_id')
  .eq('titel', 'Nieuwe aanvraag - offerte nog te maken')
if (e1) { console.error(e1); process.exit(1) }

const { data: reactieTaken, error: e2 } = await sb
  .from('taken')
  .select('id, titel, status, created_at, relatie_id')
  .like('titel', 'Offerte reactie:%- offerte aanpassen')
if (e2) { console.error(e2); process.exit(1) }

const all = [...(aanvraagTaken || []), ...(reactieTaken || [])]
console.log(`Gevonden: ${aanvraagTaken?.length || 0} 'Nieuwe aanvraag' + ${reactieTaken?.length || 0} 'Offerte reactie' = ${all.length} totaal`)

const open = all.filter(t => t.status !== 'afgerond').length
const afgerond = all.filter(t => t.status === 'afgerond').length
console.log(`  Open: ${open}, Afgerond: ${afgerond}`)

if (all.length === 0) {
  console.log('Geen taken om te verwijderen.')
  process.exit(0)
}

if (dryRun) {
  console.log('\n--- PREVIEW (geen verwijderingen) ---')
  for (const t of all.slice(0, 20)) {
    console.log(`  ${t.id.slice(0, 8)}  ${t.status.padEnd(10)}  ${t.created_at.slice(0, 10)}  ${t.titel}`)
  }
  if (all.length > 20) console.log(`  ... +${all.length - 20} meer`)
  console.log(`\nRun zonder 'preview' om te verwijderen.`)
  process.exit(0)
}

console.log(`\nVerwijderen van ${all.length} taken...`)
const ids = all.map(t => t.id)
const BATCH = 100
let deleted = 0
for (let i = 0; i < ids.length; i += BATCH) {
  const batch = ids.slice(i, i + BATCH)
  const { error, count } = await sb.from('taken').delete({ count: 'exact' }).in('id', batch)
  if (error) {
    console.error(`Batch ${i / BATCH + 1} mislukt:`, error.message)
  } else {
    deleted += count || batch.length
    process.stdout.write(`\r  ${Math.min(i + BATCH, ids.length)}/${ids.length}`)
  }
}
console.log(`\nKlaar: ${deleted} taken verwijderd.`)
