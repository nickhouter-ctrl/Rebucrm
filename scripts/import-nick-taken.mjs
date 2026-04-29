// Importeer taken voor Nick Burgers + Nick Houter uit Tribe CSV-export.
//
// Strategie:
//   • Nick Burgers: ALLE bestaande taken verwijderen, dan exact de 35 uit
//     Taken 5.csv toevoegen.
//   • Nick Houter: bestaande taken behouden (die zijn uit nieuwe offerte-
//     verzendingen), 66 uit Taken 6.csv toevoegen waarbij we duplicaten
//     overslaan op basis van titel + klant + deadline.
//
// Run: node scripts/import-nick-taken.mjs           (dry-run)
//      node scripts/import-nick-taken.mjs fix       (toepassen)

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
const dryRun = process.argv[2] !== 'fix'

// CSV-parser voor Tribe-export: semicolon delimiter, dubbele-quote escaping.
function parseCsv(text) {
  // CRLF normaliseren
  text = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n')
  const rows = []
  let row = []
  let field = ''
  let inQuotes = false
  for (let i = 0; i < text.length; i++) {
    const c = text[i]
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') { field += '"'; i++ }
        else inQuotes = false
      } else field += c
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

function parseCsvFile(path) {
  const raw = readFileSync(path, 'utf-8')
  const rows = parseCsv(raw)
  const header = rows[0]
  const records = []
  for (let i = 1; i < rows.length; i++) {
    if (rows[i].length < 5) continue  // skip empty/incomplete
    const r = {}
    for (let j = 0; j < header.length; j++) r[header[j]] = rows[i][j] ?? ''
    // Skip lege rijen (geen onderwerp en geen relatie)
    if (!r.Onderwerp && !r.Relatie_name) continue
    records.push(r)
  }
  return records
}

const burgersRecords = parseCsvFile('/Users/houterminiopslag/Downloads/Taken 5.csv')
const houterRecords = parseCsvFile('/Users/houterminiopslag/Downloads/Taken 6.csv')
console.log(`Taken 5 (Nick Burgers): ${burgersRecords.length} rijen`)
console.log(`Taken 6 (Nick Houter): ${houterRecords.length} rijen`)

// Vind beide medewerkers
const { data: medewerkers } = await sb.from('medewerkers').select('id, naam, profiel_id').or('naam.ilike.%Nick Burgers%,naam.ilike.%Nick Houter%')
const burgers = medewerkers.find(m => m.naam.toLowerCase().includes('burgers'))
const houter = medewerkers.find(m => m.naam.toLowerCase().includes('houter'))
if (!burgers || !houter) { console.error('Een van beide medewerkers niet gevonden'); process.exit(1) }
console.log(`Nick Burgers id=${burgers.id} profiel_id=${burgers.profiel_id}`)
console.log(`Nick Houter id=${houter.id} profiel_id=${houter.profiel_id}`)

// Vind administratie-id (alle medewerkers zijn binnen Rebu)
const { data: profielBurgers } = await sb.from('profielen').select('administratie_id').eq('id', burgers.profiel_id).maybeSingle()
const adminId = profielBurgers?.administratie_id
if (!adminId) { console.error('Geen administratie_id'); process.exit(1) }

// Laad alle relaties + projecten in geheugen voor matching
const { data: relaties } = await sb.from('relaties').select('id, bedrijfsnaam, contactpersoon').eq('administratie_id', adminId)
const relMap = new Map()
for (const r of relaties) {
  const k = (r.bedrijfsnaam || '').toLowerCase().trim()
  if (k) relMap.set(k, r)
}

const { data: projecten } = await sb.from('projecten').select('id, naam, relatie_id, status').eq('administratie_id', adminId)
const projByRel = new Map()
for (const p of projecten) {
  if (!projByRel.has(p.relatie_id)) projByRel.set(p.relatie_id, [])
  projByRel.get(p.relatie_id).push(p)
}

// Datum parser: "DD-MM-YYYY HH:mm" of "DD-MM-YYYY" → ISO date string
function parseDate(s) {
  if (!s) return null
  const m = s.match(/^(\d{2})-(\d{2})-(\d{4})/)
  if (!m) return null
  return `${m[3]}-${m[2]}-${m[1]}`
}

// Volgend taaknummer ophalen
async function nextTaaknummer() {
  const { data } = await sb.rpc('volgende_nummer', { p_administratie_id: adminId, p_type: 'taak' })
  return data
}

async function importRecord(record, medewerker, profielId) {
  const titel = (record.Onderwerp || '').trim() || 'Opvolgen'
  const relatieName = (record.Relatie_name || '').trim()
  const projectNaam = (record.Gerelateerd_aan_activiteit_Onderwerp || '').trim()
  const deadline = parseDate(record.Startdatum)
  const tribeNummer = (record.Nummer || '').trim()
  const type = (record.Type_Naam_vertaald || '').trim() || 'Uitwerken'

  // Vind/maak relatie
  let relatieId = null
  if (relatieName) {
    const rel = relMap.get(relatieName.toLowerCase())
    if (rel) relatieId = rel.id
    else {
      // Probeer fuzzy: substring-match
      for (const [k, r] of relMap) {
        if (k.includes(relatieName.toLowerCase()) || relatieName.toLowerCase().includes(k)) {
          if (k.length >= 4) { relatieId = r.id; break }
        }
      }
    }
    if (!relatieId) {
      // Maak nieuwe relatie aan
      const { data: nieuwe } = await sb.from('relaties').insert({
        administratie_id: adminId,
        bedrijfsnaam: relatieName,
        type: 'zakelijk',
      }).select('id').single()
      relatieId = nieuwe?.id || null
      if (relatieId) relMap.set(relatieName.toLowerCase(), { id: relatieId, bedrijfsnaam: relatieName })
    }
  }

  // Vind/maak project (verkoopkans) op naam
  let projectId = null
  if (projectNaam && relatieId) {
    const lijst = projByRel.get(relatieId) || []
    const match = lijst.find(p => (p.naam || '').toLowerCase() === projectNaam.toLowerCase())
    if (match) projectId = match.id
    else {
      const { data: nieuw } = await sb.from('projecten').insert({
        administratie_id: adminId,
        relatie_id: relatieId,
        naam: projectNaam,
        status: 'actief',
        bron: 'tribe-import',
      }).select('id').single()
      projectId = nieuw?.id || null
      if (projectId) {
        if (!projByRel.has(relatieId)) projByRel.set(relatieId, [])
        projByRel.get(relatieId).push({ id: projectId, naam: projectNaam, relatie_id: relatieId, status: 'actief' })
      }
    }
  }

  return {
    administratie_id: adminId,
    relatie_id: relatieId,
    project_id: projectId,
    titel,
    omschrijving: [tribeNummer && `Tribe: ${tribeNummer}`, type && `Type: ${type}`].filter(Boolean).join(' · ') || null,
    deadline,
    status: 'open',
    prioriteit: 'normaal',
    medewerker_id: medewerker.id,
    toegewezen_aan: profielId,
  }
}

// === Stap 1: Nick Burgers — full reset ===
console.log(`\n=== Nick Burgers ===`)
const { data: huidigeBurgers } = await sb.from('taken')
  .select('id')
  .or(`medewerker_id.eq.${burgers.id},toegewezen_aan.eq.${burgers.profiel_id}`)
console.log(`Huidige taken: ${huidigeBurgers?.length || 0} → wordt verwijderd`)

const burgersInserts = []
for (const rec of burgersRecords) {
  const taak = await importRecord(rec, burgers, burgers.profiel_id)
  burgersInserts.push(taak)
}
console.log(`Te importeren: ${burgersInserts.length} taken`)

if (!dryRun && huidigeBurgers?.length) {
  const ids = huidigeBurgers.map(t => t.id)
  await sb.from('taak_notities').delete().in('taak_id', ids)
  const { error } = await sb.from('taken').delete().in('id', ids)
  if (error) console.error('Verwijderen oude Burgers-taken faalde:', error.message)
  else console.log(`Verwijderd: ${ids.length} oude taken`)
}

if (!dryRun) {
  // Voeg taaknummers toe
  for (const t of burgersInserts) t.taaknummer = await nextTaaknummer()
  const { error } = await sb.from('taken').insert(burgersInserts)
  if (error) console.error('Insert Burgers faalde:', error.message)
  else console.log(`✓ ${burgersInserts.length} taken aangemaakt voor Nick Burgers`)
}

// === Stap 2: Nick Houter — additief, skip duplicaten ===
console.log(`\n=== Nick Houter ===`)
const { data: huidigeHouter } = await sb.from('taken')
  .select('id, titel, deadline, relatie_id')
  .or(`medewerker_id.eq.${houter.id},toegewezen_aan.eq.${houter.profiel_id}`)
console.log(`Huidige taken: ${huidigeHouter?.length || 0} (blijven staan)`)

// Bouw dedup-key set
const dupSet = new Set()
for (const t of (huidigeHouter || [])) {
  dupSet.add(`${(t.titel || '').toLowerCase()}|${t.relatie_id || ''}|${(t.deadline || '').slice(0, 10)}`)
}

const houterInserts = []
let skipped = 0
for (const rec of houterRecords) {
  const taak = await importRecord(rec, houter, houter.profiel_id)
  const key = `${taak.titel.toLowerCase()}|${taak.relatie_id || ''}|${(taak.deadline || '').slice(0, 10)}`
  if (dupSet.has(key)) { skipped++; continue }
  houterInserts.push(taak)
  dupSet.add(key)
}
console.log(`Te importeren: ${houterInserts.length} taken (${skipped} duplicaten geskipt)`)

if (!dryRun && houterInserts.length > 0) {
  for (const t of houterInserts) t.taaknummer = await nextTaaknummer()
  const { error } = await sb.from('taken').insert(houterInserts)
  if (error) console.error('Insert Houter faalde:', error.message)
  else console.log(`✓ ${houterInserts.length} nieuwe taken voor Nick Houter`)
}

if (dryRun) console.log('\n[DRY-RUN] run met "fix" om toe te passen')
else console.log('\nKlaar.')
