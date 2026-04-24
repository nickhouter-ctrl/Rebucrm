import { createSupabaseAdmin } from './db.mjs'
const sb = await createSupabaseAdmin()

const { data: f } = await sb
  .from('facturen')
  .select('*, relatie:relaties(bedrijfsnaam, email)')
  .eq('factuurnummer', 'F-2026-00186')
  .single()

if (!f) { console.log('Factuur niet gevonden'); process.exit(0) }
console.log('Factuur F-2026-00186:')
console.log('  Relatie:', f.relatie?.bedrijfsnaam)
console.log('  Status:', f.status)
console.log('  Datum:', f.datum)
console.log('  Totaal:', f.totaal)
console.log('  Factuur_type:', f.factuur_type)
console.log('  snelstart_synced_at:', f.snelstart_synced_at)
console.log('  snelstart_boeking_id:', f.snelstart_boeking_id)
console.log('  snelstart_openstaand:', f.snelstart_openstaand)
console.log('  mollie_payment_id:', f.mollie_payment_id)
console.log('  order_id:', f.order_id)
console.log('  offerte_id:', f.offerte_id)
