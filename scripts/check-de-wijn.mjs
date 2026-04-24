import { createSupabaseAdmin } from './db.mjs'
const sb = await createSupabaseAdmin()
const { data: relaties } = await sb.from('relaties').select('id, bedrijfsnaam').ilike('bedrijfsnaam', '%wijn%')
console.log('Relaties:', relaties)

for (const r of relaties || []) {
  const { data: f } = await sb
    .from('facturen')
    .select('id, factuurnummer, status, factuur_type, totaal, betaald_bedrag, gerelateerde_factuur_id, mollie_payment_id')
    .eq('relatie_id', r.id)
    .order('datum', { ascending: false })
  console.log(`\n${r.bedrijfsnaam}:`)
  for (const x of f || []) {
    console.log(`  ${x.factuurnummer} · ${x.status} · type=${x.factuur_type || '-'} · tot=€${x.totaal} betaald=€${x.betaald_bedrag || 0} rel=${x.gerelateerde_factuur_id ? 'JA' : 'nee'} mollie=${x.mollie_payment_id ? 'JA' : 'nee'}`)
  }
}
