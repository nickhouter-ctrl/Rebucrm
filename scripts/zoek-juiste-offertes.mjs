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

console.log('\n=== Alle offertes Bouwbedrijf M. Geerlofs (zoek "Bram") ===')
const { data: geerlofs } = await sb.from('offertes')
  .select('offertenummer, onderwerp, subtotaal, totaal, status, datum, versie_nummer')
  .eq('relatie_id', 'f6bccc58-12ad-489e-b1e0-6e4a31855f63')
  .order('datum', { ascending: false })
for (const o of (geerlofs || [])) {
  console.log(`  ${o.offertenummer} v${o.versie_nummer} ${o.datum} ${o.status} subtotaal=€${o.subtotaal} — "${o.onderwerp}"`)
}

console.log('\n=== Alle offertes DS Bouw BV (zoek "nieuwemeerdijk 287") ===')
const { data: dsbouw } = await sb.from('offertes')
  .select('offertenummer, onderwerp, subtotaal, totaal, status, datum, versie_nummer')
  .eq('relatie_id', '83d3c9ae-cd54-417a-b96e-b162b385e658')
  .order('datum', { ascending: false })
for (const o of (dsbouw || [])) {
  console.log(`  ${o.offertenummer} v${o.versie_nummer} ${o.datum} ${o.status} subtotaal=€${o.subtotaal} — "${o.onderwerp}"`)
}
