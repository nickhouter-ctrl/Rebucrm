// Audit + opschoning van taken voor Nick Burgers EN Nick Houter.
// Categoriseert per persoon en biedt een schoonmaak-actie aan.
//
// Default = dry-run rapport. `fix` voert opschoning uit:
//   - email-auto-aangemaakte taken (oude triggers): VERWIJDEREN
//   - duplicaten (zelfde titel + relatie): bewaar oudste, rest weg
//   - open > 90 dagen oud: status='afgerond'

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

const { data: medewerkers } = await sb.from('medewerkers')
  .select('id, naam, profiel_id')
  .or('naam.ilike.%Nick Burgers%,naam.ilike.%Nick Houter%')

if (!medewerkers || medewerkers.length === 0) {
  console.error('Geen Nicks gevonden')
  process.exit(1)
}

const nicks = medewerkers
console.log(`Gevonden: ${nicks.map(n => n.naam).join(', ')}\n`)

let totaalVerwijderd = 0
let totaalAfgerond = 0

for (const nick of nicks) {
  console.log(`\n=== ${nick.naam} (medewerker_id=${nick.id}) ===`)

  const filters = []
  if (nick.id) filters.push(`medewerker_id.eq.${nick.id}`)
  if (nick.profiel_id) filters.push(`toegewezen_aan.eq.${nick.profiel_id}`)
  const { data: taken } = await sb.from('taken')
    .select('id, taaknummer, titel, status, deadline, created_at, relatie_id, offerte_id, project_id, medewerker_id, toegewezen_aan, relatie:relaties(bedrijfsnaam)')
    .or(filters.join(','))
    .order('created_at', { ascending: false })

  if (!taken || taken.length === 0) {
    console.log('  Geen taken gevonden.')
    continue
  }
  const open = taken.filter(t => t.status !== 'afgerond')
  console.log(`  Totaal: ${taken.length} (open=${open.length}, afgerond=${taken.length - open.length})`)

  // Categoriseer alleen open taken voor opschoning
  const emailAuto = []
  const oude = []
  const dupMap = new Map()

  for (const t of open) {
    const titel = t.titel || ''
    if (titel === 'Nieuwe aanvraag - offerte nog te maken'
        || /^Offerte reactie:.*offerte aanpassen$/i.test(titel)
        || /^Nieuwe versie aanvraag\s*-/i.test(titel)
        || /^Reactie ontvangen:/i.test(titel)) {
      emailAuto.push(t)
    }
    const ageDays = (Date.now() - new Date(t.created_at).getTime()) / 86400000
    if (ageDays > 90) oude.push(t)

    const dupKey = `${titel.toLowerCase()}|${t.relatie_id || ''}|${t.offerte_id || ''}`
    if (!dupMap.has(dupKey)) dupMap.set(dupKey, [])
    dupMap.get(dupKey).push(t)
  }

  const dupGroepen = [...dupMap.values()].filter(arr => arr.length > 1)
  const dupExtraRows = dupGroepen.reduce((s, a) => s + a.length - 1, 0)

  console.log(`  Email-auto taken: ${emailAuto.length}`)
  console.log(`  Open > 90 dagen oud: ${oude.length}`)
  console.log(`  Duplicaten: ${dupGroepen.length} groepen → ${dupExtraRows} extra rijen`)

  if (emailAuto.length > 0) {
    console.log('\n  Email-auto voorbeelden:')
    for (const t of emailAuto.slice(0, 5)) {
      console.log(`    - ${t.created_at.slice(0, 10)} "${t.titel}" (${t.relatie?.bedrijfsnaam || '—'})`)
    }
    if (emailAuto.length > 5) console.log(`    ... +${emailAuto.length - 5}`)
  }

  if (dupGroepen.length > 0) {
    console.log('\n  Duplicaten voorbeelden:')
    for (const arr of dupGroepen.slice(0, 5)) {
      console.log(`    - ${arr.length}× "${arr[0].titel}" (${arr[0].relatie?.bedrijfsnaam || '—'})`)
    }
    if (dupGroepen.length > 5) console.log(`    ... +${dupGroepen.length - 5} groepen`)
  }

  if (dryRun) continue

  // FIX
  const teVerwijderen = new Set()
  for (const t of emailAuto) teVerwijderen.add(t.id)
  for (const arr of dupGroepen) {
    arr.sort((a, b) => a.created_at.localeCompare(b.created_at))
    for (let i = 1; i < arr.length; i++) teVerwijderen.add(arr[i].id)
  }
  const ids = [...teVerwijderen]
  if (ids.length) {
    const BATCH = 100
    for (let i = 0; i < ids.length; i += BATCH) {
      const batch = ids.slice(i, i + BATCH)
      const { error } = await sb.from('taken').delete().in('id', batch)
      if (error) console.error(`  Verwijder batch fout:`, error.message)
    }
    console.log(`  ✓ ${ids.length} taken verwijderd`)
    totaalVerwijderd += ids.length
  }

  const oudeIds = oude.filter(t => !teVerwijderen.has(t.id)).map(t => t.id)
  if (oudeIds.length) {
    const BATCH = 100
    for (let i = 0; i < oudeIds.length; i += BATCH) {
      const batch = oudeIds.slice(i, i + BATCH)
      const { error } = await sb.from('taken').update({ status: 'afgerond' }).in('id', batch)
      if (error) console.error(`  Update batch fout:`, error.message)
    }
    console.log(`  ✓ ${oudeIds.length} taken op 'afgerond' gezet`)
    totaalAfgerond += oudeIds.length
  }
}

if (dryRun) {
  console.log('\n\n[DRY RUN] run met "fix" om opschoning toe te passen.')
} else {
  console.log(`\n\nKlaar. Totaal verwijderd: ${totaalVerwijderd}, op afgerond: ${totaalAfgerond}.`)
}
