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
function hi(k){return headers.indexOf(k)}

function norm(s){return (s||'').toLowerCase().replace(/[^a-z0-9]/g,'')}
function cleanEmail(e){const s=(e||'').trim();if(!s||!s.includes('@'))return null;return s.toLowerCase()}
function cleanTel(t){const s=(t||'').toString().trim();return s||null}

const byNaam = new Map()
const records = []
for (const r of data) {
  const naam = (r[hi('Naam')]||'').trim()
  if (!naam) continue
  const rec = {
    naam, normNaam: norm(naam),
    email: cleanEmail(r[hi('Organisatie_E-mailadres')]),
    factuur_email: cleanEmail(r[hi('Organisatie_Financieel_e-mailadres')]),
    telefoon: cleanTel(r[hi('Organisatie_Telefoonnummer')]),
    btw_nummer: r[hi('Organisatie_BTW_nummer')]?.trim()||null,
    iban: r[hi('Organisatie_IBAN')]?.trim()||null,
    postcode: r[hi('Organisatie_Bezoekadres_Postcode')]?.trim()||null,
    plaats: r[hi('Organisatie_Bezoekadres_Stad')]?.trim()||null,
    adres: [r[hi('Organisatie_Bezoekadres_Straat')], r[hi('Organisatie_Bezoekadres_Huisnummer')], r[hi('Organisatie_Bezoekadres_Toevoeging')]].filter(Boolean).join(' ').trim()||null,
  }
  records.push(rec)
  if (rec.normNaam && !byNaam.has(rec.normNaam)) byNaam.set(rec.normNaam, rec)
}

// Handmatige whitelist: CRM-naam → CSV-naam (review van earlier output, zeker veilig)
const manualMap = new Map([
  ['Zaanbouw', 'Zaanbouw BV'],
  ['Leolock', 'Leolock B.V.'],
  ['Aku Geveltechniek', 'Aku geveltechniek BV AKUGT'],
  ['Dorpel-shop', 'Dorpel shop B,V.'],
  ['Kees | T-Hagenbouw', 'T Hagenbouw'],
  ['Verkoop | Begra Magazijninrichting B.V.', 'Begra Magazijninrichting B.V.'],
  ['info@bouwbedrijfnielsschuit.nl', 'Bouwbedrijf Niels Schuit'],
])

// Strenger: vereist zelfde eerste 4 tekens + substring + score >= 0.8 (voorkomt "Co-Bouw" ← "Rico Bouw")
function suggest(c) {
  const keyN = norm(c.bedrijfsnaam)
  if (!keyN || keyN.length < 6) return null
  let best = null
  for (const rec of records) {
    if (!rec.normNaam) continue
    if (rec.normNaam === keyN) return rec
    const shorter = rec.normNaam.length < keyN.length ? rec.normNaam : keyN
    const longer = rec.normNaam.length < keyN.length ? keyN : rec.normNaam
    if (shorter.length < 6) continue
    if (!longer.includes(shorter)) continue
    if (rec.normNaam.slice(0, 4) !== keyN.slice(0, 4)) continue
    const score = shorter.length / longer.length
    if (score < 0.8) continue
    if (!best || score > best.score) best = { score, rec }
  }
  return best ? best.rec : null
}

const crm = []
let from = 0
while (true) {
  const { data: batch } = await sb.from('relaties').select('id, bedrijfsnaam, email, telefoon, adres, postcode, plaats, btw_nummer, iban, factuur_email').eq('administratie_id', adminId).range(from, from + 999)
  if (!batch || batch.length === 0) break
  crm.push(...batch); from += 1000
}

// Bouw snelle CSV-lookup op exact originele naam (niet-genormaliseerd)
const byExactNaam = new Map(records.map(r => [r.naam, r]))

let overschreven = 0, gematcht = 0
const sample = []
for (const c of crm) {
  const keyN = norm(c.bedrijfsnaam)
  if (byNaam.has(keyN)) continue // al in vorige ronde gedaan
  let csv = null
  if (manualMap.has(c.bedrijfsnaam)) {
    csv = byExactNaam.get(manualMap.get(c.bedrijfsnaam))
  } else {
    csv = suggest(c)
  }
  if (!csv) continue
  gematcht++
  const upd = {}
  const fields = ['email','telefoon','btw_nummer','iban','postcode','plaats','adres','factuur_email']
  for (const f of fields) if (csv[f] && csv[f] !== c[f]) upd[f] = csv[f]
  if (Object.keys(upd).length === 0) continue
  if (sample.length < 10) sample.push({ crm: c.bedrijfsnaam, csv: csv.naam, upd })
  if (!DRY) await sb.from('relaties').update(upd).eq('id', c.id)
  overschreven++
}

console.log(`Fuzzy matched: ${gematcht}, bijgewerkt: ${overschreven}`)
for (const s of sample) console.log(`  ${s.crm} ← ${s.csv}:`, s.upd)
