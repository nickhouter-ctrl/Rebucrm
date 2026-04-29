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

const { data: aanbet } = await sb.from('facturen').select('*').eq('factuurnummer', 'F-2026-00134').single()
console.log('AANBETALING F-2026-00134:')
console.log(`  id: ${aanbet.id}`)
console.log(`  onderwerp: ${aanbet.onderwerp}`)
console.log(`  subtotaal: €${aanbet.subtotaal}`)
console.log(`  offerte_id: ${aanbet.offerte_id}`)
console.log(`  order_id: ${aanbet.order_id}`)
console.log(`  project_id: ${aanbet.project_id}`)
console.log(`  relatie_id: ${aanbet.relatie_id}`)
console.log(`  gerelateerde_factuur_id: ${aanbet.gerelateerde_factuur_id}`)
console.log(`  status: ${aanbet.status}`)

const { data: rest } = await sb.from('facturen').select('*').eq('factuurnummer', 'F-2026-00139').single()
console.log('\nREST F-2026-00139:')
console.log(`  id: ${rest.id}`)
console.log(`  onderwerp: ${rest.onderwerp}`)
console.log(`  subtotaal: €${rest.subtotaal}`)
console.log(`  totaal: €${rest.totaal}`)
console.log(`  offerte_id: ${rest.offerte_id}`)
console.log(`  project_id: ${rest.project_id}`)
console.log(`  factuur_type: ${rest.factuur_type}`)
console.log(`  gerelateerde_factuur_id: ${rest.gerelateerde_factuur_id}`)
console.log(`  status: ${rest.status}`)

console.log('\nALLE OFFERTES DS Bouw met "nieuwemeerdijk" of bedrag rond €10.814:')
const { data: offs } = await sb.from('offertes')
  .select('id, offertenummer, onderwerp, subtotaal, status, project_id')
  .eq('relatie_id', aanbet.relatie_id)
for (const o of offs) {
  if ((o.onderwerp || '').toLowerCase().includes('nieuwemeerdijk') || Math.abs((o.subtotaal || 0) - 10814) < 50) {
    console.log(`  ${o.offertenummer} subtotaal=€${o.subtotaal} project_id=${o.project_id} — "${o.onderwerp}"`)
  }
}

console.log('\nALLE PROJECTEN DS Bouw met "nieuwemeerdijk":')
const { data: projs } = await sb.from('projecten')
  .select('id, naam, status')
  .eq('relatie_id', aanbet.relatie_id)
for (const p of projs) {
  if ((p.naam || '').toLowerCase().includes('nieuwemeerdijk') || (p.naam || '').toLowerCase().includes('287')) {
    console.log(`  ${p.id} ${p.status} — "${p.naam}"`)
  }
}
