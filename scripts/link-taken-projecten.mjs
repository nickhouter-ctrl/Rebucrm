#!/usr/bin/env node
/**
 * Koppel taken aan projecten op basis van relatie_id match.
 * Voor taken die al een relatie_id hebben maar geen project_id,
 * koppel aan het project met dezelfde relatie_id.
 *
 * Usage:
 *   node scripts/link-taken-projecten.mjs           # dry run
 *   node scripts/link-taken-projecten.mjs --execute  # echt uitvoeren
 */
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  'https://ewmjbtymbrfuuekkszwj.supabase.co',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImV3bWpidHltYnJmdXVla2tzendqIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3MTIzNTk0MCwiZXhwIjoyMDg2ODExOTQwfQ.wxDilBNdpHugVdSBGgwfu1sN9ZSztiyUAK7cVNwGaA4'
)

const adminId = 'e69b63b6-1027-4b35-95d7-0df18f697071'
const execute = process.argv.includes('--execute')

// Haal taken zonder project_id op
let allTaken = []
let from = 0
while (true) {
  const { data } = await supabase
    .from('taken')
    .select('id, titel, relatie_id')
    .eq('administratie_id', adminId)
    .is('project_id', null)
    .not('relatie_id', 'is', null)
    .range(from, from + 999)
  if (!data || data.length === 0) break
  allTaken.push(...data)
  from += 1000
}
console.log(`Taken zonder project (met relatie): ${allTaken.length}`)

// Haal alle projecten op
let allProjecten = []
from = 0
while (true) {
  const { data } = await supabase
    .from('projecten')
    .select('id, naam, relatie_id')
    .eq('administratie_id', adminId)
    .not('relatie_id', 'is', null)
    .range(from, from + 999)
  if (!data || data.length === 0) break
  allProjecten.push(...data)
  from += 1000
}
console.log(`Projecten met relatie: ${allProjecten.length}`)

// Maak map van relatie_id -> projecten
const projectenByRelatie = new Map()
for (const p of allProjecten) {
  if (!projectenByRelatie.has(p.relatie_id)) {
    projectenByRelatie.set(p.relatie_id, [])
  }
  projectenByRelatie.get(p.relatie_id).push(p)
}

// Match taken aan projecten
let matched = 0
let unmatched = 0
const updates = []

for (const taak of allTaken) {
  const projecten = projectenByRelatie.get(taak.relatie_id) || []

  if (projecten.length === 0) {
    unmatched++
    continue
  }

  // Als er maar 1 project is voor die relatie, koppel direct
  // Als er meerdere zijn, zoek fuzzy match op titel
  let bestMatch = projecten[0]
  if (projecten.length > 1) {
    const taakLower = taak.titel.toLowerCase()
    const scored = projecten.map(p => {
      const pLower = p.naam.toLowerCase()
      // Eenvoudige score: hoeveel woorden komen overeen
      const taakWords = taakLower.split(/\s+/)
      const score = taakWords.filter(w => w.length > 2 && pLower.includes(w)).length
      return { project: p, score }
    })
    scored.sort((a, b) => b.score - a.score)
    bestMatch = scored[0].project
  }

  updates.push({ taakId: taak.id, projectId: bestMatch.id, taakTitel: taak.titel, projectNaam: bestMatch.naam })
  matched++
}

console.log(`\nMatched: ${matched}`)
console.log(`Geen project gevonden: ${unmatched}`)

if (updates.length > 0) {
  console.log('\nVoorbeeld (eerste 10):')
  updates.slice(0, 10).forEach(u => console.log(`  Taak: "${u.taakTitel}" → Project: "${u.projectNaam}"`))
}

if (execute && updates.length > 0) {
  console.log('\nUpdating...')
  let done = 0
  for (const u of updates) {
    const { error } = await supabase
      .from('taken')
      .update({ project_id: u.projectId })
      .eq('id', u.taakId)
    if (error) {
      console.error(`Fout bij taak ${u.taakId}:`, error.message)
    }
    done++
    if (done % 50 === 0) console.log(`  ${done}/${updates.length}`)
  }
  console.log(`Klaar! ${done} taken gekoppeld.`)
} else if (!execute && updates.length > 0) {
  console.log('\n⚠️  DRY RUN. Voer uit met --execute om updates door te voeren.')
}
