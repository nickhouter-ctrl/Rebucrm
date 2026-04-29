import { readFileSync } from 'fs'
import { resolve, dirname } from 'path'
import { fileURLToPath } from 'url'
import { createSupabaseAdmin } from './db.mjs'

const __dirname = dirname(fileURLToPath(import.meta.url))
try {
  const envPath = resolve(__dirname, '..', '.env.local')
  for (const line of readFileSync(envPath, 'utf-8').split('\n')) {
    const m = line.match(/^([^#=]+)=(.*)$/)
    if (m) {
      const k = m[1].trim()
      const v = m[2].trim().replace(/^["']|["']$/g, '')
      if (!process.env[k]) process.env[k] = v
    }
  }
} catch {}

const sb = await createSupabaseAdmin()
const dryRun = process.argv[2] !== 'fix'

const FOUT = ['F-2026-00202', 'F-2026-00204']

for (const nummer of FOUT) {
  const { data: f } = await sb.from('facturen').select('id, factuurnummer, gerelateerde_factuur_id, totaal, onderwerp').eq('factuurnummer', nummer).maybeSingle()
  if (!f) { console.log(`${nummer}: niet gevonden`); continue }
  console.log(`${nummer}: "${f.onderwerp}" totaal=€${f.totaal}`)

  if (!dryRun) {
    // Reset de bidirectionele link op de aanbetaling zodat eindafrekeningen-lijst
    // hem weer toont
    if (f.gerelateerde_factuur_id) {
      await sb.from('facturen').update({ gerelateerde_factuur_id: null }).eq('id', f.gerelateerde_factuur_id)
    }
    await sb.from('factuur_regels').delete().eq('factuur_id', f.id)
    await sb.from('facturen').delete().eq('id', f.id)
    console.log(`  → verwijderd`)
  } else {
    console.log(`  [DRY] zou verwijderen + aanbet-koppeling resetten`)
  }
}

if (dryRun) console.log('\n[DRY] run met "fix" om te verwijderen')
