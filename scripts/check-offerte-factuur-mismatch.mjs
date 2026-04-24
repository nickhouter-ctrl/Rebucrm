import { createSupabaseAdmin } from './db.mjs'

const sb = await createSupabaseAdmin()

// Alle geaccepteerde offertes (alleen de laatste versie per groep telt)
const { data: offertes } = await sb
  .from('offertes')
  .select('id, offertenummer, versie_nummer, groep_id, relatie_id, datum, subtotaal, totaal, onderwerp, relatie:relaties(bedrijfsnaam)')
  .eq('status', 'geaccepteerd')
  .order('datum', { ascending: false })

// Facturen per offerte_id
const offerteIds = (offertes || []).map(o => o.id)
const { data: facturen } = await sb
  .from('facturen')
  .select('id, factuurnummer, offerte_id, order_id, factuur_type, totaal, subtotaal, status, onderwerp, datum')
  .not('offerte_id', 'is', null)
  .in('offerte_id', offerteIds)

// Orders voor koppeling via order → offerte
const { data: orders } = await sb.from('orders').select('id, offerte_id')
const orderToOfferte = new Map((orders || []).map(o => [o.id, o.offerte_id]))
const { data: orderFacturen } = await sb
  .from('facturen')
  .select('id, factuurnummer, offerte_id, order_id, factuur_type, totaal, subtotaal, status, onderwerp, datum')
  .not('order_id', 'is', null)
const offerteFacturen = new Map()
for (const f of facturen || []) {
  const list = offerteFacturen.get(f.offerte_id) || []
  list.push(f)
  offerteFacturen.set(f.offerte_id, list)
}
for (const f of orderFacturen || []) {
  const oid = f.offerte_id || orderToOfferte.get(f.order_id)
  if (!oid) continue
  const list = offerteFacturen.get(oid) || []
  if (!list.find(x => x.id === f.id)) list.push(f)
  offerteFacturen.set(oid, list)
}

// Groepeer offertes per (relatie_id, groep_id of id) — laatste versie per groep
const latestPerGroep = new Map()
for (const o of offertes || []) {
  const key = o.groep_id || o.id
  const bestaand = latestPerGroep.get(key)
  if (!bestaand || (o.versie_nummer || 0) > (bestaand.versie_nummer || 0)) {
    latestPerGroep.set(key, o)
  }
}

let totaalProbleem = 0
for (const o of latestPerGroep.values()) {
  const f = offerteFacturen.get(o.id) || []
  const relevant = f.filter(x => x.status !== 'concept' && x.factuur_type !== 'credit')
  const gefactureerdTotaal = relevant.reduce((s, x) => s + (x.totaal || 0), 0)
  const offerteTotaal = o.totaal || 0
  const diff = offerteTotaal - gefactureerdTotaal

  // Probleem = geen facturen OF grote afwijking
  const heeftProbleem = f.length === 0 || Math.abs(diff) > 1
  if (!heeftProbleem) continue
  totaalProbleem++

  const klant = o.relatie?.bedrijfsnaam || '-'
  console.log(`\n${klant} — ${o.offertenummer} v${o.versie_nummer || 1} · ${o.onderwerp || '-'}`)
  console.log(`  Offerte totaal: €${offerteTotaal.toFixed(2)}`)
  if (f.length === 0) {
    console.log(`  ⚠ Geen facturen gekoppeld`)
  } else {
    console.log(`  Facturen (${f.length}):`)
    for (const x of f) {
      console.log(`    ${x.factuurnummer} · ${x.factuur_type || 'standaard'} · ${x.status} · €${(x.totaal || 0).toFixed(2)}`)
    }
    console.log(`  Gefactureerd totaal: €${gefactureerdTotaal.toFixed(2)} — verschil €${diff.toFixed(2)}`)
  }
}

console.log(`\n${totaalProbleem} offertes met mismatch gevonden van ${latestPerGroep.size} geaccepteerde offertes`)
