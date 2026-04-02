#!/usr/bin/env node
/**
 * Direct import verkoopkansen CSV als projecten via Supabase service role
 */
import { readFileSync } from 'fs'
import { createClient } from '@supabase/supabase-js'

const CSV_PATH = '/Users/houterminiopslag/Downloads/Verkoopkansen.csv'

const supabase = createClient(
  'https://ewmjbtymbrfuuekkszwj.supabase.co',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImV3bWpidHltYnJmdXVla2tzendqIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3MTIzNTk0MCwiZXhwIjoyMDg2ODExOTQwfQ.wxDilBNdpHugVdSBGgwfu1sN9ZSztiyUAK7cVNwGaA4'
)

// Parse CSV
const content = readFileSync(CSV_PATH, 'utf-8')
const lines = content.split('\n').filter(l => l.trim())
const rows = []
for (let i = 1; i < lines.length; i++) {
  const values = lines[i].split(';').map(v => v.replace(/"/g, '').trim())
  rows.push({
    nummer: values[0] || '',
    relatie: values[2] || '',
    onderwerp: values[4] || '',
    contactpersoon: values[5] || '',
    fase: values[6] || '',
    bedrag: values[7] || '',
  })
}
console.log(`Parsed ${rows.length} verkoopkansen`)

// Administratie: Rebu Kozijnen B.V.
const adminId = 'e69b63b6-1027-4b35-95d7-0df18f697071'
console.log('Administratie:', adminId)

// Haal alle relaties op
let allRelaties = []
let from = 0
while (true) {
  const { data } = await supabase
    .from('relaties')
    .select('id, bedrijfsnaam')
    .eq('administratie_id', adminId)
    .range(from, from + 999)
  if (!data || data.length === 0) break
  allRelaties.push(...data)
  if (data.length < 1000) break
  from += 1000
}
console.log(`${allRelaties.length} relaties gevonden`)

// Haal bestaande projecten op
let allProjecten = []
from = 0
while (true) {
  const { data } = await supabase
    .from('projecten')
    .select('naam, relatie_id')
    .eq('administratie_id', adminId)
    .range(from, from + 999)
  if (!data || data.length === 0) break
  allProjecten.push(...data)
  if (data.length < 1000) break
  from += 1000
}
console.log(`${allProjecten.length} bestaande projecten`)

const bestaandeSet = new Set(allProjecten.map(p => `${(p.naam || '').toLowerCase().trim()}|${p.relatie_id || ''}`))

// Normaliseer voor matching
function normalize(s) {
  return s.toLowerCase().replace(/[^a-z0-9]/g, '').trim()
}

const relatieMap = new Map()
for (const r of allRelaties) {
  relatieMap.set(normalize(r.bedrijfsnaam), r.id)
}

const results = { imported: 0, skipped: 0, duplicates: 0, noRelatie: [], errors: [] }
const toInsert = []

for (const row of rows) {
  const naam = row.onderwerp?.trim() || row.nummer
  if (!naam) { results.skipped++; continue }

  // Match relatie
  const relatieNorm = normalize(row.relatie || '')
  let relatieId = relatieMap.get(relatieNorm) || null

  // Fuzzy match
  if (!relatieId && relatieNorm) {
    for (const [key, id] of relatieMap) {
      if (key.includes(relatieNorm) || relatieNorm.includes(key)) {
        relatieId = id
        break
      }
    }
  }

  if (!relatieId && row.relatie?.trim()) {
    results.noRelatie.push(row.relatie.trim())
  }

  // Status
  let status = 'actief'
  const fase = (row.fase || '').toLowerCase()
  if (fase === 'klaar') status = 'afgerond'

  // Bedrag
  let budget = null
  if (row.bedrag) {
    const cleaned = row.bedrag.replace(/\./g, '').replace(',', '.')
    const parsed = parseFloat(cleaned)
    if (!isNaN(parsed)) budget = parsed
  }

  // Duplicaat check
  const dupKey = `${naam.toLowerCase().trim()}|${relatieId || ''}`
  if (bestaandeSet.has(dupKey)) {
    results.duplicates++
    continue
  }
  bestaandeSet.add(dupKey)

  toInsert.push({
    administratie_id: adminId,
    relatie_id: relatieId,
    naam,
    omschrijving: row.contactpersoon?.trim() ? `Contactpersoon: ${row.contactpersoon.trim()}` : null,
    status,
    budget,
  })
}

console.log(`\nTe importeren: ${toInsert.length}`)
console.log(`Duplicaten overgeslagen: ${results.duplicates}`)
console.log(`Overgeslagen (geen naam): ${results.skipped}`)

// Insert in batches van 100
for (let i = 0; i < toInsert.length; i += 100) {
  const batch = toInsert.slice(i, i + 100)
  const { error } = await supabase.from('projecten').insert(batch)
  if (error) {
    console.error(`Batch ${i}: ${error.message}`)
    results.errors.push(error.message)
  } else {
    results.imported += batch.length
    process.stdout.write(`  Batch ${i}-${i + batch.length} OK\n`)
  }
}

// Unieke niet-gematchte relaties
const uniqueNoRelatie = [...new Set(results.noRelatie)]
console.log(`\n=== RESULTAAT ===`)
console.log(`Geïmporteerd: ${results.imported}`)
console.log(`Duplicaten: ${results.duplicates}`)
console.log(`Errors: ${results.errors.length}`)

if (uniqueNoRelatie.length > 0) {
  console.log(`\n${uniqueNoRelatie.length} relaties niet gevonden (project wel aangemaakt zonder koppeling):`)
  uniqueNoRelatie.forEach(r => console.log(`  - ${r}`))
}
