// V2: per relatie strikt matchen met Tribe nummers. Surplus CRM offertes weg.
import XLSX from 'xlsx'
import { createSupabaseAdmin } from './db.mjs'
const DRY = process.argv.includes('--dry')
const sb = await createSupabaseAdmin()
const { data: admin } = await sb.from('administraties').select('id').ilike('naam', '%Rebu%').single()
const adminId = admin.id

// Tribe rijen per relatie-naam
const wb = XLSX.readFile('/Users/houterminiopslag/Downloads/Offertes.xlsx')
const tribe = XLSX.utils.sheet_to_json(wb.Sheets['Offertes'], { defval: null })

function nrKey(s) {
  if (!s) return null
  const m = String(s).match(/(\d{4})[^\d]*(\d{1,6})/)
  if (!m) return null
  return `${m[1]}-${parseInt(m[2])}`
}
function allNrKeysFrom(text) {
  const out = new Set()
  const k = nrKey(text); if (k) out.add(k)
  const m2s = [...(text || '').matchAll(/(?:Nr\.?\s*)?O?-?(\d{4})-?(\d{3,5})/gi)]
  for (const m of m2s) out.add(`${m[1]}-${parseInt(m[2])}`)
  return out
}

// Tribe: map relatienaam (lowercase) → Set van nummer-keys
const tribePerRel = new Map()
for (const r of tribe) {
  const rn = (r.Relatie_name || '').toLowerCase().trim()
  const k = nrKey(r.Nummer)
  if (!rn || !k) continue
  if (!tribePerRel.has(rn)) tribePerRel.set(rn, new Set())
  tribePerRel.get(rn).add(k)
}
console.log(`Tribe relaties: ${tribePerRel.size}`)

// CRM offertes + relatie info
const crm = []
let from = 0
while (true) {
  const { data } = await sb.from('offertes')
    .select('id, offertenummer, onderwerp, relatie_id, created_at, totaal, status, relatie:relaties(bedrijfsnaam)')
    .eq('administratie_id', adminId).range(from, from + 999)
  if (!data || data.length === 0) break
  crm.push(...data); from += 1000
}

// Facturen om te voorkomen dat we koppelingen breken
const { data: factuurOfferteIds } = await sb.from('facturen').select('offerte_id').eq('administratie_id', adminId).not('offerte_id', 'is', null)
const beschermd = new Set((factuurOfferteIds || []).map(f => f.offerte_id))

let remove = []
for (const o of crm) {
  if (beschermd.has(o.id)) continue  // offerte heeft factuur, niet verwijderen
  const rn = (o.relatie?.bedrijfsnaam || '').toLowerCase().trim()
  const tribeSet = tribePerRel.get(rn)
  const myKeys = allNrKeysFrom(o.offertenummer + ' ' + (o.onderwerp || ''))
  // Behoud als offerte-nummer of onderwerp-nummer in Tribe-set staat
  let match = false
  if (tribeSet) for (const k of myKeys) if (tribeSet.has(k)) { match = true; break }
  if (!match) remove.push(o)
}
console.log(`Te verwijderen: ${remove.length}`)

if (DRY) {
  console.log('\nSteunebrink-voorbeeld:')
  const st = remove.filter(o => /steunebrink/i.test(o.relatie?.bedrijfsnaam || '')).slice(0, 10)
  for (const o of st) console.log(`  ${o.offertenummer} [${o.status}] €${o.totaal} - ${o.onderwerp?.slice(0, 50)}`)
  process.exit(0)
}

const ids = remove.map(o => o.id)
for (let i = 0; i < ids.length; i += 100) {
  const chunk = ids.slice(i, i + 100)
  await sb.from('offerte_regels').delete().in('offerte_id', chunk)
  await sb.from('documenten').delete().in('entiteit_id', chunk).in('entiteit_type', ['offerte_leverancier', 'offerte_leverancier_data', 'offerte_leverancier_parsed'])
  const { error } = await sb.from('offertes').delete().in('id', chunk)
  if (error) console.error('batch fout:', error.message)
  if (i % 500 === 0 && i > 0) console.log(`  voortgang: ${i}/${ids.length}`)
}
console.log(`Verwijderd: ${ids.length}`)

// Tel
const { count: offC } = await sb.from('offertes').select('id', { count: 'exact', head: true }).eq('administratie_id', adminId)
console.log(`Offertes nu: ${offC}`)

// Orphan projecten (zonder enige offerte) verwijderen
const { data: orphanProj } = await sb.from('projecten').select('id, naam').eq('administratie_id', adminId)
const heeftOfferte = new Set()
const { data: linkedProjects } = await sb.from('offertes').select('project_id').eq('administratie_id', adminId).not('project_id', 'is', null)
for (const p of linkedProjects || []) heeftOfferte.add(p.project_id)
const projDel = (orphanProj || []).filter(p => !heeftOfferte.has(p.id))
console.log(`Orphan projecten zonder offerte: ${projDel.length}`)
for (let i = 0; i < projDel.length; i += 100) {
  const chunk = projDel.slice(i, i + 100).map(p => p.id)
  // Skip projecten met taken/emails
  const { data: metTaken } = await sb.from('taken').select('project_id').in('project_id', chunk).limit(1000)
  const blokkerend = new Set((metTaken || []).map(t => t.project_id))
  const verwijderbaar = chunk.filter(id => !blokkerend.has(id))
  if (verwijderbaar.length > 0) {
    await sb.from('projecten').delete().in('id', verwijderbaar)
  }
}
const { count: projC } = await sb.from('projecten').select('id', { count: 'exact', head: true }).eq('administratie_id', adminId)
console.log(`Verkoopkansen nu: ${projC}`)
