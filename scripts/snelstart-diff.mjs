import { createSupabaseAdmin } from './db.mjs'

const supabase = await createSupabaseAdmin()
const { data: admin } = await supabase.from('administraties').select('id').ilike('naam', '%Rebu%').single()
const adminId = admin.id

// 1. CRM facturen
const crm = []
let from = 0
while (true) {
  const { data } = await supabase
    .from('facturen')
    .select('id, factuurnummer, totaal, betaald_bedrag, status, datum, vervaldatum')
    .eq('administratie_id', adminId)
    .range(from, from + 999)
  if (!data || data.length === 0) break
  crm.push(...data)
  from += 1000
}
console.log(`CRM facturen: ${crm.length}`)

const crmOpenstaand = crm
  .filter(f => !['betaald', 'gecrediteerd', 'concept', 'geannuleerd'].includes(f.status))
  .reduce((s, f) => s + (Number(f.totaal) - Number(f.betaald_bedrag || 0)), 0)
console.log(`CRM totaal openstaand (volgens huidige status/betaald_bedrag): €${crmOpenstaand.toFixed(2)}`)

// 2. SnelStart verkoopfacturen via auth
const authRes = await fetch('https://auth.snelstart.nl/b2b/token', {
  method: 'POST',
  headers: {
    'Ocp-Apim-Subscription-Key': process.env.SNELSTART_SUBSCRIPTION_KEY,
    'Content-Type': 'application/x-www-form-urlencoded',
  },
  body: new URLSearchParams({ grant_type: 'clientkey', clientkey: process.env.SNELSTART_CLIENT_KEY }),
})
const { access_token } = await authRes.json()

async function ssGet(path) {
  const r = await fetch(`https://b2bapi.snelstart.nl/v2${path}`, {
    headers: {
      Authorization: `Bearer ${access_token}`,
      'Ocp-Apim-Subscription-Key': process.env.SNELSTART_SUBSCRIPTION_KEY,
      Accept: 'application/json',
    },
  })
  if (!r.ok) throw new Error(`${path} → ${r.status}: ${await r.text()}`)
  return r.json()
}

const ss = []
for (let skip = 0; skip < 20000; skip += 100) {
  const list = await ssGet(`/verkoopfacturen?$top=100&$skip=${skip}`)
  if (!Array.isArray(list) || list.length === 0) break
  ss.push(...list)
  if (list.length < 100) break
}
console.log(`SnelStart facturen: ${ss.length}`)

const ssOpen = ss.filter(f => (f.openstaandSaldo || 0) > 0.01)
const ssOpenTotal = ssOpen.reduce((s, f) => s + Number(f.openstaandSaldo || 0), 0)
console.log(`SnelStart totaal openstaand: €${ssOpenTotal.toFixed(2)} (${ssOpen.length} facturen)`)

const ssMap = new Map(ss.map(f => [f.factuurnummer, f]))
const crmMap = new Map(crm.map(f => [f.factuurnummer, f]))

// 3. Matching
let matched = 0, inSSNotCRM = [], inCRMNotSS = []
for (const f of ss) {
  if (crmMap.has(f.factuurnummer)) matched++
  else inSSNotCRM.push(f)
}
for (const f of crm) {
  if (!ssMap.has(f.factuurnummer) && !['concept', 'gecrediteerd', 'geannuleerd'].includes(f.status)) {
    inCRMNotSS.push(f)
  }
}

console.log(`\nMatches op factuurnummer: ${matched}`)
console.log(`In SnelStart maar niet in CRM: ${inSSNotCRM.length}`)
console.log(`In CRM maar niet in SnelStart (non-concept): ${inCRMNotSS.length}`)

// Openstaand bij de mismatch-categorieen
const ssOrphanOpen = inSSNotCRM.filter(f => (f.openstaandSaldo || 0) > 0.01).reduce((s, f) => s + Number(f.openstaandSaldo), 0)
console.log(`  → SnelStart orphan openstaand: €${ssOrphanOpen.toFixed(2)}`)

const crmOrphanOpen = inCRMNotSS.filter(f => !['betaald'].includes(f.status)).reduce((s, f) => s + (Number(f.totaal) - Number(f.betaald_bedrag || 0)), 0)
console.log(`  → CRM orphan openstaand: €${crmOrphanOpen.toFixed(2)}`)

// Top 10 verschillen waarde
console.log('\nGrootste mismatches (openstaand verschil CRM vs SS):')
const diffs = []
for (const [fnr, crmF] of crmMap) {
  const ssF = ssMap.get(fnr)
  if (!ssF) continue
  const crmOpen = ['betaald', 'gecrediteerd'].includes(crmF.status) ? 0 : Number(crmF.totaal) - Number(crmF.betaald_bedrag || 0)
  const ssOpenF = Number(ssF.openstaandSaldo || 0)
  const diff = Math.abs(crmOpen - ssOpenF)
  if (diff > 0.5) diffs.push({ fnr, crmOpen, ssOpen: ssOpenF, diff, crmStatus: crmF.status })
}
diffs.sort((a, b) => b.diff - a.diff)
for (const d of diffs.slice(0, 15)) {
  console.log(`  ${d.fnr}: CRM €${d.crmOpen.toFixed(2)} (${d.crmStatus}) vs SS €${d.ssOpen.toFixed(2)} → Δ €${d.diff.toFixed(2)}`)
}

// 5 voorbeelden SS-orphans (facturen in SnelStart maar niet in CRM)
console.log('\nVoorbeelden SnelStart-orphans (eerste 10):')
for (const f of inSSNotCRM.slice(0, 10)) {
  console.log(`  ${f.factuurnummer} - totaal €${f.factuurBedrag} openstaand €${f.openstaandSaldo || 0}`)
}

// 5 voorbeelden CRM-orphans
console.log('\nVoorbeelden CRM-orphans (eerste 10):')
for (const f of inCRMNotSS.slice(0, 10)) {
  const open = Number(f.totaal) - Number(f.betaald_bedrag || 0)
  console.log(`  ${f.factuurnummer} - ${f.status} totaal €${f.totaal} openstaand €${open.toFixed(2)}`)
}
