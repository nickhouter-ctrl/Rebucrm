import { createSupabaseAdmin } from './db.mjs'

const APPLY = process.argv.includes('--apply')
const sb = await createSupabaseAdmin()

// Ratio-tolerances: wat is een "plausibele" factuur-bedrag gegeven offerte-totaal?
// BEWUST conservatief: alleen de standaard Rebu-splits (100% / 70% aanbet / 30% rest).
// Split40/50/60 zijn uitgesloten omdat ratio-coincidentie daar te makkelijk
// leidt tot foute matches met historische Tribe-facturen.
const PLAUSIBLE_RATIOS = [
  { ratio: 1.00, name: 'volledig' },
  { ratio: 0.70, name: 'aanbetaling' },
  { ratio: 0.30, name: 'restbetaling' },
]
const RATIO_TOLERANCE = 0.02 // 2% (strenger)

function isPlausible(factuurBedrag, offerteTotaal) {
  if (offerteTotaal <= 0 || factuurBedrag <= 0) return null
  const r = factuurBedrag / offerteTotaal
  return PLAUSIBLE_RATIOS.find(p => Math.abs(r - p.ratio) <= RATIO_TOLERANCE) || null
}

console.log('=== STAP 1: foute koppelingen vinden ===\n')

// Alle facturen MET offerte_id
const { data: gekoppeldeFacturen } = await sb
  .from('facturen')
  .select('id, factuurnummer, totaal, subtotaal, factuur_type, offerte_id, relatie_id, datum, onderwerp')
  .not('offerte_id', 'is', null)
  .neq('factuur_type', 'credit')

// Offerte-data
const offerteIds = [...new Set((gekoppeldeFacturen || []).map(f => f.offerte_id))]
const { data: offertes } = await sb.from('offertes').select('id, offertenummer, relatie_id, totaal, subtotaal, datum, onderwerp').in('id', offerteIds)
const offerteMap = new Map((offertes || []).map(o => [o.id, o]))

let ontkoppelen = 0
const teOntkoppelenIds = []

for (const f of gekoppeldeFacturen || []) {
  const o = offerteMap.get(f.offerte_id)
  if (!o) continue // offerte bestaat niet meer — laten staan
  // 1. Relatie moet matchen
  if (o.relatie_id !== f.relatie_id) {
    ontkoppelen++
    teOntkoppelenIds.push(f.id)
    continue
  }
  // 2. Bedrag moet plausibel zijn
  const match = isPlausible(Number(f.totaal || 0), Number(o.totaal || 0))
  if (!match) {
    ontkoppelen++
    teOntkoppelenIds.push(f.id)
  }
}

console.log(`  Totaal gekoppelde facturen: ${gekoppeldeFacturen?.length ?? 0}`)
console.log(`  Foute koppelingen (bedrag of relatie mismatch): ${ontkoppelen}`)

if (APPLY && teOntkoppelenIds.length > 0) {
  const { error } = await sb.from('facturen').update({ offerte_id: null }).in('id', teOntkoppelenIds)
  if (error) console.error('Ontkoppelen fout:', error.message)
  else console.log(`  ✓ ${teOntkoppelenIds.length} facturen ontkoppeld`)
}

console.log('\n=== STAP 2: beste matches zoeken ===\n')

// Losse facturen (al losgemaakt) + de die we zouden ontkoppelen in dry-run
const { data: echtLosse } = await sb
  .from('facturen')
  .select('id, factuurnummer, relatie_id, datum, totaal, subtotaal, factuur_type, order_id, onderwerp')
  .is('offerte_id', null)
  .neq('factuur_type', 'credit')
const teOntkoppelenSet = new Set(teOntkoppelenIds)
const losseFacturen = [
  ...(echtLosse || []),
  ...((gekoppeldeFacturen || []).filter(f => teOntkoppelenSet.has(f.id))),
]

const { data: orders } = await sb.from('orders').select('id, offerte_id').not('offerte_id', 'is', null)
const orderToOfferte = new Map((orders || []).map(o => [o.id, o.offerte_id]))

// Alle offertes per relatie
const { data: alleOffertes } = await sb
  .from('offertes')
  .select('id, offertenummer, relatie_id, datum, subtotaal, totaal, onderwerp, status, versie_nummer, groep_id')
  .neq('status', 'geannuleerd')
const offertesPerRelatie = new Map()
for (const o of alleOffertes || []) {
  const list = offertesPerRelatie.get(o.relatie_id) || []
  list.push(o)
  offertesPerRelatie.set(o.relatie_id, list)
}

const MAX_DAYS_AFTER = 180   // factuur binnen half jaar NA offerte (langere projecten)
const MAX_DAYS_BEFORE = 7

let voorstellen = 0
let skipGeen = 0
let skipMeerdere = 0
const updates = []

for (const f of losseFacturen || []) {
  if (f.order_id && orderToOfferte.has(f.order_id)) continue
  const factuurBedrag = Number(f.totaal || 0)
  const factuurDatum = f.datum ? new Date(f.datum) : null
  if (!factuurDatum || factuurBedrag <= 0) { skipGeen++; continue }

  const kandidaten = offertesPerRelatie.get(f.relatie_id) || []
  const matches = []
  for (const o of kandidaten) {
    const ot = Number(o.totaal || 0)
    if (ot <= 0) continue
    const od = o.datum ? new Date(o.datum) : null
    if (!od) continue
    const days = (factuurDatum - od) / 86400000
    if (days > MAX_DAYS_AFTER || days < -MAX_DAYS_BEFORE) continue
    const m = isPlausible(factuurBedrag, ot)
    if (!m) continue
    matches.push({ o, days, type: m.name })
  }
  matches.sort((a, b) => {
    const vA = a.o.versie_nummer || 0
    const vB = b.o.versie_nummer || 0
    if (vA !== vB) return vB - vA
    return Math.abs(a.days) - Math.abs(b.days)
  })
  if (matches.length === 0) { skipGeen++; continue }
  const groepen = new Set(matches.map(m => m.o.groep_id || m.o.id))
  if (groepen.size > 1) { skipMeerdere++; continue }
  const best = matches[0]
  voorstellen++
  updates.push({ factuurId: f.id, factuurnummer: f.factuurnummer, offerteId: best.o.id, offertenummer: best.o.offertenummer, bedrag: factuurBedrag, offerteTotaal: Number(best.o.totaal), type: best.type })
}

console.log(`  Losse facturen na ontkoppelen: ${losseFacturen?.length ?? 0}`)
console.log(`  Voorstellen:          ${voorstellen}`)
console.log(`  Skip meerdere match:  ${skipMeerdere}`)
console.log(`  Skip geen match:      ${skipGeen}`)

if (voorstellen > 0) {
  console.log('\n=== VOORSTEL MATCHES (eerste 30) ===')
  for (const u of updates.slice(0, 30)) {
    console.log(`  ${u.factuurnummer} €${u.bedrag.toFixed(2)} → ${u.offertenummer} (€${u.offerteTotaal.toFixed(2)}, ${u.type})`)
  }
}

if (APPLY && updates.length > 0) {
  console.log('\nKoppelingen toepassen...')
  let ok = 0, err = 0
  for (const u of updates) {
    const { error } = await sb.from('facturen').update({ offerte_id: u.offerteId }).eq('id', u.factuurId)
    if (error) { err++; console.error(`  ✗ ${u.factuurnummer}: ${error.message}`) }
    else ok++
  }
  console.log(`  ✓ ${ok} gekoppeld, ${err} fouten`)
}

console.log(`\nModus: ${APPLY ? 'APPLY' : 'DRY RUN (gebruik --apply om op te slaan)'}`)
