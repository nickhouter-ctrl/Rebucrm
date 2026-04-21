import { createSupabaseAdmin } from './db.mjs'

const supa = await createSupabaseAdmin()

const offerteIds = ['88a8665c-86b1-4609-8a36-60e1790b7585', 'dd2a17a2-cc43-4c37-8daa-86b55bb197b5']

// Haal project_id's + order_id's op
const { data: offertes } = await supa
  .from('offertes')
  .select('id, offertenummer, project_id, relatie_id')
  .in('id', offerteIds)

console.log('Offertes te verwijderen:', offertes)

const projectIds = [...new Set((offertes || []).map(o => o.project_id).filter(Boolean))]

// Zoek gekoppelde orders
const { data: orders } = await supa
  .from('orders')
  .select('id, ordernummer, offerte_id')
  .in('offerte_id', offerteIds)
console.log('Gekoppelde orders:', orders)

// Zoek gekoppelde facturen (restbetaling kan gelinkt zijn via offerte_id)
const { data: extraFacturen } = await supa
  .from('facturen')
  .select('id, factuurnummer, snelstart_boeking_id')
  .in('offerte_id', offerteIds)
console.log('Restfacturen:', extraFacturen)

// Verwijder: factuur_regels, facturen, order_medewerkers, orders, offerte_regels, offertes, projecten
for (const f of extraFacturen || []) {
  await supa.from('factuur_regels').delete().eq('factuur_id', f.id)
  await supa.from('facturen').delete().eq('id', f.id)
  console.log('  Factuur verwijderd:', f.factuurnummer)
}

for (const o of orders || []) {
  await supa.from('order_medewerkers').delete().eq('order_id', o.id)
  await supa.from('orders').delete().eq('id', o.id)
  console.log('  Order verwijderd:', o.ordernummer)
}

for (const id of offerteIds) {
  // Taken die naar deze offerte verwijzen ontkoppelen/verwijderen
  await supa.from('taken').delete().eq('offerte_id', id)
  await supa.from('offerte_regels').delete().eq('offerte_id', id)
  // Gerelateerde berichten / events
  await supa.from('berichten').delete().eq('offerte_id', id).then(() => {}, () => {})
  const { error } = await supa.from('offertes').delete().eq('id', id)
  if (error) console.error('  Offerte error:', error); else console.log('  Offerte verwijderd:', id.slice(0,8))
}

for (const pid of projectIds) {
  // Check: zijn er nog andere offertes gekoppeld aan dit project?
  const { data: andereOffertes } = await supa.from('offertes').select('id').eq('project_id', pid).limit(1)
  if (!andereOffertes || andereOffertes.length === 0) {
    // Verwijder taken gekoppeld aan dit project
    await supa.from('taken').delete().eq('project_id', pid)
    await supa.from('emails').update({ project_id: null }).eq('project_id', pid)
    await supa.from('projecten').delete().eq('id', pid)
    console.log('  Project verwijderd:', pid.slice(0,8))
  } else {
    console.log('  Project behouden (nog andere offertes gekoppeld):', pid.slice(0,8))
  }
}

console.log('\n✓ Test offerte(s) opgeruimd')
