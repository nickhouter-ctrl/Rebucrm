// Vergelijk regex-extracted EKO prijzen vs final offerte regels.
import { readFileSync } from 'fs'
import { resolve, dirname } from 'path'
import { fileURLToPath } from 'url'
import { createSupabaseAdmin } from './db.mjs'

const __dirname = dirname(fileURLToPath(import.meta.url))
try {
  const envPath = resolve(__dirname, '..', '.env.local')
  for (const line of readFileSync(envPath, 'utf-8').split('\n')) {
    const m = line.match(/^([^#=]+)=(.*)$/)
    if (m) { const k = m[1].trim(); const v = m[2].trim().replace(/^["']|["']$/g, ''); if (!process.env[k]) process.env[k] = v }
  }
} catch {}

const sb = await createSupabaseAdmin()
const NUMMER = process.argv[2] || 'OFF-2575'

const { data: off } = await sb.from('offertes').select('id, offertenummer, subtotaal').eq('offertenummer', NUMMER).maybeSingle()
if (!off) { console.error('niet gevonden'); process.exit(1) }
console.log(`Offerte ${off.offertenummer}: subtotaal €${off.subtotaal}\n`)

// Offerte regels
const { data: regels } = await sb.from('offerte_regels').select('omschrijving, aantal, prijs, btw_percentage').eq('offerte_id', off.id).order('volgorde')
console.log('OFFERTE REGELS:')
for (const r of regels) {
  console.log(`  ${r.aantal}× ${r.omschrijving} @ €${r.prijs}`)
}

// Leverancier raw PDF
const { data: pdfDoc } = await sb.from('documenten').select('storage_path').eq('entiteit_type', 'offerte_leverancier').eq('entiteit_id', off.id).maybeSingle()
if (!pdfDoc) { console.log('\nGeen leverancier PDF gevonden'); process.exit(0) }

const { data: pdfFile } = await sb.storage.from('documenten').download(pdfDoc.storage_path)
if (!pdfFile) { console.error('PDF download fail'); process.exit(1) }
const pdfBuf = Buffer.from(await pdfFile.arrayBuffer())

// Bekijk de leverancier_data meta — wat is daar opgeslagen per element?
const { data: metaDoc } = await sb.from('documenten').select('storage_path').eq('entiteit_type', 'offerte_leverancier_data').eq('entiteit_id', off.id).maybeSingle()
if (metaDoc) {
  let meta
  try { meta = JSON.parse(metaDoc.storage_path) } catch {}
  if (meta) {
    console.log('\nLEVERANCIER META:')
    console.log('  margePercentage:', meta.margePercentage)
    console.log('  marges per element:', JSON.stringify(meta.marges, null, 2))
    const tekeningen = Array.isArray(meta) ? meta : meta.tekeningen
    if (tekeningen) {
      console.log(`  ${tekeningen.length} tekeningen:`)
      for (const t of tekeningen) console.log(`    ${t.naam} → ${t.tekeningPath?.split('/').pop()}`)
    }
  }
}

// Parse via parser
const { parsePdfBuffer } = await import('../src/lib/pdf-extract.ts').catch(() => ({ parsePdfBuffer: null }))
// .ts kan niet direct, gebruik pdfjs zelf
const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs')
const data = new Uint8Array(pdfBuf)
const pdf = await pdfjs.getDocument({ data }).promise
let allText = ''
for (let i = 1; i <= pdf.numPages; i++) {
  const page = await pdf.getPage(i)
  const t = await page.getTextContent()
  allText += t.items.map(it => 'str' in it ? it.str : '').join(' ') + '\n\n--- PAGE ' + i + ' ---\n\n'
}

console.log('\n--- RAW TEXT (eerste 3000 chars) ---')
console.log(allText.slice(0, 3000))
console.log('\n\n--- PRIJS-PATRONEN GEVONDEN ---')
const patterns = [
  /Prijs\s+van\s+het\s+element[\s\n]*\d+\s*x\s*([\d\s.]+,\d{2})/gi,
  /Prijs\s+van\s+het\s+element[\s\n]*([\d\s.]+,\d{2})/gi,
  /Deurprijs[\s\n]*([\d\s.]+[.,]\d{2})/gi,
  /Prijs\s+gekoppeld\s+element[\s\n]*([\d\s.]+[.,]\d{2})/gi,
]
for (const p of patterns) {
  const matches = [...allText.matchAll(p)]
  console.log(`${p}: ${matches.length} matches`)
  for (const m of matches.slice(0, 5)) console.log(`   ${m[0].slice(0, 80).replace(/\s+/g, ' ')} → ${m[1]}`)
}
