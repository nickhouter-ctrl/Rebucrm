// Uitgebreide audit van ALLE verkoopkansen op verkeerde klant-koppeling.
// Drie checks per project:
//   A. Project-naam noemt expliciet een andere relatie (strikt)
//   B. Gekoppelde emails komen van een afzender wiens domein hoort bij een
//      ANDERE relatie dan project.relatie_id
//   C. Gekoppelde offerte heeft onderwerp dat duidelijk een andere klant noemt
//
// Output: alleen verdachte gevallen, met reden + suggestie. Read-only.

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
const { data: admin } = await sb.from('administraties').select('id').ilike('naam', '%Rebu%').single()
const adminId = admin.id

// === Laad relaties ===
const { data: relaties } = await sb.from('relaties')
  .select('id, bedrijfsnaam, contactpersoon, email')
  .eq('administratie_id', adminId)
const relMap = new Map(relaties.map(r => [r.id, r]))

// Email-domain → relatie mapping (alleen unieke business-domains, geen gmail/etc.)
const PERSOONLIJKE_DOMAINS = new Set(['gmail.com', 'hotmail.com', 'hotmail.nl', 'live.nl', 'live.com', 'outlook.com', 'outlook.nl', 'yahoo.com', 'icloud.com', 'me.com', 'kpnmail.nl', 'ziggo.nl', 'planet.nl', 'home.nl', 'xs4all.nl', 'casema.nl', 'upcmail.nl', 'quicknet.nl', 'telfort.nl', 'online.nl', 'chello.nl'])
const domainToRelatie = new Map()
for (const r of relaties) {
  const email = (r.email || '').toLowerCase().trim()
  const domain = email.split('@')[1]
  if (!domain) continue
  if (PERSOONLIJKE_DOMAINS.has(domain)) continue
  if (!domainToRelatie.has(domain)) domainToRelatie.set(domain, [])
  domainToRelatie.get(domain).push(r)
}

// === Laad projecten ===
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
const relevant = projecten.filter(p => p.status !== 'geannuleerd' && p.status !== 'verloren' && p.relatie_id)

console.log(`\nAudit van ${relevant.length} actieve verkoopkansen met relatie-koppeling...\n`)

// Skip-tokens (false positives)
const SKIP_BEDRIJVEN = new Set([
  'bouw', 'beheer', 'kozijn', 'kozijnen', 'verbouw', 'rebu kozijnen b.v.', 'rebu kozijnen', 'rebu',
  'krom', 'krom timmerwerk',  // Krommenie is een plaatsnaam
  'zaanbouw', 'bouwbedrijf', 'aannemer', 'aannemers',
])

// === A. Naam-mismatch ===
const naamMismatch = []
for (const p of relevant) {
  const rel = relMap.get(p.relatie_id)
  if (!rel) continue
  const naamLow = (p.naam || '').toLowerCase()
  const bedrijfNorm = (rel.bedrijfsnaam || '').toLowerCase()
  const contactNorm = (rel.contactpersoon || '').toLowerCase()

  let suspect = null
  for (const otherRel of relaties) {
    if (otherRel.id === p.relatie_id) continue
    const otherBedrijf = (otherRel.bedrijfsnaam || '').toLowerCase()
    const otherContact = (otherRel.contactpersoon || '').toLowerCase()
    if (!otherBedrijf || otherBedrijf.length < 5) continue
    if (SKIP_BEDRIJVEN.has(otherBedrijf)) continue
    if (otherBedrijf === bedrijfNorm) continue  // dubbele relatie-record, niet mismatch

    const noemtAndere = naamLow.includes(otherBedrijf) || (otherContact.length >= 5 && naamLow.includes(otherContact))
    const noemtEigen = (bedrijfNorm.length >= 4 && naamLow.includes(bedrijfNorm)) || (contactNorm.length >= 4 && naamLow.includes(contactNorm))
    if (noemtAndere && !noemtEigen) {
      suspect = otherRel
      break
    }
  }
  if (suspect) naamMismatch.push({ project: p, gekoppeldAan: rel, vermoedelijkVoor: suspect })
}

