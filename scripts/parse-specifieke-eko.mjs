// Parse en analyseer een specifieke EKO PDF om te zien wat de regex pakt
import { readFileSync } from 'fs'
import { resolve, dirname } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const pdfPath = process.argv[2] || '/Users/houterminiopslag/Downloads/web-26-0558371.pdf'

const pdfBuf = readFileSync(pdfPath)
const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs')
const data = new Uint8Array(pdfBuf)
const pdf = await pdfjs.getDocument({ data }).promise

let fullText = ''
const perPage = []
for (let i = 1; i <= pdf.numPages; i++) {
  const page = await pdf.getPage(i)
  const t = await page.getTextContent()
  const txt = t.items.map(it => 'str' in it ? it.str : '').join(' ')
  fullText += txt + '\n\n--- PAGE ' + i + ' ---\n\n'
  perPage.push({ page: i, text: txt })
}

// Vind element headers
const headerPattern = /((?:Gekoppeld\s+)?(?:Element|ELEMENT|Deur|DEUR|Positie|POSITIE)\s+(\d{3})(?:\/\d+)?)\b/g
const headers = [...fullText.matchAll(headerPattern)].map(m => ({ naam: m[1].trim(), pos: m.index }))
console.log(`HEADERS GEVONDEN (${headers.length}):`)
for (const h of headers) console.log(`  ${h.naam} @ pos ${h.pos}`)

// Voor elke header: pak de tekst tot volgende header en zoek prijs
console.log('\n\n=== PRIJS PER ELEMENT ===')
const patterns = [
  { name: 'Prijs van het element multi', re: /Prijs\s+van\s+het\s+element[\s\n]*\d+\s*x\s*([\d\s.]+,\d{2})/i },
  { name: 'Prijs van het element', re: /Prijs\s+van\s+het\s+element[\s\n]*([\d\s.]+,\d{2})/i },
  { name: 'Deurprijs', re: /Deurprijs[\s\n]*([\d\s.]+[.,]\d{2})/i },
  { name: 'Prijs gekoppeld element', re: /Prijs\s+gekoppeld\s+element[\s\n]*([\d\s.]+[.,]\d{2})/i },
]

for (let i = 0; i < headers.length; i++) {
  const start = headers[i].pos
  const end = i < headers.length - 1 ? headers[i + 1].pos : fullText.length
  const sectie = fullText.slice(start, end)

  let prijsGevonden = null
  let viaPattern = null
  for (const p of patterns) {
    const m = sectie.match(p.re)
    if (m) { prijsGevonden = m[1]; viaPattern = p.name; break }
  }
  console.log(`${headers[i].naam.padEnd(28)} → ${prijsGevonden ? `€${prijsGevonden} (via "${viaPattern}")` : 'GEEN PRIJS'}`)
}

// Zoek "337,79" of "2372,49" in de hele tekst om de prijs-locatie te vinden
console.log('\n\n=== ZOEK USER-PRIJZEN ===')
for (const target of ['337,79', '2372,49', '2.372,49', 'Prijs Element', 'Prijs van', '€']) {
  let idx = 0
  while ((idx = fullText.indexOf(target, idx)) !== -1) {
    const ctx = fullText.slice(Math.max(0, idx - 80), idx + target.length + 40).replace(/\s+/g, ' ')
    console.log(`  ${target} @ ${idx}: "${ctx}"`)
    idx += target.length
  }
}

console.log('\n\n=== LAATSTE 3000 CHARS ===')
console.log(fullText.slice(-3000))

// Print de eerste 2 secties volledig om format te zien
console.log('\n\n=== ELEMENT 001 SECTIE (eerste 2500 chars) ===')
const start1 = headers[0].pos
const end1 = headers[1].pos
console.log(fullText.slice(start1, end1).slice(0, 2500))

console.log('\n\n=== ALLE BEDRAGEN (X,XX) IN ELEMENT 001 SECTIE ===')
const sect = fullText.slice(start1, end1)
const all = [...sect.matchAll(/[\d][\d\s.]*[.,]\d{2}/g)]
for (const m of all) {
  // Pak 30 chars context voor en na
  const ctx = sect.slice(Math.max(0, m.index - 40), m.index + m[0].length + 10).replace(/\s+/g, ' ')
  console.log(`  ${m[0].padEnd(15)} | "${ctx.trim()}"`)
}
