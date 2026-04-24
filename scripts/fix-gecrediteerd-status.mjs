import { createSupabaseAdmin } from './db.mjs'
const sb = await createSupabaseAdmin()

// Alle credit-facturen pakken om hun gerelateerde_factuur_id te vinden
const { data: creditNotas } = await sb
  .from('facturen')
  .select('id, factuurnummer, gerelateerde_factuur_id')
  .eq('factuur_type', 'credit')
  .not('gerelateerde_factuur_id', 'is', null)

console.log(`${creditNotas?.length ?? 0} credit-facturen gevonden`)
const gecrediteerdIds = (creditNotas || []).map(c => c.gerelateerde_factuur_id)

// Facturen die gecrediteerd zijn maar nog op open-status staan
const { data: origineel } = await sb
  .from('facturen')
  .select('id, factuurnummer, status')
  .in('id', gecrediteerdIds)
  .in('status', ['verzonden', 'deels_betaald', 'vervallen'])

console.log(`${origineel?.length ?? 0} originele facturen staan nog op open-status terwijl er een credit-nota bestaat:`)
for (const f of origineel || []) {
  console.log(`  ${f.factuurnummer} · huidige status: ${f.status} → zet op gecrediteerd`)
}

if ((origineel || []).length > 0) {
  const { error } = await sb
    .from('facturen')
    .update({ status: 'gecrediteerd' })
    .in('id', (origineel || []).map(f => f.id))
  if (error) console.error('Fout:', error)
  else console.log('✓ Bijgewerkt')
}
