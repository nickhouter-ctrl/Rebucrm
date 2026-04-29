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

async function inspect(restNummer, offNummer) {
  console.log(`\n=== ${restNummer} / offerte ${offNummer} ===`)
  const { data: rest } = await sb.from('facturen').select('*').eq('factuurnummer', restNummer).maybeSingle()
  console.log(`Rest: subtotaal=€${rest?.subtotaal} totaal=€${rest?.totaal} relatie=${rest?.relatie_id} offerte_id=${rest?.offerte_id} ger_factuur=${rest?.gerelateerde_factuur_id}`)

  if (rest?.gerelateerde_factuur_id) {
    const { data: aanbet } = await sb.from('facturen').select('factuurnummer, onderwerp, subtotaal, totaal, offerte_id, order_id, datum, relatie_id').eq('id', rest.gerelateerde_factuur_id).maybeSingle()
    console.log(`Aanbetaling: ${aanbet?.factuurnummer} subtotaal=€${aanbet?.subtotaal} offerte_id=${aanbet?.offerte_id} order_id=${aanbet?.order_id} datum=${aanbet?.datum}`)
    console.log(`  onderwerp: "${aanbet?.onderwerp}"`)
  }

  const { data: off } = await sb.from('offertes').select('id, offertenummer, subtotaal, totaal, onderwerp, status, datum, relatie_id').eq('offertenummer', offNummer).maybeSingle()
  console.log(`Offerte ${offNummer}: subtotaal=€${off?.subtotaal} totaal=€${off?.totaal} status=${off?.status} relatie=${off?.relatie_id}`)
  console.log(`  onderwerp: "${off?.onderwerp}"`)

  // Alle aanbetalingen voor deze offerte
  if (off?.id) {
    const { data: alleAanbet } = await sb.from('facturen').select('factuurnummer, subtotaal, totaal, status, factuur_type, datum, onderwerp')
      .eq('offerte_id', off.id)
      .eq('factuur_type', 'aanbetaling')
    console.log(`Aanbetalingen voor offerte ${offNummer}:`)
    for (const a of (alleAanbet || [])) {
      console.log(`  ${a.factuurnummer} ${a.datum} status=${a.status} subtotaal=€${a.subtotaal} — "${a.onderwerp}"`)
    }
  }

  // Berekening
  if (off?.subtotaal && rest?.gerelateerde_factuur_id) {
    const { data: aanbet } = await sb.from('facturen').select('subtotaal').eq('id', rest.gerelateerde_factuur_id).maybeSingle()
    const verwacht = Number(off.subtotaal) - Number(aanbet.subtotaal)
    console.log(`\nVerwachte rest subtotaal: €${off.subtotaal} - €${aanbet.subtotaal} = €${verwacht.toFixed(2)}`)
    console.log(`Werkelijke rest subtotaal: €${rest.subtotaal}`)
  }
}

await inspect('F-2026-00202', 'O-2026-0043')
await inspect('F-2026-00204', 'O-2026-0170')
