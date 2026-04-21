import { createSupabaseAdmin } from './db.mjs'
import { readFileSync } from 'fs'
import { join } from 'path'

const SOURCE = '/Users/houterminiopslag/Downloads/7ecbf974-e396-4f91-a35c-6e0e7e7b173e'
const csv = readFileSync(join(SOURCE, 'Facturen.csv'), 'utf8').replace(/^\uFEFF/, '')
const lines = csv.split('\n').filter(l => l.trim()).slice(1)

// Parse unieke relatie → type mapping uit facturen CSV
const relatieTypes = new Map()
for (const line of lines) {
  const parts = line.split(';').map(v => v.replace(/^"|"$/g, ''))
  const naam = (parts[3] || '').trim()
  const type = (parts[4] || '').trim()
  if (naam && type) {
    // "klant" of "zakelijke klant" → zakelijk, "particuliere klant" → particulier
    const mapped = type.toLowerCase().includes('particulier') ? 'particulier' : 'zakelijk'
    relatieTypes.set(naam.toLowerCase(), mapped)
  }
}
console.log(`${relatieTypes.size} unieke relatie-type mappings uit CSV`)

// Check ook de Offertes.xlsx CSV als die er is
const offertesCSVPath = '/Users/houterminiopslag/Downloads/6bf80a50-3327-407c-8a36-6876a67d2ea4'
try {
  const xlsx = await import('xlsx')
  const wb = xlsx.default.readFile(join(offertesCSVPath, 'Offertes.xlsx'))
  const data = xlsx.default.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]])
  for (const row of data) {
    const naam = (row.Relatie_name || '').trim()
    const type = (row.Relatie_type || '').trim()
    if (naam && type) {
      const mapped = type.toLowerCase().includes('particulier') ? 'particulier' : 'zakelijk'
      if (!relatieTypes.has(naam.toLowerCase())) {
        relatieTypes.set(naam.toLowerCase(), mapped)
      }
    }
  }
  console.log(`${relatieTypes.size} totaal na Offertes.xlsx`)
} catch (e) {
  console.log('Offertes.xlsx niet beschikbaar, ga door met alleen facturen CSV')
}

const supabase = await createSupabaseAdmin()
const { data: admin } = await supabase.from('administraties').select('id').ilike('naam', '%Rebu%').single()
const adminId = admin.id

// Haal alle relaties op
const { data: relaties } = await supabase
  .from('relaties')
  .select('id, bedrijfsnaam, type')
  .eq('administratie_id', adminId)

let updated = 0
let alGoed = 0
let geenMatch = 0

for (const r of relaties) {
  const naam = r.bedrijfsnaam.toLowerCase().trim()
  const csvType = relatieTypes.get(naam)

  if (!csvType) {
    geenMatch++
    continue
  }

  if (r.type === csvType) {
    alGoed++
    continue
  }

  const { error } = await supabase
    .from('relaties')
    .update({ type: csvType })
    .eq('id', r.id)

  if (!error) updated++
  else console.error('Fout:', r.bedrijfsnaam, error.message)
}

console.log('\n--- Resultaat ---')
console.log('Type bijgewerkt:', updated)
console.log('Al correct:', alGoed)
console.log('Geen match in CSV:', geenMatch)

// Toon verdeling
const { data: types } = await supabase
  .from('relaties')
  .select('type')
  .eq('administratie_id', adminId)

const telling = {}
for (const r of types) {
  telling[r.type] = (telling[r.type] || 0) + 1
}
console.log('\nVerdeling na fix:', telling)
