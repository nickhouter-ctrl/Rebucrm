/**
 * Eenmalig script: koppel geïmporteerde TribeCRM taken aan de juiste gebruiker.
 *
 * Alle 354 taken staan nu op Nick Houter. Dit script herverdeelt ze:
 * - Jordy van der Kelen: 246 taken
 * - Nick Burgers: 21 taken
 * - Nick Houter: 86 taken (ongewijzigd)
 *
 * Gebruik: npx dotenv -e .env.local -- npx tsx scripts/link-taken-users.ts
 * Verwijder dit script na gebruik.
 */

import { createClient } from '@supabase/supabase-js'
import { readFileSync } from 'fs'
import { resolve } from 'path'

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!

if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
  console.error('Missing SUPABASE env vars. Run with: npx dotenv -e .env.local -- npx tsx scripts/link-taken-users.ts')
  process.exit(1)
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY)

// Simpele CSV parser voor semicolon-delimited, quoted fields
function parseCSV(content: string): Record<string, string>[] {
  const lines = content.split('\n')
  if (lines.length < 2) return []

  const parseRow = (line: string): string[] => {
    const fields: string[] = []
    let current = ''
    let inQuotes = false
    for (let i = 0; i < line.length; i++) {
      const ch = line[i]
      if (inQuotes) {
        if (ch === '"' && line[i + 1] === '"') {
          current += '"'
          i++
        } else if (ch === '"') {
          inQuotes = false
        } else {
          current += ch
        }
      } else {
        if (ch === '"') {
          inQuotes = true
        } else if (ch === ';') {
          fields.push(current)
          current = ''
        } else {
          current += ch
        }
      }
    }
    fields.push(current)
    return fields
  }

  const headers = parseRow(lines[0].replace(/\r$/, ''))
  const rows: Record<string, string>[] = []

  for (let i = 1; i < lines.length; i++) {
    const line = lines[i].replace(/\r$/, '')
    if (!line.trim()) continue
    const values = parseRow(line)
    const row: Record<string, string> = {}
    for (let j = 0; j < headers.length; j++) {
      row[headers[j]] = (values[j] || '').trim()
    }
    rows.push(row)
  }
  return rows
}

// Naam-normalisatie: strip " | Rebu Kozijnen" en normaliseer spaties
function normalizeName(raw: string): string | null {
  if (!raw || raw === 'Development TribeCRM') return null
  let name = raw.split('|')[0].trim()
  name = name.replace(/\u00a0/g, ' ').replace(/\s+/g, ' ').trim()
  return name
}

function csvDeadline(row: Record<string, string>): string {
  const raw = (row['Startdatum'] || '').trim()
  if (raw) {
    const parts = raw.split(' ')[0].split('-')
    if (parts.length === 3) return `${parts[2]}-${parts[1]}-${parts[0]}`
  }
  return ''
}

