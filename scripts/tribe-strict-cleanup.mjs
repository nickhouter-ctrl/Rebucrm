// STRICTE opruiming op basis van Tribe Excel als waarheid.
// BEHOUDT:
//   - Offertes aangemaakt >= cutoff (handmatige recente)
//   - Offertes die matchen met Tribe (op jaar-nummer uit offertenummer of onderwerp)
// VERWIJDERT:
//   - Alle andere offertes (oude duplicaten uit import)
// DAARNA:
//   - Elke behouden offerte krijgt een project (verkoopkans)
//   - Projecten dedup op (relatie + genormaliseerde onderwerp)
import XLSX from 'xlsx'
import { createSupabaseAdmin } from './db.mjs'

const DRY = process.argv.includes('--dry')
const CUTOFF = new Date('2026-04-21T00:00:00Z') // handmatige offertes hierna behouden
const sb = await createSupabaseAdmin()
const { data: admin } = await sb.from('administraties').select('id').ilike('naam', '%Rebu%').single()
const adminId = admin.id

// 1. Lees Tribe
const wb = XLSX.readFile('/Users/houterminiopslag/Downloads/Offertes.xlsx')
const tribe = XLSX.utils.sheet_to_json(wb.Sheets['Offertes'], { defval: null })
const tribeKeys = new Set()
for (const r of tribe) {
  if (!r.Nummer) continue
  const m = String(r.Nummer).match(/(\d{4})[^\d]*(\d{1,6})/)
  if (m) tribeKeys.add(`${m[1]}-${parseInt(m[2])}`)
}
console.log(`Tribe unieke nummers: ${tribeKeys.size}`)

// 2. Haal alle CRM offertes
const crm = []
let from = 0
while (true) {
  const { data } = await sb.from('offertes')
    .select('id, offertenummer, onderwerp, relatie_id, project_id, created_at, datum, status, totaal, versie_nummer')
    .eq('administratie_id', adminId).range(from, from + 999)
  if (!data || data.length === 0) break
  crm.push(...data); from += 1000
}
console.log(`CRM offertes: ${crm.length}`)

// 3. Match-logic
function offerteKeys(o) {
  const keys = new Set()
  const m1 = String(o.offertenummer || '').match(/(\d{4})[^\d]*(\d{1,6})/)
  if (m1) keys.add(`${m1[1]}-${parseInt(m1[2])}`)
  // Uit onderwerp
  const m2s = [...(o.onderwerp || '').matchAll(/(?:Nr\.?\s*)?O?-?(\d{4})-?(\d{3,5})/gi)]
  for (const m of m2s) keys.add(`${m[1]}-${parseInt(m[2])}`)
  return keys
}

const keep = []
const remove = []
for (const o of crm) {
  const isRecent = new Date(o.created_at) >= CUTOFF
  if (isRecent) { keep.push(o); continue }
  const keys = offerteKeys(o)
  let match = false
  for (const k of keys) if (tribeKeys.has(k)) { match = true; break }
  if (match) keep.push(o); else remove.push(o)
}
console.log(`Te behouden: ${keep.length}`)
console.log(`Te verwijderen: ${remove.length}`)

if (DRY) {
  console.log('\nVoorbeelden te verwijderen:')
  for (const o of remove.slice(0, 10)) console.log(`  ${o.offertenummer} | ${o.onderwerp?.slice(0, 60) || ''}`)
  process.exit(0)
}

// 4. Verwijder de orphans + hun gekoppelde data
const ids = remove.map(o => o.id)
for (let i = 0; i < ids.length; i += 100) {
  const chunk = ids.slice(i, i + 100)
  await sb.from('offerte_regels').delete().in('offerte_id', chunk)
  await sb.from('documenten').delete().in('entiteit_id', chunk).in('entiteit_type', ['offerte_leverancier', 'offerte_leverancier_data', 'offerte_leverancier_parsed'])
  // Facturen mogen niet cascaden — skip als factuur koppelt
  const { data: linkedFactuur } = await sb.from('facturen').select('id').in('offerte_id', chunk).limit(1)
  if (linkedFactuur && linkedFactuur.length > 0) {
    // Skip chunks met facturen (veilig)
    await sb.from('offertes').update({ offerte_id_safe_skip: null }).in('id', []) // noop
    for (const cid of chunk) {
      const { data: fs } = await sb.from('facturen').select('id').eq('offerte_id', cid).limit(1)
      if (!fs || fs.length === 0) await sb.from('offertes').delete().eq('id', cid)
    }
  } else {
    await sb.from('offertes').delete().in('id', chunk)
  }
}
console.log(`Verwijderd: ${ids.length}`)

