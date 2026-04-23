import XLSX from 'xlsx'
const wb = XLSX.readFile('/Users/houterminiopslag/Downloads/Offertes.xlsx')
const tribe = XLSX.utils.sheet_to_json(wb.Sheets['Offertes'], { defval: null })
const vt = tribe.filter(r => /vt\s*bouw/i.test((r.Relatie_name || '') + ' ' + (r.Onderwerp || '')))
console.log(`VT Bouw Tribe rijen: ${vt.length}`)
for (const r of vt.slice(0, 5)) {
  console.log(`  ${r.Nummer} | "${r.Onderwerp}" | ${r.Relatie_name} | email=${r['E-mail_adres']} | tel=${r.Contactpersoon_Telefoon} | €${r.Totaal}`)
}
