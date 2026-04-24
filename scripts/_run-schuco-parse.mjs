import { readFileSync } from 'fs'
import { getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs'
import { parseLeverancierPdfText } from '../src/lib/pdf-parser.ts'

const data = new Uint8Array(readFileSync('/Users/houterminiopslag/Downloads/Merron .pdf'))
const pdf = await getDocument({ data }).promise
let text = ''
for (let p = 1; p <= pdf.numPages; p++) {
  const page = await pdf.getPage(p)
  const tc = await page.getTextContent()
  let pageText = ''
  let lastY = null
  for (const item of tc.items) {
    if (!('str' in item) || !item.str) continue
    const y = Math.round(item.transform[5])
    const nl = lastY !== null && Math.abs(y - lastY) > 3
    pageText += nl ? '\n' : (pageText && !pageText.endsWith('\n') ? ' ' : '')
    pageText += item.str
    lastY = y
    if (item.hasEOL) { pageText += '\n'; lastY = null }
  }
  text += pageText + '\n\n'
}

const result = parseLeverancierPdfText(text)
console.log('Totaal: €' + result.totaal)
console.log('Aantal elementen:', result.elementen.length)
for (const e of result.elementen) {
  console.log(`  ${e.naam} — ${e.hoeveelheid}× "${e.systeem}" — €${e.prijs}`)
}
