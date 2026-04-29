// Loop alle 22 Tribe-eindafrekening aanbetalingen na. Per aanbet:
//   • Heeft hij al een rest-factuur? Skip.
//   • Anders: bereken correcte rest = TRIBE_TOTAAL - aanbet.subtotaal
//   • Maak rest-factuur aan met Mollie-link
//
// Default = dry-run. `node ... fix` voert daadwerkelijk uit.

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

// Tribe ground-truth (sync met TRIBE_EINDAFREKENING in actions.ts)
const TRIBE = [
  { nummer: 'F-2026-00133', offerteTotaal: 10833.33, naam: 'Kees Beentjes — Linden Zonneveld' },
  { nummer: 'F-2026-00143', offerteTotaal: 13149.53, naam: 'offerte broertje — Boendermaker' },
  { nummer: 'F-2026-00172', offerteTotaal: 25344.28, naam: 'glennstraat 7 — Klaas Winter' },
  { nummer: 'F-2025-00398', offerteTotaal: 5732.47, naam: 'Kunststof schuifpui — Bouw Legion' },
  { nummer: 'F-2025-00401', offerteTotaal: 12860.72, naam: 'Callantsogervaart — Bouwbedrijf de Wijn' },
  { nummer: 'F-2026-00033', offerteTotaal: 40489.00, naam: 'Verzoek om offerte — Leon Hartenberg' },
  { nummer: 'F-2026-00049', offerteTotaal: 5595.69, naam: 'voordeur en keuken raam — Michael Segveld' },
  { nummer: 'F-2026-00095', offerteTotaal: 5607.85, naam: 'bram de goede en Petra — Geerlofs' },
  { nummer: 'F-2026-00106', offerteTotaal: 15852.21, naam: 'Adri en Ron — Jochemsen' },
  { nummer: 'F-2026-00126', offerteTotaal: 12289.03, naam: 'Yusuf en Valerie — RIHO' },
  { nummer: 'F-2026-00127', offerteTotaal: 13053.53, naam: 'lijnden — Bijl' },
  { nummer: 'F-2026-00134', offerteTotaal: 10814.12, naam: 'nieuwemeerdijk 287 — DS Bouw' },
  { nummer: 'F-2026-00147', offerteTotaal: 6016.26, naam: 'alu schuifpui — Aanbouw West-Friesland' },
  { nummer: 'F-2026-00171', offerteTotaal: 5066.63, naam: 'Beenen timmerwerken' },
  { nummer: 'F-2026-00152', offerteTotaal: 11429.91, naam: 'Deurnestraat — A. Bax' },
  { nummer: 'F-2026-00094', offerteTotaal: 7156.80, naam: 'sam leijen — Geerlofs' },
  { nummer: 'F-2026-00148', offerteTotaal: 5800.00, naam: 'openslaande deuren — Nike Verhoeven' },
  { nummer: 'F-2026-00145', offerteTotaal: 13156.15, naam: '2x aanbouw — Andy Stoutenburg' },
  { nummer: 'F-2026-00150', offerteTotaal: 4049.54, naam: 'john de lange' },
  { nummer: 'F-2026-00156', offerteTotaal: 7553.39, naam: 'schuifpui — Klaver' },
  { nummer: 'F-2026-00165', offerteTotaal: 4150.12, naam: 'Sint Jansteen — Benjamin van Vliet' },
  { nummer: 'F-2026-00169', offerteTotaal: 6029.56, naam: '4 delige schuifpui — Amadeus' },
]

const apiKey = (process.env.MOLLIE_API_KEY || '').trim().replace(/[\r\n]/g, '')
const appUrl = (process.env.NEXT_PUBLIC_APP_URL || 'https://rebucrm.vercel.app').trim().replace(/[\r\n\s]+/g, '')

console.log(`Mode: ${dryRun ? 'DRY-RUN' : 'FIX (toegepast)'}\n`)

let nieuwAangemaakt = 0
let alAfgehandeld = 0
const skipped = []

