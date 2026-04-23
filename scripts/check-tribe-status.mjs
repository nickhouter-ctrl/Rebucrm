import XLSX from 'xlsx'
const wb = XLSX.readFile('/Users/houterminiopslag/Downloads/Offertes.xlsx')
const t = XLSX.utils.sheet_to_json(wb.Sheets['Offertes'], { defval: null })
const keys = Object.keys(t[0] || {})
const statusCols = keys.filter(k => /factuur|betaald|afgeslo|status|factureer|geslotn|afrond|fase|akkoord/i.test(k))
console.log('Status-achtige kolommen:', statusCols)
console.log('\nUnieke Fase_Naam_vertaald waarden:')
const fasen = new Map()
for (const r of t) {
  const f = r.Fase_Naam_vertaald || '(null)'
  fasen.set(f, (fasen.get(f) || 0) + 1)
}
for (const [f, c] of [...fasen.entries()].sort((a, b) => b[1] - a[1])) console.log(`  ${f}: ${c}`)

console.log('\nIs_afgesloten distributie:')
const afg = new Map()
for (const r of t) {
  const v = r.Is_afgesloten
  afg.set(v, (afg.get(v) || 0) + 1)
}
for (const [v, c] of afg) console.log(`  ${v}: ${c}`)

console.log('\nTe_factureren (sample 5):')
for (const r of t.slice(0, 5)) console.log(`  ${r.Nummer}: Te_factureren=${r.Te_factureren} Fase=${r.Fase_Naam_vertaald}`)
