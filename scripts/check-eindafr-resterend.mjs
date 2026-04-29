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

const TRIBE = ['F-2026-00133','F-2026-00143','F-2026-00172','F-2025-00398','F-2025-00401','F-2026-00033','F-2026-00049','F-2026-00095','F-2026-00106','F-2026-00126','F-2026-00127','F-2026-00134','F-2026-00147','F-2026-00171','F-2026-00152','F-2026-00094','F-2026-00148','F-2026-00145','F-2026-00150','F-2026-00156','F-2026-00165','F-2026-00169']

for (const nr of TRIBE) {
  const { data: a } = await sb.from('facturen').select('id, factuurnummer, gerelateerde_factuur_id, onderwerp, subtotaal').eq('factuurnummer', nr).maybeSingle()
  if (!a) continue
  // Vind echte rest die TERUGwijst
  const { data: trueRest } = await sb.from('facturen').select('factuurnummer, onderwerp, totaal').eq('gerelateerde_factuur_id', a.id).maybeSingle()
  // Of bidirectioneel via aanbet
  let bidi = null
  if (a.gerelateerde_factuur_id) {
    const { data: r } = await sb.from('facturen').select('factuurnummer, onderwerp, totaal').eq('id', a.gerelateerde_factuur_id).maybeSingle()
    bidi = r
  }
  const status = trueRest ? `OK → ${trueRest.factuurnummer} €${trueRest.totaal} ("${trueRest.onderwerp}")` : (bidi ? `OK → ${bidi.factuurnummer} €${bidi.totaal}` : 'GEEN REST')
  console.log(`${nr} ${status}`)
  if (!trueRest && !bidi) console.log(`   onderwerp: "${a.onderwerp}" subtotaal=€${a.subtotaal}`)
}
