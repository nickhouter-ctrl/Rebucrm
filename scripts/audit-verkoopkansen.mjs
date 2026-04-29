// Audit-script: detecteert dubbele verkoopkansen en mogelijk verkeerd
// gekoppelde verkoopkansen. Rapporteert alleen — fixt niets.
//
// Detectie:
//   1. Duplicaten: zelfde relatie_id + genormaliseerde naam
//   2. Naam-mismatch: verkoopkans-naam noemt een ander bedrijf dan de
//      gekoppelde relatie (bv. naam "Schüco offerte Mike Krom" gekoppeld
//      aan relatie "Janssen B.V.")
//   3. Wezen: verkoopkansen zonder enkele offerte / factuur / email / taak
//   4. Geen relatie: verkoopkans zonder relatie_id (orphan)

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
const { data: admin } = await sb.from('administraties').select('id').ilike('naam', '%Rebu%').single()
const adminId = admin.id

// 1. Lees alle verkoopkansen + relaties
const projecten = []
let from = 0
while (true) {
  const { data } = await sb.from('projecten')
    .select('id, naam, relatie_id, status, created_at')
    .eq('administratie_id', adminId)
    .range(from, from + 999)
  if (!data || data.length === 0) break
  projecten.push(...data)
  from += 1000
}

const { data: relaties } = await sb.from('relaties')
  .select('id, bedrijfsnaam, contactpersoon')
  .eq('administratie_id', adminId)
const relMap = new Map(relaties.map(r => [r.id, r]))

// Normaliseer namen voor vergelijking
function norm(s) {
  return (s || '').toLowerCase()
    .replace(/^(re|fw|fwd|aw|antw)\s*:\s*/gi, '')
    .replace(/offerte\s+met\s+nr\.?\s*[a-z0-9-]+\s*,?\s*/gi, '')
    .replace(/\s+van\s+rebu\s+kozijnen\b/gi, '')
    .replace(/^(offerte|aanvraag|offerteaanvraag|aanvraag\s+offerte|opdracht|werk|reactie|re)\s+/gi, '')
    .replace(/[^a-z0-9]+/g, ' ').trim()
}

// Voor dedup + mismatch: alle behalve geannuleerd/verloren — afgeronde kunnen
// prima ook duplicaten zijn (oud pendant van een nieuwe deal).
const relevant = projecten.filter(p => p.status !== 'geannuleerd' && p.status !== 'verloren')
// Voor wezen-detectie: alleen actief (afgerond zonder taken is normaal)
const actiefOnly = projecten.filter(p => p.status === 'actief')

// === 1. Duplicaten ===
const groepen = new Map()
for (const p of relevant) {
  const n = norm(p.naam)
  if (n.length < 3) continue
  const key = `${p.relatie_id || 'GEEN'}|${n}`
  if (!groepen.has(key)) groepen.set(key, [])
  groepen.get(key).push(p)
}
const duplicaten = [...groepen.values()].filter(g => g.length > 1)

// === 2. Naam-mismatch ===
// Skip-tokens die false positives veroorzaken (deelstrings van plaatsnamen,
// generieke afzenders, eigen bedrijf, generieke woorden).
const SKIP_BEDRIJVEN = new Set([
  'bouw', 'beheer', 'kozijn', 'kozijnen', 'verbouw', 'rebu kozijnen b.v.',
  'krom', 'krom timmerwerk', // Krommenie is een plaats — false positive
  'zaanbouw', // false positive met "Zaanbouw BV"
])

const mismatches = []
for (const p of relevant) {
  if (!p.relatie_id) continue
  const rel = relMap.get(p.relatie_id)
  if (!rel) continue
  const naamLow = (p.naam || '').toLowerCase()
  const bedrijfNorm = (rel.bedrijfsnaam || '').toLowerCase()
  const contactNorm = (rel.contactpersoon || '').toLowerCase()
  let suspectRelatie = null
  for (const otherRel of relaties) {
    if (otherRel.id === p.relatie_id) continue
    const otherBedrijf = (otherRel.bedrijfsnaam || '').toLowerCase()
    const otherContact = (otherRel.contactpersoon || '').toLowerCase()
    if (!otherBedrijf || otherBedrijf.length < 4) continue
    if (SKIP_BEDRIJVEN.has(otherBedrijf)) continue
    // Skip relaties die exact dezelfde bedrijfsnaam hebben als de gekoppelde
    // (duidt op een dubbele relatie-record, niet op een mismatch)
    if (otherBedrijf === bedrijfNorm) continue

    const noemtAndere = naamLow.includes(otherBedrijf) || (otherContact.length >= 5 && naamLow.includes(otherContact))
    const noemtEigen = (bedrijfNorm.length >= 4 && naamLow.includes(bedrijfNorm)) || (contactNorm.length >= 4 && naamLow.includes(contactNorm))
    if (noemtAndere && !noemtEigen) {
      suspectRelatie = otherRel
      break
    }
  }
  if (suspectRelatie) {
    mismatches.push({ project: p, gekoppeldAan: rel, vermoedelijkVoor: suspectRelatie })
  }
}

