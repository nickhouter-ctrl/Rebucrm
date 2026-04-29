// Importeer exact de 66 Houter-taken uit Taken 6.csv. Houter's profiel is na
// de profiel-swap profiel-id 505912c3 (info@rebukozijnen.nl).
import { readFileSync } from 'fs'
import { resolve, dirname } from 'path'
import { fileURLToPath } from 'url'
import { createSupabaseAdmin } from './db.mjs'

const __dirname = dirname(fileURLToPath(import.meta.url))
try {
  const envPath = resolve(__dirname, '..', '.env.local')
  for (const line of readFileSync(envPath, 'utf-8').split('\n')) {
    const m = line.match(/^([^#=]+)=(.*)$/)
    if (m) { const k = m[1].trim(); const v = m[2].trim().replace(/^["']|["']$/g, ''); if (!process.env[k]) process.env[k] = v }
  }
} catch {}

const sb = await createSupabaseAdmin()

function parseCsv(text) {
  text = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n')
  const rows = []; let row = []; let field = ''; let inQuotes = false
  for (let i = 0; i < text.length; i++) {
    const c = text[i]
    if (inQuotes) {
      if (c === '"') { if (text[i + 1] === '"') { field += '"'; i++ } else inQuotes = false }
      else field += c
    } else {
      if (c === '"') inQuotes = true
      else if (c === ';') { row.push(field); field = '' }
      else if (c === '\n') { row.push(field); rows.push(row); row = []; field = '' }
      else field += c
    }
  }
  if (field || row.length) { row.push(field); rows.push(row) }
  return rows
}

const raw = readFileSync('/Users/houterminiopslag/Downloads/Taken 6.csv', 'utf-8')
const rows = parseCsv(raw)
const header = rows[0]
const records = []
for (let i = 1; i < rows.length; i++) {
  if (rows[i].length < 5) continue
  const r = {}
  for (let j = 0; j < header.length; j++) r[header[j]] = rows[i][j] ?? ''
  if (!r.Onderwerp && !r.Relatie_name) continue
  records.push(r)
}
console.log(`CSV-records: ${records.length}`)

const houterMedId = '2f63114e-fa21-44bf-b814-d74f937c2b7f'
const houterProfielId = '505912c3-c8b9-4057-94af-af714e0e7e46'  // info@ na profiel-swap
const adminId = 'e69b63b6-1027-4b35-95d7-0df18f697071'

const { data: relaties } = await sb.from('relaties').select('id, bedrijfsnaam').eq('administratie_id', adminId)
const relMap = new Map(); for (const r of relaties) { const k = (r.bedrijfsnaam||'').toLowerCase().trim(); if (k) relMap.set(k, r) }
const { data: projecten } = await sb.from('projecten').select('id, naam, relatie_id').eq('administratie_id', adminId)
const projByRel = new Map()
for (const p of projecten) { if (!projByRel.has(p.relatie_id)) projByRel.set(p.relatie_id, []); projByRel.get(p.relatie_id).push(p) }

function parseDate(s) { if (!s) return null; const m = s.match(/^(\d{2})-(\d{2})-(\d{4})/); return m ? `${m[3]}-${m[2]}-${m[1]}` : null }
async function nextTaaknummer() { const { data } = await sb.rpc('volgende_nummer', { p_administratie_id: adminId, p_type: 'taak' }); return data }

const inserts = []
for (const rec of records) {
  const titel = (rec.Onderwerp || '').trim() || 'Opvolgen'
  const relatieName = (rec.Relatie_name || '').trim()
  const projectNaam = (rec.Gerelateerd_aan_activiteit_Onderwerp || '').trim()
  const deadline = parseDate(rec.Startdatum)
  const tribeNummer = (rec.Nummer || '').trim()
  const type = (rec.Type_Naam_vertaald || '').trim() || 'Uitwerken'

  let relatieId = null
  if (relatieName) {
    const rel = relMap.get(relatieName.toLowerCase())
    if (rel) relatieId = rel.id
    else {
      for (const [k, r] of relMap) if (k.includes(relatieName.toLowerCase()) && k.length >= 4) { relatieId = r.id; break }
    }
    if (!relatieId) {
      const { data: nieuwe } = await sb.from('relaties').insert({ administratie_id: adminId, bedrijfsnaam: relatieName, type: 'zakelijk' }).select('id').single()
      relatieId = nieuwe?.id || null
      if (relatieId) relMap.set(relatieName.toLowerCase(), { id: relatieId, bedrijfsnaam: relatieName })
    }
  }

  let projectId = null
  if (projectNaam && relatieId) {
    const lijst = projByRel.get(relatieId) || []
    const match = lijst.find(p => (p.naam || '').toLowerCase() === projectNaam.toLowerCase())
    if (match) projectId = match.id
    else {
      const { data: n } = await sb.from('projecten').insert({ administratie_id: adminId, relatie_id: relatieId, naam: projectNaam, status: 'actief', bron: 'tribe-import' }).select('id').single()
      projectId = n?.id || null
      if (projectId) { if (!projByRel.has(relatieId)) projByRel.set(relatieId, []); projByRel.get(relatieId).push({ id: projectId, naam: projectNaam, relatie_id: relatieId }) }
    }
  }

  inserts.push({
    administratie_id: adminId,
    relatie_id: relatieId,
    project_id: projectId,
    titel,
    omschrijving: [tribeNummer && `Tribe: ${tribeNummer}`, type && `Type: ${type}`].filter(Boolean).join(' · ') || null,
    deadline,
    status: 'open',
    prioriteit: 'normaal',
    medewerker_id: houterMedId,
    toegewezen_aan: houterProfielId,
  })
}

console.log(`Te importeren: ${inserts.length} taken`)
for (const t of inserts) t.taaknummer = await nextTaaknummer()
const { error } = await sb.from('taken').insert(inserts)
if (error) { console.error('Fout:', error.message); process.exit(1) }
console.log(`✓ ${inserts.length} taken aangemaakt voor Nick Houter`)

const { count } = await sb.from('taken').select('id', { count: 'exact', head: true }).or(`medewerker_id.eq.${houterMedId},toegewezen_aan.eq.${houterProfielId}`)
console.log('Verificatie totaal Houter:', count)
