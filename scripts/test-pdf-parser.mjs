// Standalone smoke-test voor de pdf-parser. Geen Vitest-setup nodig.
// Test of detectLeverancierFromText correct herkent op kleine sample-strings,
// en of parseLeverancierPdfText met hint deterministisch werkt.

import { detectLeverancierFromText, parseLeverancierPdfText } from '../src/lib/pdf-parser.ts'

let pass = 0
let fail = 0

function expect(label, actual, expected) {
  if (actual === expected) {
    console.log(`✓ ${label}`)
    pass++
  } else {
    console.error(`✗ ${label}`)
    console.error(`    verwacht: ${JSON.stringify(expected)}`)
    console.error(`    actual:   ${JSON.stringify(actual)}`)
    fail++
  }
}

// === Detectie tests ===
expect(
  'Aluplast (Deur 001 + Hoeveelheid)',
  detectLeverancierFromText('Deur 001\nHoeveelheid: 1\nSysteem: Ideal 7000'),
  'aluplast',
)

expect(
  'Gealan oude (Merk + Aantal + Netto totaal)',
  detectLeverancierFromText('Merk A Aantal: 1 Verbinding: 45 Systeem: Gealan S9000\nNetto totaal'),
  'gealan',
)

expect(
  'Gealan NL (Productie maten + Netto prijs + Aantal/Verbinding)',
  detectLeverancierFromText('Productie maten\nZolder voorzijde links\nAantal: 1 Verbinding: 45 Systeem: Gealan\nS9000NL\nNetto prijs'),
  'gealan-nl',
)

expect(
  'Schüco (Merk A Aantal stuks)',
  detectLeverancierFromText('Merk A Aantal stuks: 1 Verbinding: 45 Systeem: Schüco Slide'),
  'schuco',
)

expect(
  'Kochs K-Vision',
  detectLeverancierFromText('001 Kozijnmerk D\nBinnenzicht\nSysteem: K-Vision 120'),
  'kochs',
)

expect(
  'Eko-Okna (Hoev.: N)',
  detectLeverancierFromText('Element 001\nHoev.: 1\nSysteem: Aluprof MB-86'),
  'eko-okna',
)

expect(
  'Onbekend → null',
  detectLeverancierFromText('Random pdf text without recognizable patterns'),
  null,
)

// === Parser hint test (deterministisch) ===
const aluplastSample = `Deur 001
Hoeveelheid: 1
Systeem: Ideal 7000
Buitenkader Aluprof
Element 1 x €500€500`
const r1 = parseLeverancierPdfText(aluplastSample, 'aluplast')
expect('Parser hint aluplast → 1 element', r1.elementen.length, 1)

// === Schüco encoded fallback ===
const schucoEncoded = '1IVO % %ERXEPWXYOW:1 :IVFMRHMRK: :45 7]WXIIQ: 7GLüGS Slide'
const det = detectLeverancierFromText(schucoEncoded)
expect('Schüco encoded → schuco', det, 'schuco')

console.log(`\n${pass}/${pass + fail} tests geslaagd`)
process.exit(fail > 0 ? 1 : 0)
