// Test de pdf-parser direct op de specifieke EKO PDF
import { readFileSync } from 'fs'
import { resolve, dirname } from 'path'
import { fileURLToPath } from 'url'

const pdfPath = process.argv[2] || '/Users/houterminiopslag/Downloads/web-26-0558371.pdf'

const pdfBuf = readFileSync(pdfPath)
const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs')
const data = new Uint8Array(pdfBuf)
const pdf = await pdfjs.getDocument({ data }).promise
let fullText = ''
for (let i = 1; i <= pdf.numPages; i++) {
  const page = await pdf.getPage(i)
  const t = await page.getTextContent()
  fullText += t.items.map(it => 'str' in it ? it.str : '').join(' ') + '\n'
}

// Compileer de parser via tsx
const { parseLeverancierPdfText } = await import('../src/lib/pdf-parser.ts').catch(async () => {
  console.log('Direct import faalde, probeer via tsc...')
  process.exit(1)
})

const result = parseLeverancierPdfText(fullText, 'eko-okna')
console.log('TOTAAL:', result.totaal)
console.log('ELEMENTEN:')
for (const e of result.elementen) {
  console.log(`  ${e.naam.padEnd(20)} hoeveelheid=${e.hoeveelheid}  prijs=€${e.prijs}`)
}