// 5. Voor elke behouden offerte zonder project_id: maak/koppel project
const zonderProject = keep.filter(o => !o.project_id)
console.log(`\nOffertes zonder verkoopkans: ${zonderProject.length}`)

// Projecten ophalen voor dedup
const projects = []
from = 0
while (true) {
  const { data } = await sb.from('projecten').select('id, naam, relatie_id, status').eq('administratie_id', adminId).range(from, from + 999)
  if (!data || data.length === 0) break
  projects.push(...data); from += 1000
}
function normNaam(s) {
  return (s || '').toLowerCase()
    .replace(/^(re|fw|fwd|aw)\s*:\s*/gi, '').replace(/^(re|fw|fwd|aw)\s*:\s*/gi, '')
    .replace(/offerte\s+met\s+nr\.?\s*[a-z0-9-]+\s*,?\s*/gi, '')
    .replace(/\s+van\s+rebu\s+kozijnen\b/gi, '')
    .replace(/[^a-z0-9]+/g, ' ').trim()
}
const projByKey = new Map()
for (const p of projects) {
  const k = `${p.relatie_id || 'geen'}|${normNaam(p.naam)}`
  if (!projByKey.has(k)) projByKey.set(k, p)
}

let nieuweProjects = 0, gekoppeld = 0
for (const o of zonderProject) {
  const k = `${o.relatie_id || 'geen'}|${normNaam(o.onderwerp)}`
  let proj = projByKey.get(k)
  if (!proj && o.relatie_id && o.onderwerp) {
    const { data: ins, error } = await sb.from('projecten').insert({
      administratie_id: adminId,
      naam: String(o.onderwerp).slice(0, 200),
      relatie_id: o.relatie_id,
      status: 'actief',
    }).select('id, naam, relatie_id, status').single()
    if (error) { console.error('Project insert fout:', error.message); continue }
    proj = ins
    projByKey.set(k, proj)
    nieuweProjects++
  }
  if (proj) {
    await sb.from('offertes').update({ project_id: proj.id }).eq('id', o.id)
    gekoppeld++
  }
}
console.log(`Nieuwe verkoopkansen aangemaakt: ${nieuweProjects}`)
console.log(`Offertes gekoppeld aan verkoopkans: ${gekoppeld}`)

// 6. Dedup projecten: per relatie + genormaliseerde naam houd 1, merge rest
const alleProj = []
from = 0
while (true) {
  const { data } = await sb.from('projecten').select('id, naam, relatie_id, status, created_at').eq('administratie_id', adminId).range(from, from + 999)
  if (!data || data.length === 0) break
  alleProj.push(...data); from += 1000
}
const groepen = new Map()
for (const p of alleProj) {
  const k = `${p.relatie_id || 'geen'}|${normNaam(p.naam)}`
  if (normNaam(p.naam).length < 3) continue
  if (!groepen.has(k)) groepen.set(k, [])
  groepen.get(k).push(p)
}
let mergedProj = 0
for (const [, grp] of groepen) {
  if (grp.length <= 1) continue
  grp.sort((a, b) => new Date(a.created_at) - new Date(b.created_at))
  const keep = grp[0]
  for (const dup of grp.slice(1)) {
    await sb.from('offertes').update({ project_id: keep.id }).eq('project_id', dup.id)
    await sb.from('taken').update({ project_id: keep.id }).eq('project_id', dup.id)
    await sb.from('emails').update({ project_id: keep.id }).eq('project_id', dup.id)
    const { error } = await sb.from('projecten').delete().eq('id', dup.id)
    if (!error) mergedProj++
  }
}
console.log(`Duplicate verkoopkansen samengevoegd: ${mergedProj}`)

// Stats
const { count: offC } = await sb.from('offertes').select('id', { count: 'exact', head: true }).eq('administratie_id', adminId)
const { count: projC } = await sb.from('projecten').select('id', { count: 'exact', head: true }).eq('administratie_id', adminId)
console.log(`\nNa cleanup — offertes: ${offC}, verkoopkansen: ${projC}`)
