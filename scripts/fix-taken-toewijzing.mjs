import { createSupabaseAdmin } from './db.mjs'
import { readFileSync } from 'fs'

function parseCsv(content) {
  content = content.replace(/^﻿/, '')
  const lines = content.split('\n').filter(l => l.trim())
  const headers = lines[0].split(';').map(h => h.replace(/^"|"$/g, '').trim())
  return lines.slice(1).map(line => {
    const values = []
    let current = ''
    let inQuotes = false
    for (const char of line) {
      if (char === '"') { inQuotes = !inQuotes; continue }
      if (char === ';' && !inQuotes) { values.push(current.trim()); current = ''; continue }
      current += char
    }
    values.push(current.trim())
    const obj = {}
    headers.forEach((h, i) => obj[h] = values[i] || '')
    return obj
  })
}

const supa = await createSupabaseAdmin()

// Beide CSVs verzamelen
const csv1 = parseCsv(readFileSync('/Users/houterminiopslag/Downloads/Taken.csv', 'utf-8'))
const csv2 = parseCsv(readFileSync('/Users/houterminiopslag/Downloads/Taken 2.csv', 'utf-8'))
const alleTaken = [...csv1, ...csv2]
console.log('Totaal regels in CSVs:', alleTaken.length)

// Alle profielen ophalen
const adminId = 'e69b63b6-1027-4b35-95d7-0df18f697071'
const { data: profielen } = await supa.from('profielen').select('id, naam').eq('administratie_id', adminId)
const profielMap = new Map()
for (const p of profielen) {
  if (!p.naam) continue
  profielMap.set(p.naam.toLowerCase().trim(), p.id)
  // Ook op voornaam matchen
  const voornaam = p.naam.split(/\s+/)[0].toLowerCase()
  if (!profielMap.has(voornaam)) profielMap.set(voornaam, p.id)
}
console.log('Profielen:', [...profielMap.keys()])

// Tel matches per naam
const matchTeller = {}
const updates = []
for (const t of alleTaken) {
  const naam = (t['Toegewezen_aan_Voornaam__achternaam'] || '').trim()
  const nummer = (t['Nummer'] || '').trim()
  if (!naam || !nummer) continue

  // Probeer exact, dan voornaam, dan achternaam
  const lower = naam.toLowerCase()
  let profielId = profielMap.get(lower)
  if (!profielId) {
    const parts = naam.split(/\s+/)
    for (const part of parts) {
      profielId = profielMap.get(part.toLowerCase())
      if (profielId) break
    }
  }

  matchTeller[naam] = (matchTeller[naam] || 0) + 1
  if (profielId) {
    updates.push({ taaknummer: nummer, toegewezen_aan: profielId })
  }
}

console.log('\nMatches per Tribe-naam:')
for (const [naam, count] of Object.entries(matchTeller)) {
  console.log(` - ${naam}: ${count}`)
}

console.log(`\nKlaar voor update: ${updates.length} taken`)

// Update in batches
let updated = 0, skipped = 0
for (let i = 0; i < updates.length; i += 50) {
  const batch = updates.slice(i, i + 50)
  for (const u of batch) {
    const { error, count } = await supa.from('taken').update({ toegewezen_aan: u.toegewezen_aan }).eq('taaknummer', u.taaknummer).eq('administratie_id', adminId).select('id', { count:'exact', head:true })
    if (error) { console.error('Error for', u.taaknummer, ':', error.message); skipped++ }
    else updated++
  }
  if (i % 200 === 0) console.log(`  ${i} / ${updates.length} verwerkt...`)
}
console.log(`\n✓ ${updated} taken bijgewerkt, ${skipped} errors`)

// Verificatie
const counts = {}
for (const p of profielen) {
  const { count } = await supa.from('taken').select('id', { count:'exact', head:true }).eq('administratie_id', adminId).eq('toegewezen_aan', p.id).neq('status','afgerond')
  counts[p.naam] = count
}
console.log('\nNieuwe verdeling open taken:')
for (const [naam, c] of Object.entries(counts)) console.log(` - ${naam}: ${c}`)
