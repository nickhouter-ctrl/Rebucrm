import XLSX from 'xlsx'
import { createSupabaseAdmin } from './db.mjs'

const sb = await createSupabaseAdmin()
const { data: admin } = await sb.from('administraties').select('id').ilike('naam', '%Rebu%').single()
const adminId = admin.id

// 1. Lees Excel
const wb = XLSX.readFile('/Users/houterminiopslag/Downloads/Offertes.xlsx')
const rows = XLSX.utils.sheet_to_json(wb.Sheets['Offertes'], { defval: null })
console.log(`Tribe rijen: ${rows.length}`)

// 2. Lees alle CRM offertes
const crm = []
let from = 0
while (true) {
  const { data } = await sb.from('offertes').select('id, offertenummer, subtotaal, totaal, btw_totaal, datum, status, relatie_id').eq('administratie_id', adminId).range(from, from + 999)
  if (!data || data.length === 0) break
  crm.push(...data); from += 1000
}
console.log(`CRM offertes: ${crm.length}`)

// 3. Normalisatie — pak cijfers met optioneel jaar-prefix
function norm(s) {
  if (!s) return ''
  const str = String(s).trim()
  // "2024-419" / "2024-00017" / "OFF-0419" / "O-2024-0419" → laatste 4+ cijfers
  const parts = str.replace(/[^0-9-]/g, '').split('-').filter(Boolean)
  if (parts.length === 0) return ''
  const last = parts[parts.length - 1]
  // Strip leading zeros voor matching
  return String(parseInt(last, 10) || last)
}

// 4. Index CRM op genormaliseerd nummer (voor laatste versie — multiple versions mogelijk)
const crmMap = new Map()
for (const c of crm) {
  const k = norm(c.offertenummer)
  if (!k) continue
  if (!crmMap.has(k)) crmMap.set(k, [])
  crmMap.get(k).push(c)
}

// 5. Voor elke Tribe rij: zoek match
let matched = 0, notFound = 0, metTotaal = 0
const noMatchSamples = []
for (const r of rows) {
  if (!r.Nummer) continue
  const k = norm(r.Nummer)
  const cms = crmMap.get(k)
  if (cms && cms.length > 0) {
    matched++
    if (Number(r.Totaal) > 0) metTotaal++
  } else {
    notFound++
    if (noMatchSamples.length < 15) noMatchSamples.push({ nummer: r.Nummer, k, onderwerp: r.Onderwerp, totaal: r.Totaal })
  }
}
console.log(`\nMatch: ${matched}`)
console.log(`Niet gevonden: ${notFound}`)
console.log(`Van matches met totaal>0: ${metTotaal}`)

console.log('\nVoorbeelden niet-gevonden:')
for (const s of noMatchSamples) console.log(`  "${s.nummer}" (norm="${s.k}") ${s.totaal ? `€${s.totaal}` : ''} - ${s.onderwerp || '-'}`)
