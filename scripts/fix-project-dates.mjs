import XLSX from 'xlsx'
import { createSupabaseAdmin } from './db.mjs'

const wb = XLSX.readFile('/Users/houterminiopslag/Downloads/6bf80a50-3327-407c-8a36-6876a67d2ea4/Offertes.xlsx')
const data = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]])

const supabase = await createSupabaseAdmin()
const { data: admin } = await supabase.from('administraties').select('id').ilike('naam', '%Rebu%').single()
const adminId = admin.id

// Haal alle projecten op
const { data: projecten } = await supabase.from('projecten').select('id, naam, relatie_id').eq('administratie_id', adminId)

function normaliseer(naam) {
  return (naam || '').toLowerCase().replace(/[^a-z0-9]/g, '').trim()
}

// Map projectnaam → project
const projectMap = new Map()
for (const p of projecten) {
  const key = normaliseer(p.naam)
  if (key && !projectMap.has(key)) {
    projectMap.set(key, p)
  }
}

// Haal relaties op voor koppeling
const { data: relaties } = await supabase.from('relaties').select('id, bedrijfsnaam').eq('administratie_id', adminId)
const relatieMap = new Map()
for (const r of relaties) {
  const key = normaliseer(r.bedrijfsnaam)
  if (key) relatieMap.set(key, r)
}

// Verwerk elke Excel-rij
let updated = 0
let relatieLinked = 0
let notFound = 0

for (const row of data) {
  const onderwerp = row.Onderwerp || ''
  const nummer = row.Nummer ? String(row.Nummer) : ''

  // Bepaal jaar uit nummer
  const jaarMatch = nummer.match(/(2024|2025)/)
  if (!jaarMatch) continue
  const jaar = parseInt(jaarMatch[1])

  // Zoek project op basis van onderwerp
  const key = normaliseer(onderwerp)
  const project = projectMap.get(key)
  if (!project) {
    notFound++
    continue
  }

  // Bepaal een geschatte datum op basis van het volgnummer
  const numMatch = nummer.match(/\d{4}-?0*(\d+)/)
  let maand = 6 // default midden van het jaar
  let dag = 15
  if (numMatch) {
    const volg = parseInt(numMatch[1])
    // Verdeel over het jaar: schat ~100 offertes per maand
    maand = Math.min(12, Math.max(1, Math.ceil(volg / 100)))
    dag = Math.min(28, ((volg - 1) % 28) + 1)
  }

  const datum = new Date(jaar, maand - 1, dag).toISOString()

  // Update project created_at + relatie koppeling
  const updateData = { created_at: datum }

  if (row.Relatie_name && !project.relatie_id) {
    const relatieKey = normaliseer(row.Relatie_name)
    const relatie = relatieMap.get(relatieKey)
    if (relatie) {
      updateData.relatie_id = relatie.id
      relatieLinked++
    }
  }

  const { error } = await supabase
    .from('projecten')
    .update(updateData)
    .eq('id', project.id)

  if (!error) updated++
  else console.error('Fout:', project.naam, error.message)
}

console.log('Projecten met datum bijgewerkt:', updated)
console.log('Relaties gekoppeld:', relatieLinked)
console.log('Niet gevonden (onderwerp match):', notFound)
