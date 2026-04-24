import { createSupabaseAdmin } from './db.mjs'
const sb = await createSupabaseAdmin()

// Bouwbedrijf Dekens B.V. — we zagen 2 onkoppelde offertes, zoek factuur
const { data: relatie } = await sb.from('relaties').select('id, bedrijfsnaam').ilike('bedrijfsnaam', 'Bouwbedrijf Dekens%').single()
console.log('Relatie:', relatie)

const { data: offertes } = await sb.from('offertes').select('id, offertenummer, datum, totaal, subtotaal, status, versie_nummer, onderwerp').eq('relatie_id', relatie.id).order('datum', { ascending: false })
console.log('\nOffertes:')
for (const o of offertes || []) console.log(`  ${o.offertenummer} v${o.versie_nummer} ${o.datum} €${o.totaal} ${o.status} - ${o.onderwerp}`)

const { data: facturen } = await sb.from('facturen').select('id, factuurnummer, datum, totaal, subtotaal, status, factuur_type, offerte_id, order_id, onderwerp').eq('relatie_id', relatie.id).order('datum', { ascending: false })
console.log('\nFacturen:')
for (const f of facturen || []) console.log(`  ${f.factuurnummer} ${f.datum} €${f.totaal} type=${f.factuur_type || '-'} ${f.status} offerte_id=${f.offerte_id || '-'} - ${f.onderwerp}`)
