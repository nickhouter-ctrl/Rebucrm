// Splits de openstaande restbetaling van Nisan Stankovic in:
// - 40% termijn (nieuw, status concept)
// - 10% restbetaling (de bestaande restbetaling wordt verlaagd naar 10%)
// Subtotaal en BTW worden naar rato verdeeld; afronding valt in de
// laatste rij zodat het totaal gelijk blijft.
import { createSupabaseAdmin } from './db.mjs'

const sb = await createSupabaseAdmin()

// Vind relatie
const { data: relatie } = await sb
  .from('relaties')
  .select('id, bedrijfsnaam, administratie_id')
  .ilike('bedrijfsnaam', '%nisan%')
  .maybeSingle()

if (!relatie) {
  console.error('Geen relatie gevonden met "Nisan" in bedrijfsnaam')
  process.exit(1)
}
console.log(`Relatie: ${relatie.bedrijfsnaam} (${relatie.id})`)

// Vind alle facturen voor deze relatie
const { data: facturen } = await sb
  .from('facturen')
  .select('id, factuurnummer, factuur_type, status, subtotaal, btw_totaal, totaal, offerte_id, order_id, gerelateerde_factuur_id, onderwerp, datum')
  .eq('relatie_id', relatie.id)
  .order('factuurnummer', { ascending: true })

if (!facturen || facturen.length === 0) {
  console.error('Geen facturen voor deze relatie')
  process.exit(1)
}

console.log('\nGevonden facturen:')
for (const f of facturen) {
  console.log(`  ${f.factuurnummer}  ${f.factuur_type.padEnd(13)} ${f.status.padEnd(11)} excl=${f.subtotaal}  incl=${f.totaal}`)
}

// Vind de openstaande restbetaling (status concept of verzonden)
const restbetaling = facturen.find(f =>
  f.factuur_type === 'restbetaling' && (f.status === 'concept' || f.status === 'verzonden')
)
if (!restbetaling) {
  console.error('\nGeen openstaande restbetaling gevonden')
  process.exit(1)
}

// Vind aanbetaling om totaal-offerte te bepalen
const aanbetaling = facturen.find(f => f.factuur_type === 'aanbetaling')
if (!aanbetaling) {
  console.error('\nGeen aanbetaling gevonden — kan totaal niet bepalen')
  process.exit(1)
}

const totaalSubtotaal = Number(aanbetaling.subtotaal) + Number(restbetaling.subtotaal)
const totaalBtw = Number(aanbetaling.btw_totaal) + Number(restbetaling.btw_totaal)
const aanbetalingPct = Math.round((Number(aanbetaling.subtotaal) / totaalSubtotaal) * 100)

console.log(`\nTotaal offerte: excl=${totaalSubtotaal.toFixed(2)} btw=${totaalBtw.toFixed(2)}`)
console.log(`Aanbetaling: ${aanbetalingPct}%`)
console.log(`Restbetaling nu: ${100 - aanbetalingPct}%`)
console.log(`\nDoel: aanbetaling=${aanbetalingPct}%, termijn=40%, restbetaling=10% (${aanbetalingPct + 40 + 10}% totaal)`)

if (aanbetalingPct + 40 + 10 !== 100) {
  console.error(`\nKan niet 40+10 toevoegen — aanbetaling is ${aanbetalingPct}% (nodig: 50%)`)
  process.exit(1)
}

// Bereken termijn (40%) en nieuwe rest (10%)
const termijnSub = Math.round(totaalSubtotaal * 0.40 * 100) / 100
const termijnBtw = Math.round(totaalBtw * 0.40 * 100) / 100
const termijnTotaal = termijnSub + termijnBtw

const nieuweRestSub = Math.round((totaalSubtotaal - Number(aanbetaling.subtotaal) - termijnSub) * 100) / 100
const nieuweRestBtw = Math.round((totaalBtw - Number(aanbetaling.btw_totaal) - termijnBtw) * 100) / 100
const nieuweRestTotaal = Math.round((nieuweRestSub + nieuweRestBtw) * 100) / 100

console.log(`\nNieuwe termijn: excl=${termijnSub} btw=${termijnBtw} incl=${termijnTotaal}`)
console.log(`Nieuwe rest: excl=${nieuweRestSub} btw=${nieuweRestBtw} incl=${nieuweRestTotaal}`)

if (process.argv[2] !== '--apply') {
  console.log('\nDry-run. Voeg --apply toe om uit te voeren.')
  process.exit(0)
}

// Genereer factuurnummer voor termijn (zelfde flow als app)
const { data: nrData } = await sb.rpc('volgende_nummer', {
  p_administratie_id: relatie.administratie_id,
  p_type: 'factuur',
})
const termijnNummer = nrData
console.log(`\nNieuwe termijn-factuurnummer: ${termijnNummer}`)

// Insert termijn-factuur
const datum = new Date().toISOString().split('T')[0]
const vervaldatum = new Date(Date.now() + 21 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]
const onderwerp = (restbetaling.onderwerp || '')
  .replace(/Restbetaling \d+%/, '2e termijn 40%')
  .replace(/Restbetaling/, '2e termijn 40%')

const { data: termijn, error: insErr } = await sb.from('facturen').insert({
  administratie_id: relatie.administratie_id,
  relatie_id: relatie.id,
  offerte_id: restbetaling.offerte_id,
  order_id: restbetaling.order_id,
  factuur_type: 'termijn',
  factuurnummer: termijnNummer,
  datum,
  vervaldatum,
  status: 'concept',
  onderwerp,
  subtotaal: termijnSub,
  btw_totaal: termijnBtw,
  totaal: termijnTotaal,
  gerelateerde_factuur_id: aanbetaling.id,
}).select('id').single()
if (insErr) {
  console.error('Insert termijn mislukt:', insErr.message)
  process.exit(1)
}
console.log(`Termijn-factuur aangemaakt: ${termijn.id}`)

// Voeg regel toe aan termijn-factuur
await sb.from('factuur_regels').insert({
  factuur_id: termijn.id,
  omschrijving: `2e termijn 40%`,
  aantal: 1,
  prijs: termijnSub,
  btw_percentage: 21,
  totaal: termijnSub,
  volgorde: 0,
})

// Update bestaande restbetaling: bedragen + omschrijving naar 10%
await sb.from('facturen').update({
  subtotaal: nieuweRestSub,
  btw_totaal: nieuweRestBtw,
  totaal: nieuweRestTotaal,
  onderwerp: (restbetaling.onderwerp || '').replace(/Restbetaling \d+%/, 'Restbetaling 10%').replace(/Restbetaling(?! 10%)/, 'Restbetaling 10%'),
}).eq('id', restbetaling.id)

// Update bestaande factuur_regels van de oude restbetaling
const { data: bestRegels } = await sb.from('factuur_regels').select('id').eq('factuur_id', restbetaling.id)
if (bestRegels && bestRegels.length === 1) {
  await sb.from('factuur_regels').update({
    omschrijving: `Restbetaling 10%`,
    prijs: nieuweRestSub,
    totaal: nieuweRestSub,
  }).eq('id', bestRegels[0].id)
} else {
  console.log(`Let op: ${bestRegels?.length || 0} regels op restbetaling — niet automatisch aangepast`)
}

console.log('\nKlaar:')
console.log(`  ${aanbetaling.factuurnummer}  aanbetaling 50% (ongewijzigd)`)
console.log(`  ${termijnNummer}  termijn 40%       (NIEUW, status=concept)`)
console.log(`  ${restbetaling.factuurnummer}  restbetaling 10%   (bedragen aangepast)`)
