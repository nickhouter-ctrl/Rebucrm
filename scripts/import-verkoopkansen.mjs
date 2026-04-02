#!/usr/bin/env node
/**
 * Import verkoopkansen CSV als projecten
 * Usage: node scripts/import-verkoopkansen.mjs
 */
import { readFileSync } from 'fs'

const CSV_PATH = process.argv[2] || '/Users/houterminiopslag/Downloads/Verkoopkansen.csv'
const API_URL = process.env.API_URL || 'http://localhost:3000/api/import/verkoopkansen'

// Parse CSV (semicolon-separated, quoted)
const content = readFileSync(CSV_PATH, 'utf-8')
const lines = content.split('\n').filter(l => l.trim())
const header = lines[0].split(';').map(h => h.replace(/"/g, '').trim())
console.log('Headers:', header)

const rows = []
for (let i = 1; i < lines.length; i++) {
  const values = lines[i].split(';').map(v => v.replace(/"/g, '').trim())
  rows.push({
    nummer: values[0] || '',
    type: values[1] || '',
    relatie: values[2] || '',
    relatie_type: values[3] || '',
    onderwerp: values[4] || '',
    contactpersoon: values[5] || '',
    fase: values[6] || '',
    bedrag: values[7] || '',
    kans: values[8] || '',
  })
}

console.log(`Parsed ${rows.length} verkoopkansen uit CSV`)
console.log('Voorbeeld:', rows[0])

// Stuur naar API
// Je moet ingelogd zijn in de browser - kopieer je cookie
const COOKIE = process.env.COOKIE || ''

const resp = await fetch(API_URL, {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    ...(COOKIE ? { Cookie: COOKIE } : {}),
  },
  body: JSON.stringify({ rows }),
})

const result = await resp.json()
console.log('\nResultaat:')
console.log(JSON.stringify(result, null, 2))

if (result.noRelatie?.length > 0) {
  console.log(`\n⚠ ${result.noRelatie.length} relaties niet gevonden:`)
  result.noRelatie.forEach(r => console.log(`  - ${r}`))
}
