// Maak rest-facturen voor de 4 aanbetalingen die mijn vorige script ten onrechte
// als "al afgehandeld" markeerde. Bedrag = Tribe ground-truth - aanbet.subtotaal.

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
const dryRun = process.argv[2] !== 'fix'

const TODO = [
  { aanbetNr: 'F-2026-00134', tribeTotaal: 10814.12, naam: 'nieuwemeerdijk 287' },
  { aanbetNr: 'F-2026-00147', tribeTotaal: 6016.26, naam: 'alu schuifpui heerhugowaard' },
  { aanbetNr: 'F-2026-00152', tribeTotaal: 11429.91, naam: 'Deurnestraat 2 Almere' },
  { aanbetNr: 'F-2026-00156', tribeTotaal: 7553.39, naam: 'schuifpui Klaver' },
]

const apiKey = (process.env.MOLLIE_API_KEY || '').trim().replace(/[\r\n]/g, '')
const appUrl = (process.env.NEXT_PUBLIC_APP_URL || 'https://rebucrm.vercel.app').trim().replace(/[\r\n\s]+/g, '')

console.log(`Mode: ${dryRun ? 'DRY-RUN' : 'FIX'}\n`)

for (const t of TODO) {
  const { data: aanbet } = await sb.from('facturen')
    .select('id, factuurnummer, relatie_id, offerte_id, order_id, onderwerp, subtotaal, administratie_id, gerelateerde_factuur_id')
    .eq('factuurnummer', t.aanbetNr).single()
  if (!aanbet) { console.log(`✗ ${t.aanbetNr} niet gevonden`); continue }
  if (aanbet.gerelateerde_factuur_id) { console.log(`✓ ${t.aanbetNr} heeft al gerelateerde factuur, skip`); continue }

  // Dubbel-check: bestaat er een echte rest die TERUGwijst?
  const { data: existing } = await sb.from('facturen').select('factuurnummer').eq('gerelateerde_factuur_id', aanbet.id).maybeSingle()
  if (existing) { console.log(`✓ ${t.aanbetNr}: rest ${existing.factuurnummer} bestaat al`); continue }

  const aanbetSub = Number(aanbet.subtotaal || 0)
  const restSub = Math.round((t.tribeTotaal - aanbetSub) * 100) / 100
  const restBtw = Math.round(restSub * 0.21 * 100) / 100
  const restTot = Math.round((restSub + restBtw) * 100) / 100

  console.log(`→ ${t.aanbetNr} (${t.naam}): aanbet €${aanbetSub} → rest €${restSub} excl + €${restBtw} BTW = €${restTot}`)

  if (dryRun) continue

  const { data: nrNew } = await sb.rpc('volgende_nummer', { p_administratie_id: aanbet.administratie_id, p_type: 'factuur' })
  const vandaag = new Date().toISOString().slice(0, 10)
  const vervaldatum = new Date(Date.now() + 14 * 86400000).toISOString().slice(0, 10)

  const { data: nieuw, error } = await sb.from('facturen').insert({
    administratie_id: aanbet.administratie_id,
    relatie_id: aanbet.relatie_id,
    offerte_id: aanbet.offerte_id || null,
    order_id: aanbet.order_id || null,
    factuur_type: 'restbetaling',
    gerelateerde_factuur_id: aanbet.id,
    factuurnummer: nrNew,
    datum: vandaag,
    vervaldatum,
    status: 'concept',
    onderwerp: `Restbetaling — ${t.naam}`,
    subtotaal: restSub,
    btw_totaal: restBtw,
    totaal: restTot,
    betaald_bedrag: 0,
  }).select('id, factuurnummer').single()
  if (error) { console.error(`  FOUT: ${error.message}`); continue }

  await sb.from('factuur_regels').insert({
    factuur_id: nieuw.id,
    omschrijving: `Restbetaling — ${t.naam}`,
    aantal: 1,
    prijs: restSub,
    btw_percentage: 21,
    totaal: restSub,
    volgorde: 0,
  })
  await sb.from('facturen').update({ gerelateerde_factuur_id: nieuw.id }).eq('id', aanbet.id)

  if (apiKey) {
    try {
      const { createMollieClient } = await import('@mollie/api-client')
      const mollie = createMollieClient({ apiKey })
      const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().replace(/\.\d{3}Z$/, 'Z')
      const link = await mollie.paymentLinks.create({
        amount: { currency: 'EUR', value: restTot.toFixed(2) },
        description: `Factuur ${nrNew}`,
        redirectUrl: `${appUrl}/betaling/succes`,
        webhookUrl: `${appUrl}/api/mollie/webhook`,
        expiresAt,
      })
      const url = link.getPaymentUrl?.() || link._links?.paymentLink?.href || ''
      await sb.from('facturen').update({ mollie_payment_id: link.id, betaal_link: url }).eq('id', nieuw.id)
    } catch (e) { console.warn(`  Mollie fout: ${e.message}`) }
  }

  console.log(`  ✓ aangemaakt: ${nieuw.factuurnummer}`)
}

if (dryRun) console.log('\n[DRY] run met "fix" om aan te maken')
