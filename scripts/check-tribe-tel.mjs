import XLSX from 'xlsx'
const wb = XLSX.readFile('/Users/houterminiopslag/Downloads/Offertes.xlsx')
const t = XLSX.utils.sheet_to_json(wb.Sheets['Offertes'], { defval: null })
const metTel = t.filter(r => r.Contactpersoon_Telefoon).length
const metEmail = t.filter(r => r['E-mail_adres'] || r['Contactpersoon_E-mailadres']).length
console.log(`Tribe met Contactpersoon_Telefoon: ${metTel}`)
console.log(`Tribe met email (of contactpersoon email): ${metEmail}`)
// Unieke relaties met tel
const tels = new Map()
for (const r of t) {
  if (r.Contactpersoon_Telefoon && r.Relatie_name) tels.set(r.Relatie_name, r.Contactpersoon_Telefoon)
}
console.log(`Unieke relaties met telefoon in Tribe: ${tels.size}`)
