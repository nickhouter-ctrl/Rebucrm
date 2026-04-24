import { readFileSync } from 'fs'
import { getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs'

const file = '/Users/houterminiopslag/Downloads/Merron .pdf'
const data = new Uint8Array(readFileSync(file))
const pdf = await getDocument({
  data,
  cMapUrl: new URL('../node_modules/pdfjs-dist/cmaps/', import.meta.url).href,
  cMapPacked: true,
  standardFontDataUrl: new URL('../node_modules/pdfjs-dist/standard_fonts/', import.meta.url).href,
}).promise
console.log(`Pages: ${pdf.numPages}`)

let fullText = ''
for (let pageNum = 1; pageNum <= pdf.numPages; pageNum++) {
  const page = await pdf.getPage(pageNum)
  const tc = await page.getTextContent()
  const items = tc.items.filter(it => 'str' in it)
  let pageText = ''
  let lastY = null
  for (const item of items) {
    if (!item.str) continue
    const y = Math.round(item.transform[5])
    const newLine = lastY !== null && Math.abs(y - lastY) > 3
    pageText += newLine ? '\n' : (pageText && !pageText.endsWith('\n') ? ' ' : '')
    pageText += item.str
    lastY = y
    if (item.hasEOL) { pageText += '\n'; lastY = null }
  }
  fullText += pageText + '\n\n'
}

console.log('\n=== RAW TEXT (first 3000 chars) ===')
console.log(fullText.slice(0, 3000))
console.log('\n=== RAW TEXT (pagina 2 snippet 1500-4500) ===')
console.log(fullText.slice(1500, 4500))
