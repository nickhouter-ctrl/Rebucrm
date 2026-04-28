// Slimme verkoopkans-dedupe per relatie:
// Identificeert duplicaten op basis van overeenkomende kenmerken in de naam:
//   1. Zelfde offertenummer (OFF-XXXX of O-YYYY-XXXX) in de naam
//   2. Zelfde 'ref. X' referentie
//   3. Zelfde geneutraliseerde naam (RE:/FW:/Re:FW: prefixen verwijderd,
//      'van Rebu kozijnen' suffix verwijderd)
//
// Voor elke duplicate-groep:
//   - Behoud OUDSTE verkoopkans (laagste created_at)
//   - Verplaats alle offertes naar de oudste (UPDATE project_id)
//   - Verplaats alle emails naar de oudste (UPDATE project_id)
//   - Verwijder de rest

import { createSupabaseAdmin } from './db.mjs'

const sb = await createSupabaseAdmin()
const dryRun = process.argv[2] !== 'fix'

function neutraliseer(naam) {
  if (!naam) return ''
  let n = naam.toLowerCase().trim()
  // Strip prefix-loops als "re: fw: re: ..."
  while (true) {
    const before = n
    n = n.replace(/^(re|fw|fwd|aw|wg)\s*[:.]\s*/i, '').trim()
    if (n === before) break
  }
  // Strip "van Rebu kozijnen" suffix
  n = n.replace(/\s*van rebu kozijnen\s*$/i, '').trim()
  // Strip "Offerte met Nr. OFF-XXXX," / "O-YYYY-XXXX,"
  n = n.replace(/^offerte\s+met\s+nr\.?\s*(off-\d+|o-\d{4}-\d+)\s*,?\s*/i, '').trim()
  // Strip "Offerte aanvraag" prefix (alleen als er nog tekst over is)
  const stripped = n.replace(/^offerte\s+aanvraag\s+ref\.?\s*/i, '').trim()
  if (stripped && stripped !== n) n = stripped
  // Whitespace normaliseren
  n = n.replace(/\s+/g, ' ').trim()
  return n
}

function extractOfferteNr(naam) {
  if (!naam) return null
  const m = naam.match(/\b(OFF-\d+|O-\d{4}-\d+)\b/i)
  return m ? m[1].toUpperCase() : null
}

// Fetch alle projecten
const all = []
let from = 0
while (true) {
  const { data } = await sb.from('projecten')
    .select('id, naam, status, relatie_id, created_at, offertes:offertes(id)')
    .range(from, from + 999)
  if (!data || data.length === 0) break
  all.push(...data)
  if (data.length < 1000) break
  from += 1000
}
console.log(`Totaal verkoopkansen: ${all.length}`)

// Groepeer per (relatie_id, kenmerk)
const buckets = new Map()
for (const p of all) {
  if (!p.relatie_id || !p.naam) continue
  const offNr = extractOfferteNr(p.naam)
  const neutraal = neutraliseer(p.naam)
  // Sleutel: offertenr is sterker dan neutrale naam — als beide aanwezig
  // maken we 2 entries en dedupliceren we per ronde.
  const sleutels = []
  if (offNr) sleutels.push(`${p.relatie_id}|nr:${offNr}`)
  if (neutraal && neutraal.length >= 4) sleutels.push(`${p.relatie_id}|naam:${neutraal}`)
  for (const s of sleutels) {
    if (!buckets.has(s)) buckets.set(s, [])
    buckets.get(s).push(p)
  }
}

// Verzamel unieke duplicaat-acties: per duplicaat een oudste-bewaren + rest-verwijderen
const samenvoegen = new Map() // bewaarId → Set van te-verwijderen ids
const verwijderdeIds = new Set()
let dupGroepen = 0
for (const [, projecten] of buckets) {
  const uniek = projecten.filter(p => !verwijderdeIds.has(p.id))
  if (uniek.length <= 1) continue
  uniek.sort((a, b) => a.created_at.localeCompare(b.created_at))
  const bewaar = uniek[0]
  const rest = uniek.slice(1)
  if (!samenvoegen.has(bewaar.id)) samenvoegen.set(bewaar.id, new Set())
  for (const p of rest) {
    samenvoegen.get(bewaar.id).add(p.id)
    verwijderdeIds.add(p.id)
  }
  dupGroepen++
}

console.log(`Duplicaat-groepen gevonden: ${dupGroepen}`)
console.log(`Te verwijderen verkoopkansen: ${verwijderdeIds.size}`)

console.log('\n--- Top 10 voorbeelden ---')
let shown = 0
for (const [bewaarId, verwijderIds] of samenvoegen) {
  if (shown >= 10) break
  const bewaar = all.find(p => p.id === bewaarId)
  console.log(`  Behoud: ${bewaar.created_at.slice(0,10)} | ${bewaar.naam.slice(0, 70)}`)
  for (const vid of verwijderIds) {
    const v = all.find(p => p.id === vid)
    if (v) console.log(`    → samenvoegen: ${v.created_at.slice(0,10)} | ${v.naam.slice(0, 70)}`)
  }
  shown++
}

if (dryRun) {
  console.log(`\n[DRY RUN] Run met 'fix' om de samenvoeging uit te voeren.`)
  process.exit(0)
}

console.log('\nVerwerken...')
let merged = 0
for (const [bewaarId, verwijderIds] of samenvoegen) {
  const ids = [...verwijderIds]
  if (ids.length === 0) continue
  // 1. Verplaats offertes
  await sb.from('offertes').update({ project_id: bewaarId }).in('project_id', ids)
  // 2. Verplaats emails
  await sb.from('emails').update({ project_id: bewaarId }).in('project_id', ids)
  // 3. Verplaats taken
  await sb.from('taken').update({ project_id: bewaarId }).in('project_id', ids)
  // 4. Verwijder lege duplicate verkoopkansen
  const { error } = await sb.from('projecten').delete().in('id', ids)
  if (error) console.error('Delete fout:', error.message)
  merged++
  if (merged % 50 === 0) process.stdout.write(`\r  ${merged}/${samenvoegen.size}`)
}
console.log(`\n${merged} duplicate groepen samengevoegd, ${verwijderdeIds.size} verkoopkansen verwijderd.`)
