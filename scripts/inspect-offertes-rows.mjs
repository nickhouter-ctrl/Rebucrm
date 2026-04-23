import XLSX from 'xlsx'
const wb = XLSX.readFile('/Users/houterminiopslag/Downloads/Offertes.xlsx')
const rows = XLSX.utils.sheet_to_json(wb.Sheets['Offertes'], { defval: null })
// Laat belangrijkste kolommen van 3 rijen zien
for (const r of rows.slice(0, 5)) {
  console.log('---')
  console.log(`Nummer: ${r.Nummer}`)
  console.log(`Onderwerp: ${r.Onderwerp}`)
  console.log(`Relatie: ${r.Relatie_name}`)
  console.log(`Contactpersoon: ${r.Contactpersoon_Voornaam__achternaam}`)
  console.log(`E-mail: ${r['E-mail_adres']}`)
  console.log(`Totaal: ${r.Totaal}`)
  console.log(`Totaal excl BTW: ${r['Totaal_excl._BTW']}`)
  console.log(`Versie: ${r.Versie}`)
  console.log(`Fase: ${r.Fase_Naam_vertaald}`)
  console.log(`Offertedatum: ${r.Offertedatum}`)
  console.log(`Geldig tot: ${r.Geldig_tot}`)
  console.log(`Is_active: ${r.Is_active}`)
}
console.log(`\nTotaal rijen: ${rows.length}`)
// Stats
const metNummer = rows.filter(r => r.Nummer).length
const metTotaal = rows.filter(r => r.Totaal && Number(r.Totaal) > 0).length
const metEmail = rows.filter(r => r['E-mail_adres']).length
console.log(`Met nummer: ${metNummer}, met totaal: ${metTotaal}, met email: ${metEmail}`)
