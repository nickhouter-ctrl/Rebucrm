import fs from 'fs'
import { createSupabaseAdmin } from './db.mjs'

const sb = await createSupabaseAdmin()
const { data: admin } = await sb.from('administraties').select('id').ilike('naam', '%Rebu%').single()
const adminId = admin.id

const text = fs.readFileSync('/Users/houterminiopslag/Downloads/Organisaties 3.csv', 'utf-8')
function parseCSV(txt) {
  const rows = []
  let row = [], field = '', inQuote = false
  for (let i = 0; i < txt.length; i++) {
    const c = txt[i]
    if (c === '"') {
      if (inQuote && txt[i + 1] === '"') { field += '"'; i++ }
      else inQuote = !inQuote
    } else if (c === ';' && !inQuote) { row.push(field); field = '' }
    else if ((c === '\n' || c === '\r') && !inQuote) {
      if (field !== '' || row.length > 0) { row.push(field); rows.push(row); row = []; field = '' }
      if (c === '\r' && txt[i + 1] === '\n') i++
    } else field += c
  }
  if (field !== '' || row.length > 0) { row.push(field); rows.push(row) }
  return rows
}
const rows = parseCSV(text)
const headers = rows[0]
const data = rows.slice(1).filter(r => r.length === headers.length)
const iNaam = headers.indexOf('Naam')
const iEmail = headers.indexOf('Organisatie_E-mailadres')

function norm(s) { return (s || '').toLowerCase().replace(/[^a-z0-9]/g, '') }

const csvByNaam = new Map()
const csvByEmail = new Map()
const csvRecords = []
for (const r of data) {
  const naam = (r[iNaam] || '').trim()
  if (!naam) continue
  const email = (r[iEmail] || '').trim().toLowerCase()
  const rec = { naam, email, normNaam: norm(naam) }
  csvRecords.push(rec)
  if (!csvByNaam.has(rec.normNaam)) csvByNaam.set(rec.normNaam, rec)
  if (email && !csvByEmail.has(email)) csvByEmail.set(email, rec)
}

const crm = []
let from = 0
while (true) {
  const { data: batch } = await sb.from('relaties').select('id, bedrijfsnaam, email').eq('administratie_id', adminId).range(from, from + 999)
  if (!batch || batch.length === 0) break
  crm.push(...batch); from += 1000
}

const unmatched = []
for (const c of crm) {
  const keyN = norm(c.bedrijfsnaam)
  if (csvByNaam.has(keyN)) continue
  if (c.email && csvByEmail.has(c.email.toLowerCase())) continue
  unmatched.push(c)
}

// Fuzzy: substring or sterk overlappende naam
function suggest(c) {
  const keyN = norm(c.bedrijfsnaam)
  if (!keyN || keyN.length < 4) return null
  let best = null
  for (const rec of csvRecords) {
    if (!rec.normNaam) continue
    if (rec.normNaam.includes(keyN) || keyN.includes(rec.normNaam)) {
      const score = Math.min(rec.normNaam.length, keyN.length) / Math.max(rec.normNaam.length, keyN.length)
      if (!best || score > best.score) best = { score, rec }
    }
  }
  return best && best.score >= 0.55 ? best.rec : null
}

const withSuggest = []
const zonder = []
for (const c of unmatched) {
  const s = suggest(c)
  if (s) withSuggest.push({ crm: c, csv: s })
  else zonder.push(c)
}

console.log(`\nUnmatched CRM: ${unmatched.length}`)
console.log(`Met fuzzy suggestie: ${withSuggest.length}`)
console.log(`Geen suggestie: ${zonder.length}`)

const out = [
  'crm_id;crm_naam;crm_email;suggestie_csv_naam;suggestie_csv_email',
  ...withSuggest.map(x => `${x.crm.id};${x.crm.bedrijfsnaam};${x.crm.email || ''};${x.csv.naam};${x.csv.email}`),
  ...zonder.map(c => `${c.id};${c.bedrijfsnaam};${c.email || ''};;`),
].join('\n')
fs.writeFileSync('/Users/houterminiopslag/Documents/projects/Rebu/unmatched-relaties.csv', out)
console.log('\nGeschreven: unmatched-relaties.csv')

console.log('\nTop 20 fuzzy suggesties:')
for (const x of withSuggest.slice(0, 20)) {
  console.log(`  "${x.crm.bedrijfsnaam}" → "${x.csv.naam}"`)
}