// === B. Email-domein mismatch ===
// Lees emails per project (alleen die een afzender hebben en gekoppeld zijn aan project)
const emailMismatch = []
{
  // Batched fetch — limiteer tot projecten met emails
  const projIds = relevant.map(p => p.id)
  const batchSize = 200
  const emailsPerProject = new Map()
  for (let i = 0; i < projIds.length; i += batchSize) {
    const batch = projIds.slice(i, i + batchSize)
    const { data: ems } = await sb.from('emails')
      .select('project_id, van, afzender_email')
      .in('project_id', batch)
    for (const e of (ems || [])) {
      const sender = (e.van || e.afzender_email || '').toLowerCase()
      const m = sender.match(/[a-z0-9._%+\-]+@[a-z0-9.\-]+\.[a-z]{2,}/i)
      if (!m) continue
      const fromEmail = m[0]
      const domain = fromEmail.split('@')[1]
      if (!emailsPerProject.has(e.project_id)) emailsPerProject.set(e.project_id, [])
      emailsPerProject.get(e.project_id).push({ fromEmail, domain })
    }
  }

  for (const [projectId, emails] of emailsPerProject) {
    const p = relevant.find(x => x.id === projectId)
    if (!p) continue
    const rel = relMap.get(p.relatie_id)
    if (!rel) continue
    // Bouw frequentie van business-domains in afzenders
    const domainCount = {}
    for (const e of emails) {
      if (PERSOONLIJKE_DOMAINS.has(e.domain)) continue
      domainCount[e.domain] = (domainCount[e.domain] || 0) + 1
    }
    // Zoek het meest voorkomende domain dat NIET het Rebu-domain is
    const sorted = Object.entries(domainCount).filter(([d]) => !d.includes('rebu'))
      .sort((a, b) => b[1] - a[1])
    if (sorted.length === 0) continue
    const [topDomain, count] = sorted[0]
    if (count < 2) continue  // 1 mail = mogelijk algemene afzender, niet hard genoeg

    // Wijst dit domein naar een ANDERE relatie?
    const matchingRel = (domainToRelatie.get(topDomain) || []).find(r => r.id !== p.relatie_id && r.id !== rel.id)
    if (!matchingRel) continue
    // En de huidige relatie heeft dit domain NIET
    const eigenDomain = (rel.email || '').toLowerCase().split('@')[1]
    if (eigenDomain === topDomain) continue

    emailMismatch.push({
      project: p,
      gekoppeldAan: rel,
      vermoedelijkVoor: matchingRel,
      reden: `${count} emails komen van @${topDomain} (= relatie ${matchingRel.bedrijfsnaam})`
    })
  }
}

// === C. Offerte-onderwerp mismatch ===
const offerteMismatch = []
{
  const projIds = relevant.map(p => p.id)
  const batchSize = 500
  for (let i = 0; i < projIds.length; i += batchSize) {
    const batch = projIds.slice(i, i + batchSize)
    const { data: offs } = await sb.from('offertes')
      .select('id, project_id, onderwerp, relatie_id, offertenummer')
      .in('project_id', batch)
    for (const o of (offs || [])) {
      const p = relevant.find(x => x.id === o.project_id)
      if (!p) continue
      // De offerte zelf heeft een andere relatie dan het project? Dat is verdacht
      if (o.relatie_id && o.relatie_id !== p.relatie_id) {
        const projectRel = relMap.get(p.relatie_id)
        const offerteRel = relMap.get(o.relatie_id)
        if (projectRel && offerteRel) {
          offerteMismatch.push({
            project: p,
            gekoppeldAan: projectRel,
            vermoedelijkVoor: offerteRel,
            reden: `Offerte ${o.offertenummer} ("${o.onderwerp || ''}") staat op relatie ${offerteRel.bedrijfsnaam}`
          })
        }
      }
    }
  }
}

// Dedupe per project (een project kan in meerdere checks zitten)
const allMatches = new Map()
for (const m of [...naamMismatch.map(x => ({ ...x, reden: 'naam-mismatch', categorie: 'A' })),
                  ...emailMismatch.map(x => ({ ...x, categorie: 'B' })),
                  ...offerteMismatch.map(x => ({ ...x, categorie: 'C' }))]) {
  if (!allMatches.has(m.project.id)) allMatches.set(m.project.id, m)
}

console.log(`=== Verdachte projecten: ${allMatches.size} ===\n`)
let i = 0
for (const m of allMatches.values()) {
  i++
  console.log(`${i}. [${m.categorie}] "${m.project.naam}" (${m.project.id})`)
  console.log(`   gekoppeld aan: ${m.gekoppeldAan.bedrijfsnaam}${m.gekoppeldAan.contactpersoon ? ` (${m.gekoppeldAan.contactpersoon})` : ''}`)
  console.log(`   lijkt voor:    ${m.vermoedelijkVoor.bedrijfsnaam}${m.vermoedelijkVoor.contactpersoon ? ` (${m.vermoedelijkVoor.contactpersoon})` : ''}`)
  if (m.reden && m.reden !== 'naam-mismatch') console.log(`   reden: ${m.reden}`)
  console.log()
}

console.log(`Totaal: A=${naamMismatch.length} naam | B=${emailMismatch.length} email-domein | C=${offerteMismatch.length} offerte | uniek=${allMatches.size}`)
