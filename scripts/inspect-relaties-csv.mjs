import fs from 'fs'
const text = fs.readFileSync('/Users/houterminiopslag/Downloads/Organisaties 3.csv', 'utf-8')
// Simpele CSV parser voor quoted fields met ; delimiter
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
console.log(`Rijen: ${data.length}, kolommen: ${headers.length}`)

// Vind de belangrijke kolommen
const relevante = ['Naam', 'Organisatie_Naam', 'Organisatie_Telefoonnummer', 'Organisatie_E-mailadres', 'Organisatie_Financieel_e-mailadres', 'Organisatie_Bezoekadres_Straat', 'Organisatie_Bezoekadres_Huisnummer', 'Organisatie_Bezoekadres_Postcode', 'Organisatie_Bezoekadres_Stad', 'Organisatie_BTW_nummer', 'Organisatie_IBAN']
const idx = {}
for (const k of relevante) idx[k] = headers.indexOf(k)
console.log('Key indices:', idx)

// Sample 5 rows (met gevulde email of telefoon)
let shown = 0
for (const r of data) {
  const email = r[idx['Organisatie_E-mailadres']]
  const tel = r[idx['Organisatie_Telefoonnummer']]
  if (!email && !tel) continue
  console.log(`\n${r[idx['Naam']]} | org="${r[idx['Organisatie_Naam']]}"`)
  console.log(`  email=${email}, financieel=${r[idx['Organisatie_Financieel_e-mailadres']]}`)
  console.log(`  tel=${tel}`)
  console.log(`  adres=${r[idx['Organisatie_Bezoekadres_Straat']]} ${r[idx['Organisatie_Bezoekadres_Huisnummer']]}, ${r[idx['Organisatie_Bezoekadres_Postcode']]} ${r[idx['Organisatie_Bezoekadres_Stad']]}`)
  if (++shown >= 5) break
}
