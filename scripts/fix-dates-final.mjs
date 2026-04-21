import XLSX from 'xlsx'
import { createSupabaseAdmin } from './db.mjs'
import { join } from 'path'

const SOURCE_DIR = '/Users/houterminiopslag/Downloads/6bf80a50-3327-407c-8a36-6876a67d2ea4'
const wb = XLSX.readFile(join(SOURCE_DIR, 'Offertes.xlsx'))
const data = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]])

const supabase = await createSupabaseAdmin()
const { data: admin } = await supabase.from('administraties').select('id').ilike('naam', '%Rebu%').single()

const { data: projecten2026 } = await supabase
  .from('projecten')
  .select('id, naam, created_at')
  .eq('administratie_id', admin.id)
  .gte('created_at', '2026-01-01')

console.log(`${projecten2026.length} projecten nog in 2026`)

function normaliseer(naam) {
  return (naam || '').toLowerCase().replace(/[^a-z0-9]/g, '').trim()
}

function bepaalJaar(nummer) {
  if (!nummer) return null
  // O-2024-xxxx of O-2025-xxxx
  const volledig = nummer.match(/O-?(2024|2025)-/)
  if (volledig) return parseInt(volledig[1])
  // O-24-xxxx → 2024, O-25-xxxx → 2025
  const kort = nummer.match(/O-?(24|25)-/)
  if (kort) return 2000 + parseInt(kort[1])
  // Andere patronen met 2024 of 2025
  const anywhere = nummer.match(/(2024|2025)/)
  if (anywhere) return parseInt(anywhere[1])
  return null
}

let updated = 0
let noMatch = 0
let noYear = 0
let is2026 = 0

for (const p of projecten2026) {
  const pKey = normaliseer(p.naam)

  // Zoek Excel match via 3 strategieën
  let excelRow = null

  // 1: directe match
  for (const row of data) {
    if (normaliseer(row.Onderwerp || '') === pKey) { excelRow = row; break }
  }

  // 2: deelstring match
  if (!excelRow && pKey.length > 5) {
    for (const row of data) {
      const eKey = normaliseer(row.Onderwerp || '')
      if (eKey.length > 5 && (eKey.includes(pKey) || pKey.includes(eKey))) { excelRow = row; break }
    }
  }

  // 3: woord-overlap match
  if (!excelRow) {
    const pWords = p.naam.toLowerCase().split(/\s+/).filter(w => w.length > 2)
    if (pWords.length >= 2) {
      for (const row of data) {
        const eWords = (row.Onderwerp || '').toLowerCase().split(/\s+/).filter(w => w.length > 2)
        const overlap = pWords.filter(w => eWords.some(ew => ew.includes(w) || w.includes(ew)))
        if (overlap.length >= 2 && overlap.length >= Math.min(pWords.length, eWords.length) * 0.6) {
          excelRow = row
          break
        }
      }
    }
  }

  if (!excelRow) { noMatch++; continue }

  const nummer = excelRow.Nummer ? String(excelRow.Nummer) : ''
  const jaar = bepaalJaar(nummer)
  if (!jaar) {
    // Check of het een O-2026 nummer is (deze horen inderdaad in 2026)
    if (nummer.match(/O-?2026/)) { is2026++; continue }
    noYear++
    continue
  }

  const numMatch = nummer.match(/\d+[-]?0*(\d+)$/)
  let maand = 6
  let dag = 15
  if (numMatch) {
    const volg = parseInt(numMatch[1])
    maand = Math.min(12, Math.max(1, Math.ceil(volg / 100)))
    dag = Math.min(28, ((volg - 1) % 28) + 1)
  }

  const datum = new Date(jaar, maand - 1, dag).toISOString()

  const { error } = await supabase
    .from('projecten')
    .update({ created_at: datum })
    .eq('id', p.id)

  if (!error) updated++
  else console.error('Fout:', p.naam, error.message)
}

console.log('\n--- Resultaat ---')
console.log('Bijgewerkt:', updated)
console.log('Geen match in Excel:', noMatch)
console.log('Geen jaar (en niet 2026):', noYear)
console.log('Hoort in 2026 (O-2026-xxx):', is2026)

const { count } = await supabase
  .from('projecten')
  .select('id', { count: 'exact', head: true })
  .eq('administratie_id', admin.id)
  .gte('created_at', '2026-01-01')

console.log('Nog in 2026 na fix:', count)
