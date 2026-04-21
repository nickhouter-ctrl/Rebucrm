import { createSupabaseAdmin } from './db.mjs'

const supa = await createSupabaseAdmin()
const vandaag = new Date().toISOString().split('T')[0]

// Houter Mini Opslag relatie
// Zoek naar recent geaccepteerde offertes (vandaag)
const { data: geaccepteerd } = await supa
  .from('offertes')
  .select('id, offertenummer, onderwerp, status, totaal, created_at, geaccepteerd_op, relatie_id, project_id, relatie:relaties(bedrijfsnaam)')
  .eq('status', 'geaccepteerd')
  .gte('created_at', vandaag)
  .order('created_at', { ascending: false })
console.log('Geaccepteerde offertes vandaag:')
for (const o of geaccepteerd || []) console.log(' ', { nummer: o.offertenummer, onderwerp: o.onderwerp, totaal: o.totaal, klant: o.relatie?.bedrijfsnaam, id: o.id })

// Alle offertes vandaag
const { data: offertesVandaag } = await supa
  .from('offertes')
  .select('id, offertenummer, onderwerp, status, totaal, created_at, relatie_id, project_id, relatie:relaties(bedrijfsnaam)')
  .gte('created_at', vandaag)
  .order('created_at', { ascending: false })
console.log('\nAlle offertes vandaag:')
for (const o of offertesVandaag || []) console.log(' ', { nummer: o.offertenummer, status: o.status, totaal: o.totaal, klant: o.relatie?.bedrijfsnaam, id: o.id })

const relatie = null

if (relatie) {
  const { data: offertes } = await supa
    .from('offertes')
    .select('id, offertenummer, status, totaal, created_at, project_id')
    .eq('relatie_id', relatie.id)
    .order('created_at', { ascending: false })
    .limit(10)
  console.log('\nOffertes:')
  for (const o of offertes || []) console.log(' ', o)

  const { data: orders } = await supa
    .from('orders')
    .select('id, ordernummer, status, created_at, offerte_id')
    .eq('relatie_id', relatie.id)
    .order('created_at', { ascending: false })
    .limit(10)
  console.log('\nOrders:')
  for (const o of orders || []) console.log(' ', o)

  const { data: projecten } = await supa
    .from('projecten')
    .select('id, naam, status, created_at')
    .eq('relatie_id', relatie.id)
    .order('created_at', { ascending: false })
    .limit(10)
  console.log('\nProjecten:')
  for (const p of projecten || []) console.log(' ', p)

  const { data: facturen } = await supa
    .from('facturen')
    .select('id, factuurnummer, status, totaal, created_at, snelstart_boeking_id')
    .eq('relatie_id', relatie.id)
    .order('created_at', { ascending: false })
    .limit(10)
  console.log('\nFacturen:')
  for (const f of facturen || []) console.log(' ', f)
}
