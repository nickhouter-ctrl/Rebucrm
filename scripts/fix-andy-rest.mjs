// Andy Stoutenburg — corrigeer de onjuiste eindafrekening F-2026-00200.
// Aanbetaling F-2026-00145 ("2x aanbouw" €10.585,40) was niet aan een
// offerte gekoppeld, het systeem pakte foutief OFF-0678 (Mike Krom Schüco
// €42.945) als referentie → rest €32.360 onjuist.
//
// Correcte offerte: O-2026-0457 "2x aanbouw" (subtotaal €13.156,15).
// Rest = €13.156,15 - €10.585,40 = €2.570,75 subtotaal.

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
const RELATIE_ID = '26f9b834-5be9-4381-8944-d33276900f0b'  // Andy Stoutenburg
const AANBET_NUMMER = 'F-2026-00145'                       // 1e Factuur 2x aanbouw
const FOUT_REST_NUMMER = 'F-2026-00200'                    // huidige onjuiste rest
const JUISTE_OFFERTE_NUMMER = 'O-2026-0457'                // 2x aanbouw geaccepteerd

const dryRun = process.argv[2] !== 'fix'

// Vind de juiste offerte
const { data: offerte } = await sb.from('offertes').select('id, administratie_id, offertenummer, subtotaal, project_id').eq('relatie_id', RELATIE_ID).eq('offertenummer', JUISTE_OFFERTE_NUMMER).maybeSingle()
if (!offerte) { console.error('Juiste offerte niet gevonden'); process.exit(1) }

// Vind aanbetaling + onjuiste rest
const { data: aanbet } = await sb.from('facturen').select('id, factuurnummer, subtotaal, totaal, order_id, gerelateerde_factuur_id').eq('factuurnummer', AANBET_NUMMER).maybeSingle()
const { data: foutRest } = await sb.from('facturen').select('id, factuurnummer, mollie_payment_id, betaal_link').eq('factuurnummer', FOUT_REST_NUMMER).maybeSingle()
if (!aanbet) { console.error('Aanbetaling niet gevonden'); process.exit(1) }
if (!foutRest) { console.error('Onjuiste rest niet gevonden — al verwijderd?'); }

const adminId = offerte.administratie_id
const offerteSubtotaal = Number(offerte.subtotaal || 0)
const aanbetSubtotaal = Number(aanbet.subtotaal || 0)
const restSubtotaal = Math.max(0, Math.round((offerteSubtotaal - aanbetSubtotaal) * 100) / 100)
const restBtw = Math.round(restSubtotaal * 0.21 * 100) / 100
const restTotaal = Math.round((restSubtotaal + restBtw) * 100) / 100

console.log(`Offerte ${offerte.offertenummer}: subtotaal €${offerteSubtotaal}`)
console.log(`Aanbetaling ${aanbet.factuurnummer}: subtotaal €${aanbetSubtotaal}`)
console.log(`Correcte rest: subtotaal €${restSubtotaal} + BTW €${restBtw} = totaal €${restTotaal}`)
console.log(`Verwijderen: ${foutRest?.factuurnummer || '(geen)'} (had €${foutRest ? '32360,04' : 0})`)

if (dryRun) {
  console.log('\n[DRY RUN] Run met "fix" om te corrigeren.')
  process.exit(0)
}

// 1. Koppel aanbetaling aan juiste offerte (handig voor toekomstige logica)
await sb.from('facturen').update({ offerte_id: offerte.id }).eq('id', aanbet.id)
console.log(`Aanbetaling ${aanbet.factuurnummer} gekoppeld aan ${offerte.offertenummer}`)

// 2. Verwijder onjuiste rest-factuur (met regels)
if (foutRest) {
  await sb.from('factuur_regels').delete().eq('factuur_id', foutRest.id)
  await sb.from('facturen').delete().eq('id', foutRest.id)
  console.log(`Onjuiste rest ${foutRest.factuurnummer} verwijderd`)
}

// 3. Maak juiste rest aan
const { data: nummer } = await sb.rpc('volgende_nummer', { p_administratie_id: adminId, p_type: 'factuur' })
const vandaag = new Date().toISOString().slice(0, 10)
const vervaldatum = new Date(Date.now() + 14 * 86400000).toISOString().slice(0, 10)
const { data: nieuw, error } = await sb.from('facturen').insert({
  administratie_id: adminId,
  relatie_id: RELATIE_ID,
  offerte_id: offerte.id,
  order_id: aanbet.order_id || null,
  factuur_type: 'restbetaling',
  gerelateerde_factuur_id: aanbet.id,
  factuurnummer: nummer,
  datum: vandaag,
  vervaldatum,
  status: 'concept',
  onderwerp: `Restbetaling — ${offerte.offertenummer} / 2x aanbouw`,
  subtotaal: restSubtotaal,
  btw_totaal: restBtw,
  totaal: restTotaal,
  betaald_bedrag: 0,
}).select('id, factuurnummer').single()
if (error) { console.error(error.message); process.exit(1) }
console.log(`Nieuwe rest aangemaakt: ${nieuw.factuurnummer} (totaal €${restTotaal})`)

await sb.from('factuur_regels').insert({
  factuur_id: nieuw.id,
  omschrijving: `Restbetaling offerte ${offerte.offertenummer} (2x aanbouw)`,
  aantal: 1,
  prijs: restSubtotaal,
  btw_percentage: 21,
  totaal: restSubtotaal,
  volgorde: 0,
})

await sb.from('facturen').update({ gerelateerde_factuur_id: nieuw.id }).eq('id', aanbet.id)

// 4. Mollie link
const apiKey = (process.env.MOLLIE_API_KEY || '').trim().replace(/[\r\n]/g, '')
if (apiKey) {
  try {
    const { createMollieClient } = await import('@mollie/api-client')
    const mollie = createMollieClient({ apiKey })
    const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().replace(/\.\d{3}Z$/, 'Z')
    const appUrl = (process.env.NEXT_PUBLIC_APP_URL || 'https://rebucrm.vercel.app').trim().replace(/[\r\n\s]+/g, '')
    const link = await mollie.paymentLinks.create({
      amount: { currency: 'EUR', value: restTotaal.toFixed(2) },
      description: `Factuur ${nummer}`,
      redirectUrl: `${appUrl}/betaling/succes`,
      webhookUrl: `${appUrl}/api/mollie/webhook`,
      expiresAt,
    })
    const url = link.getPaymentUrl?.() || link._links?.paymentLink?.href || ''
    await sb.from('facturen').update({ mollie_payment_id: link.id, betaal_link: url }).eq('id', nieuw.id)
    console.log(`Mollie link toegevoegd: ${url}`)
  } catch (err) {
    console.error('Mollie fout:', err.message)
  }
}

console.log('\nKlaar.')