async function main() {
  // 1. Lees CSV
  const csvPath = resolve(process.env.HOME || '', 'Downloads/Taken.csv')
  let csvContent = readFileSync(csvPath, 'utf-8')
  if (csvContent.charCodeAt(0) === 0xFEFF) csvContent = csvContent.slice(1)
  const rows = parseCSV(csvContent)
  console.log(`CSV: ${rows.length} rijen gelezen`)

  // 2. Haal profielen op en bouw naam -> id mapping
  const { data: profielen } = await supabase.from('profielen').select('id, naam')
  if (!profielen) { console.error('Kan profielen niet ophalen'); process.exit(1) }

  const profileMap = new Map<string, string>()
  const uniqueNames = new Set<string>()
  for (const row of rows) {
    const name = normalizeName(row['Toegewezen_aan_Voornaam__achternaam'] || '')
    if (name) uniqueNames.add(name)
  }

  for (const name of uniqueNames) {
    const lower = name.toLowerCase()
    // Exacte match
    let match = profielen.find(p =>
      p.naam && p.naam.toLowerCase().replace(/\s+/g, ' ').trim() === lower
    )
    // Fallback: match op voornaam (eerste woord)
    if (!match) {
      const voornaam = lower.split(' ')[0]
      const candidates = profielen.filter(p =>
        p.naam && p.naam.toLowerCase().trim() === voornaam
      )
      if (candidates.length === 1) match = candidates[0]
    }
    // Fallback: voornaam van CSV zit in profiel-naam of andersom
    if (!match) {
      const voornaam = lower.split(' ')[0]
      const candidates = profielen.filter(p =>
        p.naam && (p.naam.toLowerCase().startsWith(voornaam) || voornaam.startsWith(p.naam.toLowerCase()))
      )
      if (candidates.length === 1) match = candidates[0]
    }
    if (match) {
      profileMap.set(name, match.id)
      console.log(`  OK "${name}" -> ${match.id} (${match.naam})`)
    } else {
      console.warn(`  MISS "${name}" -> GEEN MATCH`)
    }
  }

  // 3. Haal alle taken op met relatie-info
  const { data: taken } = await supabase
    .from('taken')
    .select('id, titel, relatie_id, deadline, relatie:relaties(bedrijfsnaam)')

  if (!taken) { console.error('Kan taken niet ophalen'); process.exit(1) }
  console.log(`\nDB: ${taken.length} taken`)

  // 4. Bouw lookups: titel+relatie+deadline, titel+deadline, titel
  type TaakRow = typeof taken[0]

  const getRelatie = (t: TaakRow): string => {
    const rel = t.relatie as unknown
    if (rel && typeof rel === 'object' && !Array.isArray(rel)) {
      return ((rel as Record<string, string>).bedrijfsnaam || '').toLowerCase().trim()
    }
    return ''
  }

  const byTRD = new Map<string, string[]>()
  const byTD = new Map<string, string[]>()
  const byT = new Map<string, string[]>()

  for (const t of taken) {
    const titel = t.titel.toLowerCase().trim()
    const relatie = getRelatie(t)
    const deadline = t.deadline || ''

    const k1 = `${titel}::${relatie}::${deadline}`
    if (!byTRD.has(k1)) byTRD.set(k1, [])
    byTRD.get(k1)!.push(t.id)

    const k2 = `${titel}::${deadline}`
    if (!byTD.has(k2)) byTD.set(k2, [])
    byTD.get(k2)!.push(t.id)

    if (!byT.has(titel)) byT.set(titel, [])
    byT.get(titel)!.push(t.id)
  }

  // 5. Match CSV rijen en update
  // Sorteer: niet-Nick Houter eerst (zij moeten precies gematcht worden, Nick Houter is fallback)
  const NICK_HOUTER_ID = 'af691d0b-491b-4b08-b4ff-8417fe6d87e1'
  const sortedRows = [...rows].sort((a, b) => {
    const nameA = normalizeName(a['Toegewezen_aan_Voornaam__achternaam'] || '')
    const nameB = normalizeName(b['Toegewezen_aan_Voornaam__achternaam'] || '')
    const pidA = nameA ? profileMap.get(nameA) : null
    const pidB = nameB ? profileMap.get(nameB) : null
    const aIsNick = pidA === NICK_HOUTER_ID ? 1 : 0
    const bIsNick = pidB === NICK_HOUTER_ID ? 1 : 0
    return aIsNick - bIsNick
  })

  const usedIds = new Set<string>()
  let updated = 0
  let skipped = 0
  let unchanged = 0
  let notFound = 0

  for (const row of sortedRows) {
    const name = normalizeName(row['Toegewezen_aan_Voornaam__achternaam'] || '')
    if (!name) { skipped++; continue }

    const pid = profileMap.get(name)
    if (!pid) { skipped++; continue }

    const titel = (row['Onderwerp'] || '').toLowerCase().trim()
    const relatie = (row['Relatie_name'] || '').toLowerCase().trim()
    const deadline = csvDeadline(row)

    let found: string | undefined

    // Meest specifiek: titel+relatie+deadline
    const k1 = `${titel}::${relatie}::${deadline}`
    for (const tid of byTRD.get(k1) || []) {
      if (!usedIds.has(tid)) { found = tid; break }
    }

    // Fallback: titel+deadline
    if (!found) {
      const k2 = `${titel}::${deadline}`
      for (const tid of byTD.get(k2) || []) {
        if (!usedIds.has(tid)) { found = tid; break }
      }
    }

    // Fallback: alleen titel
    if (!found) {
      for (const tid of byT.get(titel) || []) {
        if (!usedIds.has(tid)) { found = tid; break }
      }
    }

    if (!found) { notFound++; continue }

    usedIds.add(found)

    // Skip als al correct toegewezen
    if (pid === NICK_HOUTER_ID) { unchanged++; continue }

    const { error } = await supabase
      .from('taken')
      .update({ toegewezen_aan: pid })
      .eq('id', found)

    if (error) {
      console.error(`  Fout bij ${found}: ${error.message}`)
    } else {
      updated++
    }
  }

  console.log(`\nResultaat:`)
  console.log(`  ${updated} taken gewijzigd naar andere gebruiker`)
  console.log(`  ${unchanged} taken ongewijzigd (al correct Nick Houter)`)
  console.log(`  ${skipped} overgeslagen (systeem-user)`)
  console.log(`  ${notFound} niet gevonden in DB`)

  // Verificatie
  const { data: verify } = await supabase
    .from('taken')
    .select('toegewezen_aan, profielen:profielen!taken_toegewezen_aan_fkey(naam)')

  const counts: Record<string, number> = {}
  for (const t of verify || []) {
    const naam = (t.profielen as unknown as { naam: string })?.naam || 'NULL'
    counts[naam] = (counts[naam] || 0) + 1
  }
  console.log(`\nVerificatie - verdeling na update:`)
  for (const [naam, count] of Object.entries(counts).sort((a, b) => b[1] - a[1])) {
    console.log(`  ${naam}: ${count} taken`)
  }
}

main().catch(console.error)
