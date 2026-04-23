import fs from 'fs'
import { createSupabaseAdmin } from './db.mjs'

const DRY = process.argv.includes('--dry')
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

const col = {}
for (const k of ['Naam', 'Organisatie_Naam', 'Organisatie_Telefoonnummer', 'Organisatie_E-mailadres', 'Organisatie_Financieel_e-mailadres', 'Organisatie_Bezoekadres_Straat', 'Organisatie_Bezoekadres_Huisnummer', 'Organisatie_Bezoekadres_Toevoeging', 'Organisatie_Bezoekadres_Postcode', 'Organisatie_Bezoekadres_Stad', 'Organisatie_BTW_nummer', 'Organisatie_IBAN']) {
  col[k] = headers.indexOf(k)
}

function norm(s) { return (s || '').toLowerCase().replace(/\s+/g, ' ').trim() }
function cleanEmail(e) {
  const s = (e || '').trim()
  if (!s || !s.includes('@')) return null
  return s.toLowerCase()
}
function cleanTel(t) {
  const s = (t || '').toString().trim()
  if (!s) return null
  return s
}

// Bouw CSV-map op naam + secondary op email
const csvByNaam = new Map()
const csvByEmail = new Map()
for (const r of data) {
  const naam = r[col['Naam']] || r[col['Organisatie_Naam']]
  if (!naam) continue
  const rec = {
    naam: naam.trim(),
    email: cleanEmail(r[col['Organisatie_E-mailadres']]),
    factuur_email: cleanEmail(r[col['Organisatie_Financieel_e-mailadres']]),
    telefoon: cleanTel(r[col['Organisatie_Telefoonnummer']]),
    btw_nummer: r[col['Organisatie_BTW_nummer']]?.trim() || null,
    iban: r[col['Organisatie_IBAN']]?.trim() || null,
    postcode: r[col['Organisatie_Bezoekadres_Postcode']]?.trim() || null,
    plaats: r[col['Organisatie_Bezoekadres_Stad']]?.trim() || null,
    adres: [r[col['Organisatie_Bezoekadres_Straat']], r[col['Organisatie_Bezoekadres_Huisnummer']], r[col['Organisatie_Bezoekadres_Toevoeging']]].filter(Boolean).join(' ').trim() || null,
  }
  const key = norm(naam)
  if (key && !csvByNaam.has(key)) csvByNaam.set(key, rec)
  if (rec.email && !csvByEmail.has(rec.email)) csvByEmail.set(rec.email, rec)
}
console.log(`CSV relaties: ${data.length}, unieke naam: ${csvByNaam.size}, met email: ${csvByEmail.size}`)

// Haal CRM relaties
const crm = []
let from = 0
while (true) {
  const { data: batch } = await sb.from('relaties').select('id, bedrijfsnaam, email, telefoon, adres, postcode, plaats, btw_nummer, iban, factuur_email').eq('administratie_id', adminId).range(from, from + 999)
  if (!batch || batch.length === 0) break
  crm.push(...batch); from += 1000
}
console.log(`CRM relaties: ${crm.length}`)

let matched = 0, overschreven = 0, nietGevonden = 0
const sample = []

for (const c of crm) {
  const keyN = norm(c.bedrijfsnaam)
  let csv = csvByNaam.get(keyN)
  // Fallback: match op email als geen exacte naam-match
  if (!csv && c.email) csv = csvByEmail.get((c.email || '').toLowerCase())
  if (!csv) { nietGevonden++; continue }
  matched++
  // OVERSCHRIJF met CSV waarden (zelfs als CRM al iets heeft — user wil CSV als waarheid)
  const upd = {}
  const fields = ['email', 'telefoon', 'btw_nummer', 'iban', 'postcode', 'plaats', 'adres', 'factuur_email']
  for (const f of fields) {
    if (csv[f] && csv[f] !== c[f]) upd[f] = csv[f]
  }
  if (Object.keys(upd).length === 0) continue
  if (sample.length < 5) sample.push({ naam: c.bedrijfsnaam, upd })
  if (!DRY) {
    await sb.from('relaties').update(upd).eq('id', c.id)
  }
  overschreven++
}

console.log(`\nMatch: ${matched}, bijgewerkt: ${overschreven}, niet gevonden in CSV: ${nietGevonden}`)
console.log('\nVoorbeelden updates:')
for (const s of sample) {
  console.log(`  ${s.naam}:`, s.upd)
}
