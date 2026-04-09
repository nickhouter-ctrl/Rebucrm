#!/usr/bin/env node
/**
 * Migreer notities uit taken-omschrijvingen naar relatie-notities.
 *
 * Formaat in omschrijving:
 *   [DD-MM-YYYY HH:MM - Naam] notitie tekst
 *
 * Wordt per regel een aparte notitie op de relatie, met datum+tijd als created_at.
 * De "--- Notities ---" header wordt ook verwijderd.
 * Overige tekst (Project:, Oud nummer:, etc.) blijft in de omschrijving.
 *
 * Usage:
 *   node scripts/migrate-taken-notities.mjs           # dry run (preview)
 *   node scripts/migrate-taken-notities.mjs --execute  # daadwerkelijk uitvoeren
 */
import { createDbClient } from './db.mjs'

const execute = process.argv.includes('--execute')

// Match: [DD-MM-YYYY HH:MM - Naam | Optioneel] tekst
const notitieRegex = /^\[(\d{1,2})-(\d{1,2})-(\d{4})\s+(\d{1,2}):(\d{2})\s*-\s*([^\]]+)\]\s*(.*)/

function parseNotitie(line) {
  const m = line.match(notitieRegex)
  if (!m) return null

  const day = parseInt(m[1], 10)
  const month = parseInt(m[2], 10)
  const year = parseInt(m[3], 10)
  const hour = parseInt(m[4], 10)
  const min = parseInt(m[5], 10)
  const auteur = m[6].trim()
  const tekst = m[7].trim()

  if (month < 1 || month > 12 || day < 1 || day > 31) return null
  if (!tekst) return null

  const date = new Date(year, month - 1, day, hour, min, 0)
  return { date, auteur, tekst }
}

function isNotitieHeader(line) {
  return /^-{2,}\s*Notities\s*-{2,}$/.test(line.trim())
}

async function main() {
  const db = await createDbClient()

  try {
    const adminId = 'e69b63b6-1027-4b35-95d7-0df18f697071'

    // Haal eerste profiel op als gebruiker voor notities
    const { rows: [adminUser] } = await db.query(
      `SELECT id FROM profielen WHERE administratie_id = $1 LIMIT 1`,
      [adminId]
    )
    if (!adminUser) { console.error('Geen admin gebruiker gevonden'); return }
    const gebruikerId = adminUser.id

    // Haal relatie-namen op voor leesbare output
    const { rows: relaties } = await db.query(
      `SELECT id, bedrijfsnaam FROM relaties WHERE administratie_id = $1`,
      [adminId]
    )
    const relatieNaam = new Map(relaties.map(r => [r.id, r.bedrijfsnaam]))

    // Haal alle taken met omschrijving en relatie_id
    const { rows: taken } = await db.query(
      `SELECT id, titel, omschrijving, relatie_id, created_at
       FROM taken
       WHERE administratie_id = $1
         AND omschrijving IS NOT NULL
         AND omschrijving != ''
         AND relatie_id IS NOT NULL`,
      [adminId]
    )

    console.log(`Gevonden: ${taken.length} taken met omschrijving + relatie_id\n`)

    let totalNotities = 0
    let totalTaken = 0

    for (const taak of taken) {
      const lines = taak.omschrijving.split('\n')
      const notities = []       // geparseerde notities
      const overig = []         // regels die in omschrijving blijven

      for (const line of lines) {
        const trimmed = line.trim()

        // Lege regels
        if (!trimmed) {
          if (overig.length > 0) overig.push('')
          continue
        }

        // "--- Notities ---" header verwijderen
        if (isNotitieHeader(trimmed)) continue

        // Notitie-regel parsen
        const parsed = parseNotitie(trimmed)
        if (parsed) {
          notities.push(parsed)
        } else {
          overig.push(line)
        }
      }

      if (notities.length === 0) continue

      totalTaken++
      totalNotities += notities.length

      // Resterende omschrijving: verwijder trailing lege regels
      const restOmschrijving = overig.join('\n').trim() || null

      const klantNaam = relatieNaam.get(taak.relatie_id) || taak.relatie_id.slice(0, 8)
      console.log(`--- Taak: "${taak.titel}" | Klant: ${klantNaam} ---`)
      console.log(`  ${notities.length} notitie(s):`)
      for (const n of notities) {
        const dateStr = n.date.toLocaleDateString('nl-NL', { day: '2-digit', month: '2-digit', year: 'numeric' })
        const timeStr = n.date.toLocaleTimeString('nl-NL', { hour: '2-digit', minute: '2-digit' })
        console.log(`    ${dateStr} ${timeStr} [${n.auteur}]: ${n.tekst.slice(0, 80)}${n.tekst.length > 80 ? '...' : ''}`)
      }
      if (restOmschrijving) {
        console.log(`  Overige tekst blijft: "${restOmschrijving.slice(0, 80)}${restOmschrijving.length > 80 ? '...' : ''}"`)
      } else {
        console.log(`  Omschrijving wordt geleegd`)
      }
      console.log()

      if (execute) {
        for (const n of notities) {
          // Tekst inclusief auteur zodat het duidelijk is wie het schreef
          const volledigeTekst = `${n.tekst}\n— ${n.auteur}`
          await db.query(
            `INSERT INTO notities (administratie_id, relatie_id, gebruiker_id, tekst, herinnering_datum, created_at, updated_at)
             VALUES ($1, $2, $3, $4, NULL, $5, $5)`,
            [adminId, taak.relatie_id, gebruikerId, volledigeTekst, n.date.toISOString()]
          )
        }

        // Update omschrijving (bewaar overige tekst, of leeg)
        await db.query(
          `UPDATE taken SET omschrijving = $1 WHERE id = $2`,
          [restOmschrijving, taak.id]
        )
      }
    }

    console.log(`=== Samenvatting ===`)
    console.log(`Taken met notities: ${totalTaken}`)
    console.log(`Totaal notities: ${totalNotities}`)

    if (!execute) {
      console.log(`\nDit was een dry run. Voer uit met: node scripts/migrate-taken-notities.mjs --execute`)
    } else {
      console.log(`\nMigratie voltooid!`)
    }
  } finally {
    await db.end()
  }
}

main().catch(console.error)
