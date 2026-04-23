import XLSX from 'xlsx'
const wb = XLSX.readFile('/Users/houterminiopslag/Downloads/Offertes.xlsx')
console.log('Sheets:', wb.SheetNames)
for (const name of wb.SheetNames) {
  const sheet = wb.Sheets[name]
  const rows = XLSX.utils.sheet_to_json(sheet, { defval: null })
  console.log(`\n=== Sheet "${name}": ${rows.length} rijen ===`)
  if (rows.length > 0) {
    console.log('Kolommen:', Object.keys(rows[0]))
    console.log('Eerste 2 rijen:')
    for (const r of rows.slice(0, 2)) console.log(' ', JSON.stringify(r).slice(0, 400))
  }
}
