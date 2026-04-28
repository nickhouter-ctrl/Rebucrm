// Maak de rest-factuur (50%) aan voor Leon Hartenberg
// O-2026-0104 subtotaal = €40.489 → rest = €20.244,50 + 21% BTW

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
const RELATIE_ID = 'fc645846-ed5e-4230-9cc3-22a6419ae4b7'  // Leon Hartenberg
const OFFERTE_NUMMER = 'O-2026-0104'

// Vind de offerte + administratie
const { data: offerte } = await sb.from('offertes').select('id, administratie_id, offertenummer, subtotaal, project_id').eq('relatie_id', RELATIE_ID).eq('offertenummer', OFFERTE_NUMMER).maybeSingle()
if (!offerte) { console.error('Offerte O-2026-0104 niet gevonden'); process.exit(1) }
const adminId = offerte.administratie_id
const offerteSubtotaal = Number(offerte.subtotaal || 0)
console.log(`Offerte ${offerte.offertenummer}: subtotaal €${offerteSubtotaal}`)

// Vind de meest recente aanbetaling voor deze klant
const { data: aanbet } = await sb.from('facturen').select('id, factuurnummer, order_id, datum, gerelateerde_factuur_id').eq('relatie_id', RELATIE_ID).eq('factuur_type', 'aanbetaling').order('datum', { ascending: false }).limit(1).single()
if (!aanbet) { console.error('Geen aanbetaling gevonden voor Leon'); process.exit(1) }
console.log(`Laatste aanbetaling: ${aanbet.factuurnummer} (gerelateerd_factuur_id=${aanbet.gerelateerde_factuur_id || 'null'})`)

// Check of er al een rest-factuur is
const { data: bestaande } = await sb.from('facturen').select('id, factuurnummer, status, totaal').eq('relatie_id', RELATIE_ID).in('factuur_type', ['restbetaling', 'volledig']).order('datum', { ascending: false }).limit(1)
if (bestaande && bestaande.length > 0) {
  console.log(`Er bestaat al een rest-factuur: ${bestaande[0].factuurnummer} (status: ${bestaande[0].status}, totaal: €${bestaande[0].totaal})`)
  console.log('Niet opnieuw aangemaakt — verwijder de bestaande rest eerst als nodig.')
  process.exit(0)
}

// Bereken 50% rest
const restSubtotaal = Math.round((offerteSubtotaal * 0.5) * 100) / 100
const restBtw = Math.round(restSubtotaal * 0.21 * 100) / 100
const restTotaal = Math.round((restSubtotaal + restBtw) * 100) / 100
console.log(`\n50% rest: subtotaal €${restSubtotaal} + BTW €${restBtw} = totaal €${restTotaal}`)

if (process.argv[2] !== 'fix') {
  console.log('\n[DRY RUN] Run met "fix" om de rest-factuur aan te maken.')
  process.exit(0)
}

// Genereer factuurnummer
const { data: nummer } = await sb.rpc('volgende_nummer', { p_administratie_id: adminId, p_type: 'factuur' })
console.log(`\nNieuwe factuurnummer: ${nummer}`)

// Maak factuur
const vandaag = new Date().toISOString().slice(0, 10)
const vervaldatum = new Date(Date.now() + 14 * 86400000).toISOString().slice(0, 10)
const { data: nieuw, error } = await sb.from('facturen').insert({
  administratie_id: adminId,
  relatie_id: RELATIE_ID,
  offerte_id: offerte.id,
  order_id: aanbet.order_id,
  factuur_type: 'restbetaling',
  gerelateerde_factuur_id: aanbet.id,
  factuurnummer: nummer,
  datum: vandaag,
  vervaldatum,
  status: 'concept',
  onderwerp: `Restbetaling — ${offerte.offertenummer} / Verzoek om offerte voor kunststof kozijnen (boven- & benedenverdieping)`,
  subtotaal: restSubtotaal,
  btw_totaal: restBtw,
  totaal: restTotaal,
  betaald_bedrag: 0,
}).select('id, factuurnummer').single()
if (error) { console.error('Insert error:', error.message); process.exit(1) }
console.log(`Factuur aangemaakt: ${nieuw.factuurnummer} (id: ${nieuw.id})`)

// Factuur regel
await sb.from('factuur_regels').insert({
  factuur_id: nieuw.id,
  omschrijving: `Restbetaling 50% offerte ${offerte.offertenummer}`,
  aantal: 1,
  prijs: restSubtotaal,
  btw_percentage: 21,
  totaal: restSubtotaal,
  volgorde: 0,
})

// Bidirectionele link
await sb.from('facturen').update({ gerelateerde_factuur_id: nieuw.id }).eq('id', aanbet.id)

// Mollie payment link
const apiKey = (process.env.MOLLIE_API_KEY || '').trim()
if (apiKey) {
  try {
    const { createMollieClient } = await import('@mollie/api-client')
    const mollie = createMollieClient({ apiKey })
    const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().replace(/\.\d{3}Z$/, 'Z')
    const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://rebucrm.vercel.app'
    const link = await mollie.paymentLinks.create({
      amount: { currency: 'EUR', value: restTotaal.toFixed(2) },
      description: `Factuur ${nummer}`,
      redirectUrl: `${appUrl}/betaling/succes`,
      webhookUrl: `${appUrl}/api/mollie/webhook`,
      expiresAt,
    })
    const url = link.getPaymentUrl?.() || link._links?.paymentLink?.href || ''
    await sb.from('facturen').update({ mollie_payment_id: link.id, betaal_link: url }).eq('id', nieuw.id)
    console.log(`Mollie betaal-link toegevoegd: ${url}`)
  } catch (err) {
    console.error('Mollie link mislukt:', err.message)
  }
}

console.log('\nKlaar.')
