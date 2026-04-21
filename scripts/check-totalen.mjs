import { readFileSync } from 'fs'
import { join } from 'path'

const SOURCE = '/Users/houterminiopslag/Downloads/7ecbf974-e396-4f91-a35c-6e0e7e7b173e'
const csv = readFileSync(join(SOURCE, 'Facturen.csv'), 'utf8').replace(/^\uFEFF/, '')
const lines = csv.split('\n').filter(l => l.trim()).slice(1)

function parseBedrag(str) {
  if (!str) return 0
  return parseFloat(str.replace(/\./g, '').replace(',', '.')) || 0
}

let totaalBetaald = 0
let totaalVerstuurd = 0
let totaalGecrediteerd = 0
let countBetaald = 0
let countVerstuurd = 0
let aprilBetaald = 0
let aprilBetaaldCount = 0
let aprilAlle = 0

for (const line of lines) {
  const parts = line.split(';').map(v => v.replace(/^"|"$/g, ''))
  const fase = parts[7]
  const datum = parts[8] // dd-mm-yyyy
  const totaal = parseBedrag(parts[11])

  if (fase === 'Betaald') {
    totaalBetaald += totaal
    countBetaald++
  }
  if (fase === 'Verstuurd') {
    totaalVerstuurd += totaal
    countVerstuurd++
  }
  if (fase === 'Gecrediteerd') {
    totaalGecrediteerd += totaal
  }

  if (datum) {
    const [d, m, y] = datum.split('-')
    if (y === '2026' && m === '04') {
      aprilAlle += totaal
      if (fase === 'Betaald') {
        aprilBetaald += totaal
        aprilBetaaldCount++
      }
    }
  }
}

console.log('=== CSV Totalen ===')
console.log('Betaald:', totaalBetaald.toFixed(2), `(${countBetaald} facturen)`)
console.log('Verstuurd:', totaalVerstuurd.toFixed(2), `(${countVerstuurd} facturen)`)
console.log('Gecrediteerd:', totaalGecrediteerd.toFixed(2))
console.log('')
console.log('April 2026 betaald (factuurdatum):', aprilBetaald.toFixed(2), `(${aprilBetaaldCount})`)
console.log('April 2026 alle:', aprilAlle.toFixed(2))

// Tribe zegt 86006,30 deze maand
// Verschil: 86006,30 - aprilBetaald
console.log('\nTribe april omzet: 86006.30')
console.log('Verschil:', (86006.30 - aprilBetaald).toFixed(2))
