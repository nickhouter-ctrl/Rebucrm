// Verwijder alle verkoopkansen + offertes van NDH Vastgoed (testdata).
// Default = dry-run rapport. `node ... fix` past toe.

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

// 1. Vind NDH Vastgoed-relatie (strikt op bedrijfsnaam)
const { data: rels } = await sb.from('relaties')
  .select('id, bedrijfsnaam, contactpersoon, email')
  .ilike('bedrijfsnaam', '%NDH Vastgoed%')
console.log(`NDH-relaties gevonden: ${rels?.length || 0}`)
for (const r of (rels || [])) console.log(`  ${r.id}  ${r.bedrijfsnaam}  contact=${r.contactpersoon || '-'}  email=${r.email || '-'}`)

if (!rels || rels.length === 0) { console.log('Geen NDH-relatie gevonden'); process.exit(0) }
const relIds = rels.map(r => r.id)

// 2. Tellingen
const { data: projecten } = await sb.from('projecten').select('id, naam, status').in('relatie_id', relIds)
const { data: offertes } = await sb.from('offertes').select('id, offertenummer, onderwerp, status, totaal').in('relatie_id', relIds)
const { data: facturen } = await sb.from('facturen').select('id, factuurnummer, status, totaal').in('relatie_id', relIds)
const { data: orders } = await sb.from('orders').select('id, ordernummer, status').in('relatie_id', relIds)
const { data: emails } = await sb.from('emails').select('id').in('relatie_id', relIds)
const { data: taken } = await sb.from('taken').select('id, titel, status').in('relatie_id', relIds)

console.log(`\nVerkoopkansen (projecten): ${projecten?.length || 0}`)
for (const p of (projecten || []).slice(0, 20)) console.log(`  ${p.id}  status=${p.status}  "${p.naam}"`)
console.log(`\nOffertes: ${offertes?.length || 0}`)
for (const o of (offertes || []).slice(0, 20)) console.log(`  ${o.offertenummer}  status=${o.status}  €${o.totaal}  "${o.onderwerp}"`)
console.log(`\nFacturen: ${facturen?.length || 0}`)
for (const f of (facturen || []).slice(0, 10)) console.log(`  ${f.factuurnummer}  status=${f.status}  €${f.totaal}`)
console.log(`\nOrders: ${orders?.length || 0}, Emails: ${emails?.length || 0}, Taken: ${taken?.length || 0}`)

if (facturen && facturen.length > 0) {
  console.log('\n⚠ Er zijn facturen gekoppeld — die laat ik staan tenzij ze ook test-data zijn. Geef expliciet door als die ook weg moeten.')
}

if (dryRun) {
  console.log('\n[DRY-RUN] run met "fix" om verkoopkansen + offertes te verwijderen')
  process.exit(0)
}

// 3. Verwijder cascade: eerst children van offertes/projecten
let stats = { offerteRegels: 0, offertes: 0, projecten: 0, taken: 0, notities: 0 }

if (offertes && offertes.length > 0) {
  const offIds = offertes.map(o => o.id)
  // Offerte regels eerst
  const { count: regCnt } = await sb.from('offerte_regels').select('id', { count: 'exact', head: true }).in('offerte_id', offIds)
  await sb.from('offerte_regels').delete().in('offerte_id', offIds)
  stats.offerteRegels = regCnt || 0
  // Offertes zelf
  const { error: oErr } = await sb.from('offertes').delete().in('id', offIds)
  if (oErr) console.error('Offertes delete fout:', oErr.message)
  else stats.offertes = offIds.length
}

// Alle taken die aan NDH gekoppeld zijn — via relatie OF via project.
const projIds = (projecten || []).map(p => p.id)
const orFilters = []
if (relIds.length) orFilters.push(`relatie_id.in.(${relIds.join(',')})`)
if (projIds.length) orFilters.push(`project_id.in.(${projIds.join(',')})`)
if (orFilters.length) {
  const { data: alleTaken } = await sb.from('taken').select('id').or(orFilters.join(','))
  if (alleTaken?.length) {
    const tIds = alleTaken.map(t => t.id)
    await sb.from('taak_notities').delete().in('taak_id', tIds)
    const { error: tErr } = await sb.from('taken').delete().in('id', tIds)
    if (tErr) console.error('Taken delete fout:', tErr.message)
    else stats.taken = tIds.length
  }
}

if (projecten && projecten.length > 0) {
  // Notities op project
  await sb.from('notities').delete().in('project_id', projIds)
  // Projecten zelf
  const { error: pErr } = await sb.from('projecten').delete().in('id', projIds)
  if (pErr) console.error('Projecten delete fout:', pErr.message)
  else stats.projecten = projIds.length
}

console.log('\nResultaat:', stats)
console.log('Klaar.')
