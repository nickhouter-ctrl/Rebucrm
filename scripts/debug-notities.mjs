import { readFileSync } from 'fs'

function parseCsv(content) {
  const lines = content.split('\n').filter(l => l.trim())
  const headers = lines[0].split(';').map(h => h.replace(/^"|"$/g, '').replace(/^\uFEFF/, ''))
  return { headers, rows: lines.slice(1).map(line => {
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
  })}
}

const taken = parseCsv(readFileSync('/Users/houterminiopslag/Downloads/Taken 2.csv', 'utf-8'))
const notities = parseCsv(readFileSync('/Users/houterminiopslag/Downloads/Taken_Notities 2.csv', 'utf-8'))

console.log('Taken headers:', taken.headers)
console.log('Notities headers:', notities.headers)
console.log('Taken count:', taken.rows.length)
console.log('Notities count:', notities.rows.length)

const nieuweTaken = taken.rows.filter(t => t.Nummer > '2026-00990')
console.log('Nieuwe taken:', nieuweTaken.length)

const nieuweUuids = new Set(nieuweTaken.map(t => t.uuid))
const matchingNotities = notities.rows.filter(n => nieuweUuids.has(n.parent))
console.log('Notities voor nieuwe taken:', matchingNotities.length)

if (matchingNotities.length > 0) {
  console.log('Voorbeeld:', matchingNotities[0].parent, matchingNotities[0].Notities_Inhoud?.substring(0, 100))
}

// Check all parents
const allParents = new Set(notities.rows.map(n => n.parent))
const allUuids = new Set(taken.rows.map(t => t.uuid))
let matching = 0
for (const p of allParents) {
  if (allUuids.has(p)) matching++
}
console.log(`Notities parents die matchen met taken UUIDs: ${matching}/${allParents.size}`)
