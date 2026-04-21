import { createSupabaseAdmin } from './db.mjs'
import { readFileSync } from 'fs'

const supabase = await createSupabaseAdmin()

// Parse semicolon-separated CSV (handles BOM + quotes)
function parseCsv(content) {
  // Strip BOM
  content = content.replace(/^\uFEFF/, '')
  const lines = content.split('\n').filter(l => l.trim())
  const headers = lines[0].split(';').map(h => h.replace(/^"|"$/g, '').trim())
  console.log('  Headers:', headers)
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

// Strip HTML tags
function stripHtml(html) {
  return html.replace(/<[^>]*>/g, '').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').trim()
}

// Lees CSV's
console.log('Taken CSV:')
const alleTaken = parseCsv(readFileSync('/Users/houterminiopslag/Downloads/Taken 2.csv', 'utf-8'))
console.log('Notities CSV:')
const alleNotities = parseCsv(readFileSync('/Users/houterminiopslag/Downloads/Taken_Notities 2.csv', 'utf-8'))

// Filter nieuwe taken (nummer > 2026-00990)
const nieuweTaken = alleTaken.filter(t => t.Nummer > '2026-00990')
console.log(`\nNieuwe taken: ${nieuweTaken.length}`)

// Groep notities per taak UUID
const notitiesPerTaak = new Map()
alleNotities.forEach(n => {
  const uuid = n.parent
  if (!uuid) return
  if (!notitiesPerTaak.has(uuid)) notitiesPerTaak.set(uuid, [])
  const tekst = stripHtml(n.Notities_Inhoud || '')
  if (tekst) notitiesPerTaak.get(uuid).push(tekst)
})
console.log(`Unieke taken met notities: ${notitiesPerTaak.size}`)

// Haal de geïmporteerde taken op uit DB
const taaknummers = nieuweTaken.map(t => t.Nummer)
const { data: dbTaken } = await supabase.from('taken').select('id, taaknummer').in('taaknummer', taaknummers)
console.log(`Taken in DB: ${dbTaken?.length || 0}`)

const taakIdMap = new Map()
if (dbTaken) dbTaken.forEach(t => taakIdMap.set(t.taaknummer, t.id))

// CSV uuid → taaknummer mapping
const uuidToNummer = new Map()
nieuweTaken.forEach(t => uuidToNummer.set(t.uuid, t.Nummer))

let updated = 0
let skipped = 0
let noNotities = 0

for (const taak of nieuweTaken) {
  const taakId = taakIdMap.get(taak.Nummer)
  if (!taakId) { skipped++; continue }

  const notities = notitiesPerTaak.get(taak.uuid) || []
  if (notities.length === 0) { noNotities++; continue }

  const omschrijving = notities.join('\n\n---\n\n')

  const { error } = await supabase.from('taken').update({ omschrijving }).eq('id', taakId)
  if (error) {
    console.error(`Update ${taak.Nummer} mislukt:`, error.message)
  } else {
    updated++
  }
}

console.log(`\n=== Notities → Omschrijving ===`)
console.log(`Taken bijgewerkt met notities: ${updated}`)
console.log(`Taken zonder notities: ${noNotities}`)
console.log(`Overgeslagen (niet in DB): ${skipped}`)
