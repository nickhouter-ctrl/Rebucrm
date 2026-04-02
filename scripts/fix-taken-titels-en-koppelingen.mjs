#!/usr/bin/env node
/**
 * Fix taken:
 * 1. Hernoem titels naar projectnaam (uit omschrijving "Project: ...")
 * 2. Koppel aan verkoopkans (project) op basis van naam match
 * 3. Koppel aan klant via verkoopkans.relatie_id
 *
 * Usage:
 *   node scripts/fix-taken-titels-en-koppelingen.mjs           # dry run
 *   node scripts/fix-taken-titels-en-koppelingen.mjs --execute  # uitvoeren
 */
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  'https://ewmjbtymbrfuuekkszwj.supabase.co',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImV3bWpidHltYnJmdXVla2tzendqIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3MTIzNTk0MCwiZXhwIjoyMDg2ODExOTQwfQ.wxDilBNdpHugVdSBGgwfu1sN9ZSztiyUAK7cVNwGaA4'
)
const adminId = 'e69b63b6-1027-4b35-95d7-0df18f697071'
const execute = process.argv.includes('--execute')

// Haal alle taken op
let allTaken = []
let from = 0
while (true) {
  const { data } = await supabase
    .from('taken')
    .select('id, titel, omschrijving, project_id, relatie_id')
    .eq('administratie_id', adminId)
    .range(from, from + 999)
  if (!data || data.length === 0) break
  allTaken.push(...data)
  from += 1000
}
console.log(`Totaal taken: ${allTaken.length}`)

// Haal alle projecten op
let allProjecten = []
from = 0
while (true) {
  const { data } = await supabase
    .from('projecten')
    .select('id, naam, relatie_id')
    .eq('administratie_id', adminId)
    .range(from, from + 999)
  if (!data || data.length === 0) break
  allProjecten.push(...data)
  from += 1000
}
console.log(`Totaal projecten: ${allProjecten.length}`)

// Haal alle relaties op
let allRelaties = []
from = 0
while (true) {
  const { data } = await supabase
    .from('relaties')
    .select('id, bedrijfsnaam')
    .eq('administratie_id', adminId)
    .range(from, from + 999)
  if (!data || data.length === 0) break
  allRelaties.push(...data)
  from += 1000
}
console.log(`Totaal relaties: ${allRelaties.length}`)

// Normaliseer naam voor matching
function normalize(str) {
  return (str || '').toLowerCase().replace(/[^a-z0-9]/g, ' ').replace(/\s+/g, ' ').trim()
}

// Bouw project lookup
const projectByNorm = new Map()
for (const p of allProjecten) {
  const norm = normalize(p.naam)
  if (!projectByNorm.has(norm)) projectByNorm.set(norm, p)
}

// Updates verzamelen
const updates = []
let titelGewijzigd = 0
let projectGekoppeld = 0
let relatieGekoppeld = 0

for (const taak of allTaken) {
  const update = { id: taak.id }
  let changed = false

  // 1. Extract projectnaam uit omschrijving
  let projectNaam = null
  if (taak.omschrijving) {
    const match = taak.omschrijving.match(/Project:\s*(.+?)(?:\n|$)/)
    if (match) {
      projectNaam = match[1].trim()
    }
  }

  // 2. Hernoem titel naar projectnaam als de titel generiek is
  const generiekeTitels = ['opvolgen', 'ophelderen', 'nabellen mail', 'nabellen', 'gg: morgen opbellen']
  if (projectNaam && generiekeTitels.includes(taak.titel.toLowerCase())) {
    update.titel = projectNaam
    titelGewijzigd++
    changed = true
  }

  // 3. Koppel aan project als nog niet gekoppeld
  if (!taak.project_id && projectNaam) {
    const norm = normalize(projectNaam)
    // Exact match
    let matchedProject = projectByNorm.get(norm)

    // Fuzzy: probeer substring match
    if (!matchedProject) {
      for (const [pNorm, p] of projectByNorm) {
        if (pNorm.includes(norm) || norm.includes(pNorm)) {
          matchedProject = p
          break
        }
      }
    }

    // Fuzzy: woord-overlap
    if (!matchedProject) {
      const taakWords = norm.split(' ').filter(w => w.length > 2)
      let bestScore = 0
      let bestProject = null
      for (const p of allProjecten) {
        const pNorm = normalize(p.naam)
        const pWords = pNorm.split(' ').filter(w => w.length > 2)
        const overlap = taakWords.filter(w => pWords.includes(w)).length
        const score = overlap / Math.max(taakWords.length, 1)
        if (score > 0.5 && score > bestScore) {
          bestScore = score
          bestProject = p
        }
      }
      if (bestProject) matchedProject = bestProject
    }

    if (matchedProject) {
      update.project_id = matchedProject.id
      projectGekoppeld++
      changed = true

      // 4. Koppel ook relatie als project een relatie heeft
      if (!taak.relatie_id && matchedProject.relatie_id) {
        update.relatie_id = matchedProject.relatie_id
        relatieGekoppeld++
      }
    }
  }

  // 5. Als taak al relatie_id heeft via ander pad maar nog geen project, zoek project via relatie
  if (!taak.project_id && !update.project_id && taak.relatie_id) {
    const relatieProjecten = allProjecten.filter(p => p.relatie_id === taak.relatie_id)
    if (relatieProjecten.length === 1) {
      update.project_id = relatieProjecten[0].id
      projectGekoppeld++
      changed = true
    }
  }

  if (changed) updates.push(update)
}

console.log(`\nResultaat:`)
console.log(`  Titels hernoemen: ${titelGewijzigd}`)
console.log(`  Projecten koppelen: ${projectGekoppeld}`)
console.log(`  Relaties koppelen: ${relatieGekoppeld}`)
console.log(`  Totaal updates: ${updates.length}`)

console.log(`\nVoorbeelden (eerste 20):`)
updates.slice(0, 20).forEach(u => {
  const parts = []
  if (u.titel) parts.push(`titel → "${u.titel}"`)
  if (u.project_id) parts.push(`project_id → ${u.project_id.substring(0, 8)}...`)
  if (u.relatie_id) parts.push(`relatie_id → ${u.relatie_id.substring(0, 8)}...`)
  console.log(`  ${u.id.substring(0, 8)}: ${parts.join(', ')}`)
})

if (execute && updates.length > 0) {
  console.log('\nUpdating...')
  let done = 0
  for (const u of updates) {
    const { id, ...fields } = u
    const { error } = await supabase.from('taken').update(fields).eq('id', id)
    if (error) console.error(`  Fout ${id}: ${error.message}`)
    done++
    if (done % 50 === 0) console.log(`  ${done}/${updates.length}`)
  }
  console.log(`Klaar! ${done} taken bijgewerkt.`)
} else if (!execute && updates.length > 0) {
  console.log('\n⚠️  DRY RUN. Voer uit met --execute om door te voeren.')
}
