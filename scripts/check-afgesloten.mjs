import XLSX from 'xlsx'
const wb = XLSX.readFile('/Users/houterminiopslag/Downloads/Offertes.xlsx')
const t = XLSX.utils.sheet_to_json(wb.Sheets['Offertes'], { defval: null })
// Distributie
const combos = new Map()
for (const r of t) {
  const k = `Fase="${r.Fase_Naam_vertaald}" Afgesloten=${r.Is_afgesloten} Afsluitfase="${r.Afsluitfase_Naam_vertaald || ''}"`
  combos.set(k, (combos.get(k) || 0) + 1)
}
for (const [k, c] of [...combos.entries()].sort((a, b) => b[1] - a[1]).slice(0, 15)) {
  console.log(`  [${c}] ${k}`)
}
