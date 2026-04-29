// Drie fixes:
//  1. Andy Stoutenburg: project "andy stoutenburg" stond op Klaas Winter
//     Timmerwerken — terugkoppelen naar Andy Stoutenburg.
//  2. Mitchel en Valery: dubbele relatie samenvoegen — bewaar relatie met
//     email + offertes/facturen, verplaats project van duplicaat.
//  3. Stefan en Anna: idem, lege duplicaat verwijderen.
//
// Default = dry-run. `node ... fix` voert daadwerkelijk uit.

import { readFileSync } from 'fs'
import { resolve, dirname } from 'path'
import { fileURLToPath } from 'url'
import { createSupabaseAdmin } from './db.mjs'

const __dirname = dirname(fileURLToPath(import.meta.url))
try {
  const envPath = resolve(__dirname, '..', '.env.local')
  for (const line of readFileSync(envPath, 'utf-8').split('\n')) {
    const m = line.match(/^([^#=]+)=(.*)$/)
    if (m) {
      const k = m[1].trim()
      const v = m[2].trim().replace(/^["']|["']$/g, '')
      if (!process.env[k]) process.env[k] = v
    }
  }
} catch {}

const sb = await createSupabaseAdmin()
const dryRun = process.argv[2] !== 'fix'

const ANDY_PROJECT = '16b462fc-95f9-4f5f-b655-7ad448d4397b'
const ANDY_RELATIE = '26f9b834-5be9-4381-8944-d33276900f0b'

const MV_KEEP = '2770ed6a-790d-4333-83e8-444c72228ec1'  // Mitchel en Valery — heeft offertes/facturen + email
const MV_LOSE = '9e4d2bb4-1511-4207-9ea3-f78e16f670f1'  // Mitchel en Valery — duplicaat met 1 project, geen email

const SA_KEEP = 'ec64f484-6c34-467b-a0a5-b34da367c082'  // Stefan en Anna — heeft offertes/factuur + email
const SA_LOSE = '9ec4f3d4-d20b-41bb-b98a-67a38d9bb375'  // Stefan en Anna — leeg duplicaat

// Tabellen die een relatie_id-kolom hebben en mee moeten verhuizen bij merge
const REL_TABELLEN = ['projecten', 'offertes', 'facturen', 'orders', 'emails', 'taken', 'notities', 'berichten']

async function verplaatsKoppelingen(losingId, keepingId) {
  const samenvatting = {}
  for (const tabel of REL_TABELLEN) {
    try {
      const { count: voor } = await sb.from(tabel).select('id', { count: 'exact', head: true }).eq('relatie_id', losingId)
      if (!voor) continue
      if (dryRun) {
        samenvatting[tabel] = `${voor} (zou worden verplaatst)`
      } else {
        const { error } = await sb.from(tabel).update({ relatie_id: keepingId }).eq('relatie_id', losingId)
        samenvatting[tabel] = error ? `FOUT: ${error.message}` : `${voor} verplaatst`
      }
    } catch (e) {
      samenvatting[tabel] = `skip (${e.message || 'onbekend'})`
    }
  }
  return samenvatting
}

async function verwijderRelatie(id) {
  if (dryRun) return { skipped: 'dry-run' }
  // Verwijder eventuele klant_relaties + dan de relatie zelf
  await sb.from('klant_relaties').delete().eq('relatie_id', id)
  const { error } = await sb.from('relaties').delete().eq('id', id)
  return error ? { error: error.message } : { ok: true }
}

console.log(`Mode: ${dryRun ? 'DRY-RUN' : 'FIX (toegepast)'}\n`)

// === 1. Andy ===
console.log('1. Andy Stoutenburg — project naar juiste relatie')
const { data: project } = await sb.from('projecten').select('id, naam, relatie_id').eq('id', ANDY_PROJECT).single()
console.log(`   Project "${project.naam}" — huidige relatie: ${project.relatie_id}`)
console.log(`   Doelrelatie: ${ANDY_RELATIE}`)
if (project.relatie_id === ANDY_RELATIE) {
  console.log('   Reeds correct gekoppeld — niets te doen.')
} else if (!dryRun) {
  const { error } = await sb.from('projecten').update({ relatie_id: ANDY_RELATIE }).eq('id', ANDY_PROJECT)
  console.log(`   ${error ? `FOUT: ${error.message}` : 'Gekoppeld.'}`)
} else {
  console.log('   [DRY] zou project naar Andy verplaatsen.')
}

// === 2. Mitchel en Valery ===
console.log('\n2. Mitchel en Valery — dubbele relatie samenvoegen')
console.log(`   Bewaren: ${MV_KEEP}`)
console.log(`   Verwijderen: ${MV_LOSE}`)
const mvResult = await verplaatsKoppelingen(MV_LOSE, MV_KEEP)
console.log('   Verplaatsing:', mvResult)
const mvDel = await verwijderRelatie(MV_LOSE)
console.log('   Relatie verwijderen:', mvDel)

// === 3. Stefan en Anna ===
console.log('\n3. Stefan en Anna — dubbele relatie samenvoegen')
console.log(`   Bewaren: ${SA_KEEP}`)
console.log(`   Verwijderen: ${SA_LOSE}`)
const saResult = await verplaatsKoppelingen(SA_LOSE, SA_KEEP)
console.log('   Verplaatsing:', saResult)
const saDel = await verwijderRelatie(SA_LOSE)
console.log('   Relatie verwijderen:', saDel)

if (dryRun) console.log('\n[DRY RUN] Voer opnieuw uit met "fix" om toe te passen.')
else console.log('\nKlaar.')
