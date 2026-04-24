import { createSupabaseAdmin } from './db.mjs'

const APPLY = process.argv.includes('--apply')
const sb = await createSupabaseAdmin()

// Conservatieve drempels — alleen koppelen bij zeer waarschijnlijke match
const MAX_DAYS_AFTER_OFFERTE = 120      // factuur binnen X dagen NA offerte
const MAX_DAYS_BEFORE_OFFERTE = 7       // factuur max X dagen VOOR offerte (edge case)
const RATIO_TOLERANCE = 0.02            // max 2% afwijking van verwachte ratio
const EXPECTED_RATIOS = [
  { ratio: 1.00, type: 'volledig' },
  { ratio: 0.70, type: 'aanbetaling' },
  { ratio: 0.30, type: 'restbetaling' },
  { ratio: 0.50, type: 'split_50' },
]

// Alle facturen zonder offerte_id (behalve credit)
const { data: losseFacturen } = await sb
  .from('facturen')
  .select('id, factuurnummer, relatie_id, datum, subtotaal, totaal, factuur_type, order_id, status, onderwerp')
  .is('offerte_id', null)
  .neq('factuur_type', 'credit')

// Skip ook facturen gekoppeld via order.offerte_id
const { data: orders } = await sb.from('orders').select('id, offerte_id').not('offerte_id', 'is', null)
const orderToOfferte = new Map((orders || []).map(o => [o.id, o.offerte_id]))

// Haal alle offertes op (niet concept)
const { data: offertes } = await sb
  .from('offertes')
  .select('id, offertenummer, relatie_id, datum, subtotaal, totaal, status, versie_nummer, groep_id, onderwerp')
  .neq('status', 'concept')
  .neq('status', 'geannuleerd')

// Groepeer offertes per relatie_id
const offertesPerRelatie = new Map()
for (const o of offertes || []) {
  const list = offertesPerRelatie.get(o.relatie_id) || []
  list.push(o)
  offertesPerRelatie.set(o.relatie_id, list)
}

// Haal bestaande koppelingen op om niet dubbel te koppelen
const { data: allFacturen } = await sb.from('facturen').select('id, offerte_id, order_id')
const reedsGekoppeldeOffertes = new Map() // offerteId → [factuurId]
for (const f of allFacturen || []) {
  const oid = f.offerte_id || orderToOfferte.get(f.order_id)
  if (!oid) continue
  const list = reedsGekoppeldeOffertes.get(oid) || []
  list.push(f.id)
  reedsGekoppeldeOffertes.set(oid, list)
}

let voorstellen = 0
let skipMeerdereMatches = 0
let skipGeenMatch = 0
const updates = []

for (const f of losseFacturen || []) {
  // Orders die al een offerte_id hebben slaan we over (koppeling loopt via order)
  if (f.order_id && orderToOfferte.has(f.order_id)) continue

  const kandidaten = offertesPerRelatie.get(f.relatie_id) || []
  if (kandidaten.length === 0) { skipGeenMatch++; continue }

  const factuurBedrag = Number(f.totaal || 0)
  const factuurDatum = f.datum ? new Date(f.datum) : null
  if (!factuurDatum || factuurBedrag <= 0) { skipGeenMatch++; continue }

  // Zoek matches
  const matches = []
  for (const o of kandidaten) {
    const offerteTotaal = Number(o.totaal || 0)
    if (offerteTotaal <= 0) continue
    const offerteDatum = o.datum ? new Date(o.datum) : null
    if (!offerteDatum) continue

    const daysDiff = (factuurDatum - offerteDatum) / 86400000
    if (daysDiff > MAX_DAYS_AFTER_OFFERTE || daysDiff < -MAX_DAYS_BEFORE_OFFERTE) continue

    const ratio = factuurBedrag / offerteTotaal
    const matched = EXPECTED_RATIOS.find(r => Math.abs(ratio - r.ratio) <= RATIO_TOLERANCE)
    if (!matched) continue

    // Als er al een factuur van hetzelfde type gekoppeld is aan deze offerte, skip
    const alGekoppeld = reedsGekoppeldeOffertes.get(o.id) || []
    matches.push({ offerte: o, ratio, type: matched.type, daysDiff, gekoppeld: alGekoppeld.length })
  }

  // Sorteer: nieuwste versie eerst, kortste datum-verschil
  matches.sort((a, b) => {
    const vA = a.offerte.versie_nummer || 0
    const vB = b.offerte.versie_nummer || 0
    if (vA !== vB) return vB - vA
    return Math.abs(a.daysDiff) - Math.abs(b.daysDiff)
  })

  if (matches.length === 0) { skipGeenMatch++; continue }

  // Als er meerdere unieke offertes matchen (niet dezelfde offerte-groep), te onzeker
  const uniekeOffertes = new Set(matches.map(m => m.offerte.groep_id || m.offerte.id))
  if (uniekeOffertes.size > 1) { skipMeerdereMatches++; continue }

  const best = matches[0]
  voorstellen++
  updates.push({
    factuurId: f.id,
    factuurnummer: f.factuurnummer,
    bedrag: factuurBedrag,
    offerteId: best.offerte.id,
    offertenummer: best.offerte.offertenummer,
    offerteTotaal: Number(best.offerte.totaal || 0),
    ratio: best.ratio,
    type: best.type,
    days: Math.round(best.daysDiff),
  })
}

console.log(`\n=== VOORSTELLEN (${voorstellen}) ===`)
for (const u of updates) {
  console.log(`  ${u.factuurnummer} €${u.bedrag.toFixed(2)} → ${u.offertenummer} (${u.type}, ratio ${u.ratio.toFixed(3)}, ${u.days}d na offerte)`)
}
console.log(`\n=== SAMENVATTING ===`)
console.log(`  Losse facturen bekeken: ${losseFacturen?.length ?? 0}`)
console.log(`  Voorstellen:            ${voorstellen}`)
console.log(`  Skip (meerdere offertes matchen): ${skipMeerdereMatches}`)
console.log(`  Skip (geen match):      ${skipGeenMatch}`)
console.log(`  Modus:                  ${APPLY ? 'APPLY (wijzigingen worden opgeslagen)' : 'DRY RUN (geen wijzigingen)'}`)

if (APPLY && updates.length > 0) {
  console.log('\nKoppelingen toepassen...')
  let ok = 0, err = 0
  for (const u of updates) {
    const { error } = await sb.from('facturen').update({ offerte_id: u.offerteId }).eq('id', u.factuurId)
    if (error) { console.error(`  ✗ ${u.factuurnummer}:`, error.message); err++ }
    else ok++
  }
  console.log(`\n✓ ${ok} gekoppeld, ${err} fouten`)
}
