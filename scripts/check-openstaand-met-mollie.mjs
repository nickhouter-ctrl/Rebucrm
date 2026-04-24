import { createSupabaseAdmin } from './db.mjs'
const sb = await createSupabaseAdmin()
const { data, error } = await sb
  .from('facturen')
  .select('id, factuurnummer, status, totaal, betaald_bedrag, mollie_payment_id')
  .in('status', ['verzonden', 'deels_betaald', 'vervallen'])
  .order('factuurnummer')
if (error) { console.error(error); process.exit(1) }
const metMollie = (data || []).filter(f => f.mollie_payment_id)
const zonderMollie = (data || []).filter(f => !f.mollie_payment_id)
console.log(`Openstaand totaal: ${data?.length}`)
console.log(`  met mollie_payment_id: ${metMollie.length}`)
console.log(`  zonder: ${zonderMollie.length}`)
console.log('\nMet Mollie (zouden gehermaild moeten worden):')
for (const f of metMollie) console.log(`  ${f.factuurnummer} ${f.status} €${f.totaal} mollie=${f.mollie_payment_id.slice(0, 12)}...`)
