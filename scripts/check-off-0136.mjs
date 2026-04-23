import { createSupabaseAdmin } from './db.mjs'
const sb = await createSupabaseAdmin()

const { data: offerte } = await sb.from('offertes').select('id, offertenummer, versie_nummer').ilike('offertenummer', 'OFF-0136').order('versie_nummer', { ascending: false }).limit(1).single()
if (!offerte) { console.log('OFF-0136 niet gevonden'); process.exit(0) }
console.log(`Offerte ${offerte.offertenummer} v${offerte.versie_nummer} (${offerte.id})`)

const { data: meta } = await sb.from('documenten').select('storage_path').eq('entiteit_type', 'offerte_leverancier_data').eq('entiteit_id', offerte.id).maybeSingle()
if (!meta) { console.log('geen leverancier_data'); process.exit(0) }
const data = JSON.parse(meta.storage_path)
console.log(`margePercentage: ${data.margePercentage}`)
console.log(`marges per element:`, data.marges || {})
console.log(`prijzen aantal: ${Object.keys(data.prijzen || {}).length}`)
for (const [naam, p] of Object.entries(data.prijzen || {})) {
  const marge = (data.marges?.[naam] ?? data.margePercentage ?? 0)
  const verkoop = p.prijs * (1 + marge / 100) * p.hoeveelheid
  console.log(`  "${naam}" | inkoop €${p.prijs} × ${p.hoeveelheid} | marge ${marge}% | verkoop €${verkoop.toFixed(2)}`)
}
