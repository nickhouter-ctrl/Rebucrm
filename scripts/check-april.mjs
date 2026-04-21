import { readFileSync } from 'fs'
import { join } from 'path'

const csv = readFileSync('/Users/houterminiopslag/Downloads/7ecbf974-e396-4f91-a35c-6e0e7e7b173e/Facturen.csv', 'utf8').replace(/^\uFEFF/, '')
const lines = csv.split('\n').filter(l => l.trim()).slice(1)

function parseBedrag(str) {
  if (!str) return 0
  return parseFloat(str.replace(/\./g, '').replace(',', '.')) || 0
}

let aprilAlleStatussen = 0
let aprilBetaald = 0
let aprilVerstuurd = 0
let aprilCount = 0

for (const line of lines) {
  const parts = line.split(';').map(v => v.replace(/^"|"$/g, ''))
  const fase = parts[7]
  const datum = parts[8]
  const totaal = parseBedrag(parts[11])

  if (datum) {
    const [d, m, y] = datum.split('-')
    if (y === '2026' && m === '04') {
      aprilAlleStatussen += totaal
      aprilCount++
      if (fase === 'Betaald') aprilBetaald += totaal
      if (fase === 'Verstuurd') aprilVerstuurd += totaal
    }
  }
}

console.log('April 2026 alle facturen:', aprilAlleStatussen.toFixed(2), `(${aprilCount} stuks)`)
console.log('  - Betaald:', aprilBetaald.toFixed(2))
console.log('  - Verstuurd:', aprilVerstuurd.toFixed(2))
console.log('')
console.log('Tribe zegt: 86.006,30')
console.log('Verschil:', (86006.30 - aprilAlleStatussen).toFixed(2))

// Check: misschien is "deze maand" in Tribe de maand van de export?
// Check ook maart
let maartAlles = 0
let maartCount = 0
for (const line of lines) {
  const parts = line.split(';').map(v => v.replace(/^"|"$/g, ''))
  const datum = parts[8]
  const totaal = parseBedrag(parts[11])
  if (datum) {
    const [d, m, y] = datum.split('-')
    if (y === '2026' && m === '03') {
      maartAlles += totaal
      maartCount++
    }
  }
}
console.log('\nMaart 2026 alle:', maartAlles.toFixed(2), `(${maartCount} stuks)`)