// === 3. Wezen (geen offerte / factuur / email / taak) ===
async function heeftKoppeling(projectId) {
  const [{ count: of }, { count: fa }, { count: em }, { count: ta }] = await Promise.all([
    sb.from('offertes').select('id', { count: 'exact', head: true }).eq('project_id', projectId),
    sb.from('facturen').select('id', { count: 'exact', head: true }).eq('project_id', projectId),
    sb.from('emails').select('id', { count: 'exact', head: true }).eq('project_id', projectId),
    sb.from('taken').select('id', { count: 'exact', head: true }).eq('project_id', projectId),
  ])
  return (of || 0) + (fa || 0) + (em || 0) + (ta || 0) > 0
}

const wezen = []
// Alleen actieve verkoopkansen ouder dan 7 dagen (afgeronde mogen leeg zijn)
const kandidaten = actiefOnly.filter(p => {
  const ouderdomDagen = (Date.now() - new Date(p.created_at).getTime()) / 86400000
  return ouderdomDagen >= 7
})
for (const p of kandidaten) {
  const heeft = await heeftKoppeling(p.id)
  if (!heeft) wezen.push(p)
}

// === 4. Geen relatie ===
const orphans = relevant.filter(p => !p.relatie_id)

// === Rapport ===
console.log('=== AUDIT VERKOOPKANSEN ===\n')
console.log(`Totaal verkoopkansen (excl. geannuleerd/verloren): ${relevant.length}`)
console.log(`Waarvan status=actief: ${actiefOnly.length}\n`)

console.log(`1. DUPLICATEN (zelfde relatie + zelfde genorm. naam): ${duplicaten.length} groepen`)
for (const grp of duplicaten.slice(0, 30)) {
  const rel = relMap.get(grp[0].relatie_id)
  console.log(`   • ${rel?.bedrijfsnaam || '(geen relatie)'} — "${grp[0].naam}" (×${grp.length})`)
  for (const p of grp) console.log(`       - ${p.id}  status=${p.status}  ${p.created_at?.slice(0, 10)}`)
}
if (duplicaten.length > 30) console.log(`   ... en nog ${duplicaten.length - 30} groepen`)

console.log(`\n2. NAAM-MISMATCH (verkoopkans-naam noemt een andere klant): ${mismatches.length}`)
for (const m of mismatches.slice(0, 30)) {
  console.log(`   • "${m.project.naam}"`)
  console.log(`       gekoppeld aan: ${m.gekoppeldAan.bedrijfsnaam}`)
  console.log(`       lijkt voor:    ${m.vermoedelijkVoor.bedrijfsnaam}`)
  console.log(`       project: ${m.project.id}`)
}
if (mismatches.length > 30) console.log(`   ... en nog ${mismatches.length - 30}`)

console.log(`\n3. WEZEN (>7d oud, geen offerte/factuur/email/taak): ${wezen.length}`)
for (const p of wezen.slice(0, 30)) {
  const rel = relMap.get(p.relatie_id)
  console.log(`   • ${rel?.bedrijfsnaam || '(geen relatie)'} — "${p.naam}" (${p.created_at?.slice(0, 10)})`)
}
if (wezen.length > 30) console.log(`   ... en nog ${wezen.length - 30}`)

console.log(`\n4. ZONDER RELATIE: ${orphans.length}`)
for (const p of orphans.slice(0, 30)) {
  console.log(`   • "${p.naam}" (${p.created_at?.slice(0, 10)})  id=${p.id}`)
}
if (orphans.length > 30) console.log(`   ... en nog ${orphans.length - 30}`)

console.log('\n[DRY RUN] Alleen rapport. Geef akkoord per categorie om te fixen.')