for (const t of TRIBE) {
  const { data: aanbet } = await sb.from('facturen')
    .select('id, factuurnummer, relatie_id, offerte_id, order_id, onderwerp, subtotaal, gerelateerde_factuur_id, administratie_id, datum, relatie:relaties(bedrijfsnaam)')
    .eq('factuurnummer', t.nummer)
    .maybeSingle()

  if (!aanbet) { console.log(`✗ ${t.nummer}: aanbetaling niet gevonden`); continue }

  // Al een rest aangemaakt? Drie checks:
  //  A. aanbet.gerelateerde_factuur_id (bidirectionele link)
  //  B. een rest-factuur die TERUGwijst naar deze aanbet
  //  C. losse handmatig aangemaakte rest op zelfde relatie zónder link —
  //     herkenbaar aan factuur_type=restbetaling EN datum >= aanbet.datum
  //     EN onderwerp bevat een woord uit aanbet.onderwerp
  let restAanwezig = !!aanbet.gerelateerde_factuur_id
  if (!restAanwezig) {
    const { data: rest } = await sb.from('facturen')
      .select('id, factuurnummer, totaal')
      .eq('gerelateerde_factuur_id', aanbet.id)
      .in('factuur_type', ['restbetaling', 'volledig'])
      .neq('status', 'gecrediteerd')
      .maybeSingle()
    if (rest) restAanwezig = true
  }
  if (!restAanwezig && aanbet.relatie_id) {
    const { data: losseRest } = await sb.from('facturen')
      .select('id, factuurnummer, onderwerp, datum, totaal')
      .eq('relatie_id', aanbet.relatie_id)
      .eq('factuur_type', 'restbetaling')
      .neq('status', 'gecrediteerd')
      .gte('datum', aanbet.datum || '2024-01-01')
    const aanbetOnderw = (aanbet.onderwerp || '').toLowerCase()
    const aanbetWords = aanbetOnderw.split(/[\s,\/\-—]+/).filter(w => w.length >= 4 && !/^\d+$/.test(w))
    for (const r of (losseRest || [])) {
      const onderw = (r.onderwerp || '').toLowerCase()
      const overlap = aanbetWords.filter(w => onderw.includes(w)).length
      if (overlap > 0) {
        restAanwezig = true
        console.log(`✓ ${t.nummer} (${t.naam}): handmatige rest gevonden (${r.factuurnummer} €${r.totaal})`)
        break
      }
    }
  }
  if (restAanwezig) {
    alAfgehandeld++
    if (!aanbet.gerelateerde_factuur_id) {
      // Skip-melding al gelogd
    } else {
      console.log(`✓ ${t.nummer} (${t.naam}): al rest aangemaakt`)
    }
    continue
  }

  const aanbetSub = Number(aanbet.subtotaal || 0)
  const restSub = Math.round((t.offerteTotaal - aanbetSub) * 100) / 100
  const restBtw = Math.round(restSub * 0.21 * 100) / 100
  const restTot = Math.round((restSub + restBtw) * 100) / 100

  if (restSub <= 0) {
    skipped.push({ nummer: t.nummer, reden: `rest=${restSub} (aanbet ${aanbetSub} ≥ Tribe-totaal ${t.offerteTotaal})` })
    console.log(`⚠ ${t.nummer} (${t.naam}): rest = €${restSub} → SKIP (controleer handmatig)`)
    continue
  }

  console.log(`→ ${t.nummer} (${t.naam}): aanbet €${aanbetSub} → rest €${restSub} excl + €${restBtw} BTW = €${restTot}`)

  if (dryRun) continue

  // Maak rest-factuur aan
  const { data: nummerNieuw } = await sb.rpc('volgende_nummer', { p_administratie_id: aanbet.administratie_id, p_type: 'factuur' })
  const vandaag = new Date().toISOString().slice(0, 10)
  const vervaldatum = new Date(Date.now() + 14 * 86400000).toISOString().slice(0, 10)
  const onderwerpKern = (aanbet.onderwerp || '').replace(/^(?:1e|2e|3e)\s*Factuur\s*\/\s*Aanbetaling\s*/i, '').trim() || t.naam

  const { data: nieuw, error } = await sb.from('facturen').insert({
    administratie_id: aanbet.administratie_id,
    relatie_id: aanbet.relatie_id,
    offerte_id: aanbet.offerte_id || null,
    order_id: aanbet.order_id || null,
    factuur_type: 'restbetaling',
    gerelateerde_factuur_id: aanbet.id,
    factuurnummer: nummerNieuw,
    datum: vandaag,
    vervaldatum,
    status: 'concept',
    onderwerp: `Restbetaling — ${onderwerpKern}`,
    subtotaal: restSub,
    btw_totaal: restBtw,
    totaal: restTot,
    betaald_bedrag: 0,
  }).select('id, factuurnummer').single()

  if (error) { console.error(`  FOUT: ${error.message}`); continue }

  await sb.from('factuur_regels').insert({
    factuur_id: nieuw.id,
    omschrijving: `Restbetaling — ${onderwerpKern}`,
    aantal: 1,
    prijs: restSub,
    btw_percentage: 21,
    totaal: restSub,
    volgorde: 0,
  })

  // Bidirectionele link: koppel aanbet terug aan rest
  await sb.from('facturen').update({ gerelateerde_factuur_id: nieuw.id }).eq('id', aanbet.id)

  // Mollie betaal-link
  if (apiKey) {
    try {
      const { createMollieClient } = await import('@mollie/api-client')
      const mollie = createMollieClient({ apiKey })
      const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().replace(/\.\d{3}Z$/, 'Z')
      const link = await mollie.paymentLinks.create({
        amount: { currency: 'EUR', value: restTot.toFixed(2) },
        description: `Factuur ${nummerNieuw}`,
        redirectUrl: `${appUrl}/betaling/succes`,
        webhookUrl: `${appUrl}/api/mollie/webhook`,
        expiresAt,
      })
      const url = link.getPaymentUrl?.() || link._links?.paymentLink?.href || ''
      await sb.from('facturen').update({ mollie_payment_id: link.id, betaal_link: url }).eq('id', nieuw.id)
    } catch (e) {
      console.warn(`  Mollie fout (niet kritiek): ${e.message}`)
    }
  }

  console.log(`  ✓ aangemaakt: ${nieuw.factuurnummer}`)
  nieuwAangemaakt++
}

console.log(`\n=== Samenvatting ===`)
console.log(`Al afgehandeld:    ${alAfgehandeld}`)
console.log(`Nieuw aangemaakt:  ${nieuwAangemaakt}`)
console.log(`Geskipt:           ${skipped.length}`)
for (const s of skipped) console.log(`  • ${s.nummer}: ${s.reden}`)

if (dryRun) console.log('\n[DRY] run met "fix" om aan te maken')
