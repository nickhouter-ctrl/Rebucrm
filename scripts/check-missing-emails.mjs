#!/usr/bin/env node
/**
 * Diagnose: hoeveel relaties missen een emailadres?
 * En check of we het alsnog uit de CSV kunnen halen.
 *
 * Usage:
 *   node scripts/check-missing-emails.mjs
 *   node scripts/check-missing-emails.mjs --update-from-csv /path/to/Organisaties.csv
 */
import { createClient } from '@supabase/supabase-js'
import { readFileSync, existsSync } from 'fs'

const supabase = createClient(
  'https://ewmjbtymbrfuuekkszwj.supabase.co',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImV3bWpidHltYnJmdXVla2tzendqIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3MTIzNTk0MCwiZXhwIjoyMDg2ODExOTQwfQ.wxDilBNdpHugVdSBGgwfu1sN9ZSztiyUAK7cVNwGaA4'
)

const adminId = 'e69b63b6-1027-4b35-95d7-0df18f697071'

// Simpele CSV parser voor semicolon-delimited, quoted fields
function parseCSV(content) {
  const lines = content.split('\n')
  if (lines.length < 2) return []
  const parseRow = (line) => {
    const fields = []
    let current = ''
    let inQuotes = false
    for (let i = 0; i < line.length; i++) {
      const ch = line[i]
      if (inQuotes) {
        if (ch === '"' && line[i + 1] === '"') { current += '"'; i++ }
        else if (ch === '"') inQuotes = false
        else current += ch
      } else {
        if (ch === '"') inQuotes = true
        else if (ch === ';') { fields.push(current); current = '' }
        else current += ch
      }
    }
    fields.push(current)
    return fields
  }
  const headers = parseRow(lines[0].replace(/\r$/, ''))
  const rows = []
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i].replace(/\r$/, '')
    if (!line.trim()) continue
    const values = parseRow(line)
    const row = {}
    for (let j = 0; j < headers.length; j++) {
      row[headers[j]] = (values[j] || '').trim()
    }
    rows.push(row)
  }
  return rows
}

// Haal alle relaties op
let allRelaties = []
let from = 0
while (true) {
  const { data } = await supabase
    .from('relaties')
    .select('id, bedrijfsnaam, email, contactpersoon, type')
    .eq('administratie_id', adminId)
    .range(from, from + 999)
  if (!data || data.length === 0) break
  allRelaties.push(...data)
  from += 1000
}

const totaal = allRelaties.length
const metEmail = allRelaties.filter(r => r.email && r.email.trim())
const zonderEmail = allRelaties.filter(r => !r.email || !r.email.trim())

console.log('=== EMAIL DIAGNOSE ===')
console.log(`Totaal relaties: ${totaal}`)
console.log(`Met email: ${metEmail.length} (${Math.round(metEmail.length / totaal * 100)}%)`)
console.log(`Zonder email: ${zonderEmail.length} (${Math.round(zonderEmail.length / totaal * 100)}%)`)

console.log(`\nPer type:`)
const types = {}
for (const r of allRelaties) {
  const t = r.type || 'onbekend'
  if (!types[t]) types[t] = { total: 0, metEmail: 0, zonderEmail: 0 }
  types[t].total++
  if (r.email && r.email.trim()) types[t].metEmail++
  else types[t].zonderEmail++
}
for (const [type, counts] of Object.entries(types)) {
  console.log(`  ${type}: ${counts.total} totaal, ${counts.metEmail} met email, ${counts.zonderEmail} zonder email`)
}

console.log(`\nVoorbeelden zonder email (eerste 15):`)
zonderEmail.slice(0, 15).forEach(r => {
  console.log(`  - ${r.bedrijfsnaam} (${r.type}, contact: ${r.contactpersoon || '-'})`)
})

// Check of CSV beschikbaar is
const csvArg = process.argv.indexOf('--update-from-csv')
if (csvArg === -1) {
  console.log('\n💡 Om emails bij te werken vanuit CSV, gebruik:')
  console.log('   node scripts/check-missing-emails.mjs --update-from-csv ~/Downloads/Organisaties\\ 2.csv')
  process.exit(0)
}

const csvPath = process.argv[csvArg + 1]
if (!csvPath || !existsSync(csvPath)) {
  console.error(`CSV niet gevonden: ${csvPath}`)
  process.exit(1)
}

let csvContent = readFileSync(csvPath, 'utf-8')
if (csvContent.charCodeAt(0) === 0xFEFF) csvContent = csvContent.slice(1)
const rows = parseCSV(csvContent)

console.log(`\nCSV geladen: ${rows.length} rijen`)
console.log('CSV kolommen:', Object.keys(rows[0]).join(', '))

// Zoek email kolom (specifiek de echte email, niet mailing opt-out etc.)
const emailKolom = Object.keys(rows[0]).find(k =>
  k === 'Organisatie_E-mailadres' || k === 'E-mailadres' || k === 'email' || k === 'Email'
) || Object.keys(rows[0]).find(k =>
  (k.toLowerCase().includes('e-mail') || k.toLowerCase().includes('email')) && !k.toLowerCase().includes('opt') && !k.toLowerCase().includes('financieel')
)
console.log(`Email kolom gevonden: ${emailKolom || 'GEEN'}`)

if (!emailKolom) {
  console.error('Geen email kolom in CSV gevonden!')
  process.exit(1)
}

// Check hoeveel CSV rijen email hebben
const csvMetEmail = rows.filter(r => r[emailKolom]?.trim())
console.log(`CSV rijen met email: ${csvMetEmail.length} / ${rows.length}`)

// Match relaties zonder email met CSV
const naamKolom = Object.keys(rows[0]).find(k => k === 'Organisatie_Naam') || Object.keys(rows[0]).find(k => k === 'Naam') || Object.keys(rows[0])[0]
console.log(`Naam kolom: ${naamKolom}`)

let teUpdaten = 0
const updates = []

for (const relatie of zonderEmail) {
  const csvMatch = rows.find(r => {
    const csvNaam = (r[naamKolom] || '').trim().toLowerCase()
    return csvNaam === relatie.bedrijfsnaam.toLowerCase()
  })
  if (csvMatch && csvMatch[emailKolom]?.trim()) {
    updates.push({ id: relatie.id, bedrijfsnaam: relatie.bedrijfsnaam, email: csvMatch[emailKolom].trim() })
    teUpdaten++
  }
}

console.log(`\nKunnen bijgewerkt worden vanuit CSV: ${teUpdaten}`)
if (updates.length > 0) {
  console.log('Voorbeelden (eerste 10):')
  updates.slice(0, 10).forEach(u => console.log(`  ${u.bedrijfsnaam} → ${u.email}`))
}

// Voer updates uit
if (updates.length > 0 && process.argv.includes('--execute')) {
  console.log('\nUpdating...')
  let done = 0
  for (const u of updates) {
    const { error } = await supabase.from('relaties').update({ email: u.email }).eq('id', u.id)
    if (error) console.error(`  Fout: ${u.bedrijfsnaam}: ${error.message}`)
    done++
    if (done % 50 === 0) console.log(`  ${done}/${updates.length}`)
  }
  console.log(`Klaar! ${done} emails bijgewerkt.`)
} else if (updates.length > 0) {
  console.log('\n⚠️  Voeg --execute toe om emails daadwerkelijk bij te werken.')
}
