import { createSupabaseAdmin } from './db.mjs'
import { readFileSync } from 'fs'

const supabase = await createSupabaseAdmin()

// Parse semicolon-separated CSV (handles BOM + quotes)
function parseCsv(content) {
  content = content.replace(/^\uFEFF/, '') // Strip BOM
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

// Lees CSV's
const takenCsv = readFileSync('/Users/houterminiopslag/Downloads/Taken 2.csv', 'utf-8')
const notitiesCsv = readFileSync('/Users/houterminiopslag/Downloads/Taken_Notities 2.csv', 'utf-8')

const alleTaken = parseCsv(takenCsv)
const alleNotities = parseCsv(notitiesCsv)

// Filter nieuwe taken (nummer > 2026-00990)
const nieuweTaken = alleTaken.filter(t => t.Nummer > '2026-00990')
console.log(`Totaal taken in CSV: ${alleTaken.length}`)
console.log(`Nieuwe taken (> 2026-00990): ${nieuweTaken.length}`)

// Haal administratie_id op
const { data: admin } = await supabase.from('administraties').select('id').limit(1).single()
const administratieId = admin.id
console.log(`Administratie: ${administratieId}`)

// Haal alle relaties op voor name matching
const { data: relaties } = await supabase.from('relaties').select('id, bedrijfsnaam').eq('administratie_id', administratieId)
const relatieMap = new Map()
relaties.forEach(r => relatieMap.set(r.bedrijfsnaam.toLowerCase().trim(), r.id))

// Map relatie type (DB accepts: zakelijk, particulier)
function mapRelatieType(type) {
  if (!type) return 'zakelijk'
  const t = type.toLowerCase()
  if (t.includes('particulier')) return 'particulier'
  return 'zakelijk'
}

// Strip HTML tags
function stripHtml(html) {
  return html.replace(/<[^>]*>/g, '').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').trim()
}

// Groep notities per taak UUID
const notitiesPerTaak = new Map()
alleNotities.forEach(n => {
  const uuid = n.parent
  if (!notitiesPerTaak.has(uuid)) notitiesPerTaak.set(uuid, [])
  notitiesPerTaak.get(uuid).push(stripHtml(n.Notities_Inhoud))
})

const profielId = 'af691d0b-491b-4b08-b4ff-8417fe6d87e1' // Nick Houter (profielen)
const medewerkerId = '2f63114e-fa21-44bf-b814-d74f937c2b7f' // Nick Houter (medewerkers, voor notities)
console.log(`Profiel: Nick Houter (${profielId})`)

// Check welke nummers al bestaan
const bestaandeNummers = new Set()
const { data: existing } = await supabase.from('taken').select('taaknummer').in('taaknummer', nieuweTaken.map(t => t.Nummer))
if (existing) existing.forEach(t => bestaandeNummers.add(t.taaknummer))
console.log(`Al bestaande nummers (skip): ${bestaandeNummers.size}`)

// Relaties die niet gevonden worden -> aanmaken
const missingRelaties = []
let inserted = 0
let skipped = 0
let relatiesCreated = 0
let notitiesInserted = 0

for (const taak of nieuweTaken) {
  if (bestaandeNummers.has(taak.Nummer)) { skipped++; continue }

  const relatieNaam = taak.Relatie_name.trim()
  let relatieId = null

  if (relatieNaam) {
    relatieId = relatieMap.get(relatieNaam.toLowerCase())

    // Probeer ook fuzzy match
    if (!relatieId) {
      for (const [key, id] of relatieMap) {
        if (key.includes(relatieNaam.toLowerCase()) || relatieNaam.toLowerCase().includes(key)) {
          relatieId = id
          break
        }
      }
    }

    // Relatie aanmaken als niet gevonden
    if (!relatieId) {
      const type = mapRelatieType(taak.Relatie_type)
      const contactpersoon = taak.Contactpersoon_Voornaam__achternaam?.trim() || null
      const { data: newRel, error: relErr } = await supabase.from('relaties').insert({
        administratie_id: administratieId,
        bedrijfsnaam: relatieNaam,
        contactpersoon,
        type,
      }).select('id').single()

      if (newRel) {
        relatieId = newRel.id
        relatieMap.set(relatieNaam.toLowerCase(), relatieId)
        relatiesCreated++
      } else {
        console.error(`Relatie aanmaken mislukt voor "${relatieNaam}":`, relErr?.message)
      }
    }
  }

  // Taak aanmaken
  const { data: newTaak, error: taakErr } = await supabase.from('taken').insert({
    administratie_id: administratieId,
    taaknummer: taak.Nummer,
    titel: taak.Onderwerp || 'Opvolgen',
    relatie_id: relatieId,
    status: 'open',
    toegewezen_aan: profielId, // Nick Houter profiel
  }).select('id').single()

  if (taakErr) {
    console.error(`Taak ${taak.Nummer} mislukt:`, taakErr.message)
    continue
  }

  inserted++

  // Notities als omschrijving op taak zetten (notities tabel is alleen voor relaties)
  const taakNotities = (notitiesPerTaak.get(taak.uuid) || []).filter(Boolean)
  if (taakNotities.length > 0) {
    const omschrijving = taakNotities.join('\n\n---\n\n')
    const { error: notErr } = await supabase.from('taken').update({ omschrijving }).eq('id', newTaak.id)
    if (notErr) console.error(`Omschrijving voor ${taak.Nummer} mislukt:`, notErr.message)
    else notitiesInserted++
  }
}

console.log(`\n=== Resultaat ===`)
console.log(`Taken ingevoegd: ${inserted}`)
console.log(`Taken overgeslagen (bestonden al): ${skipped}`)
console.log(`Relaties aangemaakt: ${relatiesCreated}`)
console.log(`Notities ingevoegd: ${notitiesInserted}`)
