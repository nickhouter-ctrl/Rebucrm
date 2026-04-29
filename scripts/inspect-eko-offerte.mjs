// Inspecteer recente EKO offertes om te zien wat er fout gaat met inkoop-prijs.
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

// Vind documenten met entiteit_type = offerte_leverancier_data en parse de meta
const { data: docs } = await sb.from('documenten')
  .select('entiteit_id, storage_path, created_at')
  .eq('entiteit_type', 'offerte_leverancier_data')
  .order('created_at', { ascending: false })
  .limit(50)

for (const doc of (docs || [])) {
  let meta
  try { meta = JSON.parse(doc.storage_path) } catch { continue }
  const tekeningen = Array.isArray(meta) ? meta : (meta.tekeningen || [])
  // EKO of niet?
  const text = JSON.stringify(meta).toLowerCase()
  if (!text.includes('eko') && !text.includes('okna')) continue

  const { data: off } = await sb.from('offertes')
    .select('offertenummer, datum, status, subtotaal, onderwerp')
    .eq('id', doc.entiteit_id)
    .maybeSingle()
  console.log(`\n=== ${off?.offertenummer || doc.entiteit_id} (${doc.created_at?.slice(0, 10)}) ===`)
  console.log(`Status: ${off?.status}, subtotaal: €${off?.subtotaal}`)
  console.log(`Onderwerp: ${off?.onderwerp}`)
  console.log(`Tekeningen: ${tekeningen.length}`)
  for (const t of tekeningen.slice(0, 5)) {
    console.log(`  - ${t.naam || '?'}`)
  }
}
