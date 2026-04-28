// Split Leon Hartenberg's rest-factuur in 40% + 10% (samen 50%).
// Verwijdert eerst F-2026-00196 (huidige 50% rest), maakt dan 2 nieuwe
// concept-facturen aan met elk een Mollie payment-link.

import { readFileSync } from 'fs'
import { resolve, dirname } from 'path'
import { fileURLToPath } from 'url'
import { createSupabaseAdmin } from './db.mjs'

const __dirname = dirname(fileURLToPath(import.meta.url))
try {
  const envPath = resolve(__dirname, '..', '.env.local')
  const content = readFileSync(envPath, 'utf-8')
  for (const line of content.split('\n')) {
    const m = line.match(/^([^#=]+)=(.*)$/)
    if (m) {
      const key = m[1].trim()
      const val = m[2].trim().replace(/^["']|["']$/g, '')
      if (!process.env[key]) process.env[key] = val
    }
  }
} catch { /* ignore */ }

const sb = await createSupabaseAdmin()
const RELATIE_ID = 'fc645846-ed5e-4230-9cc3-22a6419ae4b7'
const OFFERTE_NUMMER = 'O-2026-0104'

const dryRun = process.argv[2] !== 'fix'

const { data: offerte } = await sb.from('offertes').select('id, administratie_id, offertenummer, subtotaal').eq('relatie_id', RELATIE_ID).eq('offertenummer', OFFERTE_NUMMER).maybeSingle()
if (!offerte) { console.error('Offerte niet gevonden'); process.exit(1) }

const adminId = offerte.administratie_id
const offerteSubtotaal = Number(offerte.subtotaal || 0)

// Bereken 40% en 10%
const sub40 = Math.round((offerteSubtotaal * 0.40) * 100) / 100
const btw40 = Math.round(sub40 * 0.21 * 100) / 100
const tot40 = Math.round((sub40 + btw40) * 100) / 100

const sub10 = Math.round((offerteSubtotaal * 0.10) * 100) / 100
const btw10 = Math.round(sub10 * 0.21 * 100) / 100
const tot10 = Math.round((sub10 + btw10) * 100) / 100

console.log(`Offerte ${offerte.offertenummer} subtotaal: €${offerteSubtotaal}`)
console.log(`40% deel: subtotaal €${sub40} + BTW €${btw40} = totaal €${tot40}`)
console.log(`10% deel: subtotaal €${sub10} + BTW €${btw10} = totaal €${tot10}`)
console.log(`Samen: subtotaal €${sub40 + sub10} = 50% van €${offerteSubtotaal}`)

// Vind huidige 50% rest factuur
const { data: huidige } = await sb.from('facturen').select('id, factuurnummer, status, totaal, mollie_payment_id, gerelateerde_factuur_id, order_id').eq('relatie_id', RELATIE_ID).in('factuur_type', ['restbetaling', 'volledig']).eq('status', 'concept').order('datum', { ascending: false })
console.log(`\nHuidige rest-facturen (concept): ${huidige?.length || 0}`)
for (const h of (huidige || [])) console.log(`  ${h.factuurnummer} | totaal €${h.totaal}`)

// Vind aanbetaling voor gerelateerde_factuur_id link
const { data: aanbet } = await sb.from('facturen').select('id, order_id').eq('relatie_id', RELATIE_ID).eq('factuur_type', 'aanbetaling').order('datum', { ascending: false }).limit(1).single()

if (dryRun) {
  console.log('\n[DRY RUN] Run met "fix" om de huidige rest te verwijderen en 40%+10% concept-facturen te maken.')
  process.exit(0)
}

// Verwijder huidige rest(en)
if (huidige && huidige.length > 0) {
  const huidigeIds = huidige.map(h => h.id)
  // Cancel Mollie payment links voor verwijderde rest-facturen — niet nodig om te canceln, ze verlopen automatisch
  await sb.from('factuur_regels').delete().in('factuur_id', huidigeIds)
  await sb.from('facturen').delete().in('id', huidigeIds)
  console.log(`Verwijderd: ${huidigeIds.length} oude rest-facturen`)
}

// Mollie client
const apiKey = (process.env.MOLLIE_API_KEY || '').trim()
const { createMollieClient } = await import('@mollie/api-client')
const mollie = apiKey ? createMollieClient({ apiKey }) : null
const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://rebucrm.vercel.app'

async function maakFactuur(percent, sub, btw, tot) {
  const { data: nummer } = await sb.rpc('volgende_nummer', { p_administratie_id: adminId, p_type: 'factuur' })
  const vandaag = new Date().toISOString().slice(0, 10)
  const vervaldatum = new Date(Date.now() + 14 * 86400000).toISOString().slice(0, 10)
  const { data: nieuw, error } = await sb.from('facturen').insert({
    administratie_id: adminId,
    relatie_id: RELATIE_ID,
    offerte_id: offerte.id,
    order_id: aanbet?.order_id || null,
    factuur_type: 'restbetaling',
    gerelateerde_factuur_id: aanbet?.id || null,
    factuurnummer: nummer,
    datum: vandaag,
    vervaldatum,
    status: 'concept',
    onderwerp: `Restbetaling ${percent}% — ${offerte.offertenummer} / Verzoek om offerte voor kunststof kozijnen (boven- & benedenverdieping)`,
    subtotaal: sub,
    btw_totaal: btw,
    totaal: tot,
    betaald_bedrag: 0,
  }).select('id, factuurnummer').single()
  if (error) { console.error(error.message); return null }
  await sb.from('factuur_regels').insert({
    factuur_id: nieuw.id,
    omschrijving: `Restbetaling ${percent}% offerte ${offerte.offertenummer}`,
    aantal: 1,
    prijs: sub,
    btw_percentage: 21,
    totaal: sub,
    volgorde: 0,
  })
  // Mollie
  if (mollie) {
    try {
      const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().replace(/\.\d{3}Z$/, 'Z')
      const link = await mollie.paymentLinks.create({
        amount: { currency: 'EUR', value: tot.toFixed(2) },
        description: `Factuur ${nummer}`,
        redirectUrl: `${appUrl}/betaling/succes`,
        webhookUrl: `${appUrl}/api/mollie/webhook`,
        expiresAt,
      })
      const url = link.getPaymentUrl?.() || link._links?.paymentLink?.href || ''
      await sb.from('facturen').update({ mollie_payment_id: link.id, betaal_link: url }).eq('id', nieuw.id)
      console.log(`  ${nieuw.factuurnummer} (${percent}%) — €${tot} — Mollie OK`)
    } catch (err) {
      console.error(`  ${nieuw.factuurnummer} Mollie fout: ${err.message}`)
    }
  } else {
    console.log(`  ${nieuw.factuurnummer} (${percent}%) — €${tot} — geen Mollie key`)
  }
  return nieuw
}

console.log('\nNieuwe concept-facturen aanmaken:')
await maakFactuur(40, sub40, btw40, tot40)
await maakFactuur(10, sub10, btw10, tot10)
console.log('\nKlaar.')
