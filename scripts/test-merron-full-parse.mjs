import { readFileSync } from 'fs'
import { getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs'

const file = '/Users/houterminiopslag/Downloads/Merron .pdf'
const data = new Uint8Array(readFileSync(file))
const pdf = await getDocument({
  data,
  cMapUrl: new URL('../node_modules/pdfjs-dist/cmaps/', import.meta.url).href,
  cMapPacked: true,
}).promise

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

// Simuleer decoder uit parser
if (/1IVO\s*[%&'()*]/.test(fullText) && !/Merk\s+[A-Z]\s+Aantal/i.test(fullText)) {
  fullText = fullText.split('').map(c => {
    const code = c.charCodeAt(0)
    if (code <= 32 || code > 126) return c
    if ((code >= 37 && code <= 42) || (code >= 49 && code <= 90) || (code >= 97 && code <= 122)) {
      const shifted = code + 28
      if (shifted >= 37 && shifted <= 126) return String.fromCharCode(shifted)
    }
    return c
  }).join('')
  fullText = fullText.replace(/Sch[¿ü]co/g, 'Schüco')
}

console.log('=== DECODED TEXT (2500 chars) ===')
console.log(fullText.slice(0, 2500))
console.log('\n=== Merk-headers gevonden? ===')
const matches = [...fullText.matchAll(/Merk\s+([A-Z])\s+Aantal\s*stuks\s*:\s*(\d+)/gi)]
for (const m of matches) console.log(`  ${m[0]}`)
console.log('\n=== Netto totaal ===')
const t = fullText.match(/Netto\s*totaal[\s\n]*([\d.,]+)/i)
console.log(t ? t[0] : '(niet gevonden)')
console.log('\n=== Per-element prijzen ===')
const prices = [...fullText.matchAll(/Raam[\s\n]+([\d.,]+)[\s\n]+[\d.,]+\s*%[\s\n]+[\d.,]+[\s\n]+([\d.,]+)/g)]
for (const p of prices) console.log(`  ${p[0]}`)
