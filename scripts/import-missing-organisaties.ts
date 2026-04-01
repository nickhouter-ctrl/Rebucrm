/**
 * Eenmalig script: importeer ontbrekende organisaties uit Organisaties 2.csv
 *
 * Er zijn ~1790 in de CSV, ~990 in de DB. Dit script voegt de ~800 ontbrekende toe.
 *
 * Gebruik: npx dotenv -e .env.local -- npx tsx scripts/import-missing-organisaties.ts
 * Verwijder dit script na gebruik.
 */

import { createClient } from '@supabase/supabase-js'
import { readFileSync } from 'fs'
import { resolve } from 'path'

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!

if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
  console.error('Missing SUPABASE env vars. Run with: npx dotenv -e .env.local -- npx tsx scripts/import-missing-organisaties.ts')
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

async function main() {
  // 1. Lees CSV
  const csvPath = resolve(process.env.HOME || '', 'Downloads/Organisaties 2.csv')
  let csvContent = readFileSync(csvPath, 'utf-8')
  if (csvContent.charCodeAt(0) === 0xFEFF) csvContent = csvContent.slice(1)
  const rows = parseCSV(csvContent)
  console.log(`CSV: ${rows.length} organisaties gelezen`)

  // 2. Haal administratie_id op (eerste admin profiel)
  const { data: profielen } = await supabase
    .from('profielen')
    .select('administratie_id')
    .eq('rol', 'admin')
    .limit(1)

  const adminId = profielen?.[0]?.administratie_id
  if (!adminId) {
    console.error('Geen administratie gevonden')
    process.exit(1)
  }
  console.log(`Administratie: ${adminId}`)

  // 3. Haal bestaande relatie-namen op
  const { data: existing } = await supabase
    .from('relaties')
    .select('bedrijfsnaam')
    .eq('administratie_id', adminId)

  const existingNames = new Set(
    (existing || []).map(r => r.bedrijfsnaam.toLowerCase().trim())
  )
  console.log(`DB: ${existingNames.size} bestaande relaties`)

  // 4. Bepaal ontbrekende
  const toInsert: {
    administratie_id: string
    bedrijfsnaam: string
    type: string
    adres: string | null
    postcode: string | null
    plaats: string | null
    telefoon: string | null
    email: string | null
  }[] = []

  const duplicates: string[] = []
  const seenNames = new Set(existingNames)

  for (const row of rows) {
    const naam = row['Organisatie_Naam']?.trim()
    if (!naam) continue

    const lower = naam.toLowerCase()
    if (seenNames.has(lower)) {
      duplicates.push(naam)
      continue
    }
    seenNames.add(lower)

    // Bouw adres uit straat + huisnummer + toevoeging
    const straat = row['Organisatie_Bezoekadres_Straat'] || ''
    const huisnr = row['Organisatie_Bezoekadres_Huisnummer'] || ''
    const toev = row['Organisatie_Bezoekadres_Toevoeging'] || ''
    const adres = [straat, huisnr, toev].filter(Boolean).join(' ').trim() || null

    toInsert.push({
      administratie_id: adminId,
      bedrijfsnaam: naam,
      type: 'zakelijk',
      adres,
      postcode: row['Organisatie_Bezoekadres_Postcode'] || null,
      plaats: row['Organisatie_Bezoekadres_Stad'] || null,
      telefoon: row['Organisatie_Telefoonnummer'] || null,
      email: row['Organisatie_E-mailadres'] || null,
    })
  }

  console.log(`\nTe importeren: ${toInsert.length}`)
  console.log(`Duplicaten (al in DB of CSV): ${duplicates.length}`)

  // 5. Insert in batches van 100
  let imported = 0
  const BATCH_SIZE = 100

  for (let i = 0; i < toInsert.length; i += BATCH_SIZE) {
    const batch = toInsert.slice(i, i + BATCH_SIZE)
    const { error } = await supabase.from('relaties').insert(batch)
    if (error) {
      console.error(`  Fout bij batch ${i / BATCH_SIZE + 1}: ${error.message}`)
      // Probeer individueel bij fout
      for (const item of batch) {
        const { error: singleErr } = await supabase.from('relaties').insert(item)
        if (singleErr) {
          console.error(`    Skip "${item.bedrijfsnaam}": ${singleErr.message}`)
        } else {
          imported++
        }
      }
    } else {
      imported += batch.length
      console.log(`  Batch ${Math.floor(i / BATCH_SIZE) + 1}: ${batch.length} geimporteerd`)
    }
  }

  // 6. Verificatie
  const { count } = await supabase
    .from('relaties')
    .select('id', { count: 'exact', head: true })
    .eq('administratie_id', adminId)

  console.log(`\nResultaat:`)
  console.log(`  ${imported} organisaties toegevoegd`)
  console.log(`  ${count} relaties totaal in DB`)
}

main().catch(console.error)
