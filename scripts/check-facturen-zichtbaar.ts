import { createClient } from '@supabase/supabase-js'
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } })

async function main() {
  const { count: totaal } = await sb.from('facturen').select('*', { count: 'exact', head: true })
  console.log(`Totaal aantal facturen: ${totaal}\n`)

  console.log('Per factuur_type:')
  for (const t of ['aanbetaling', 'restbetaling', 'volledig', 'credit', 'termijn']) {
    const { count } = await sb.from('facturen').select('*', { count: 'exact', head: true }).eq('factuur_type', t)
    console.log(`  ${t.padEnd(15)} ${count}`)
  }
  const { count: nullType } = await sb.from('facturen').select('*', { count: 'exact', head: true }).is('factuur_type', null)
  console.log(`  ${'(null)'.padEnd(15)} ${nullType}`)

  console.log('\nFacturen met onderwerp leeg of NULL en geen factuurnummer (mogelijk fragment):')
  const { data: fragments } = await sb
    .from('facturen')
    .select('id, factuurnummer, status, factuur_type, totaal, datum, relatie:relaties(bedrijfsnaam)')
    .or('factuurnummer.is.null,factuurnummer.eq.')
    .limit(20)
  console.log(fragments)

  console.log('\nFacturen verwijderd in audit_log (laatste 50):')
  const { data: deleted } = await sb
    .from('audit_log')
    .select('id, created_at, user_email, actie, details')
    .eq('actie', 'factuur.delete')
    .order('created_at', { ascending: false })
    .limit(50)
  if (deleted && deleted.length > 0) {
    for (const d of deleted) {
      const det = d.details as { factuurnummer?: string; totaal?: number } | null
      console.log(`  ${d.created_at}  ${d.user_email || '?'}  ${det?.factuurnummer || '?'}  €${Number(det?.totaal || 0).toFixed(2)}`)
    }
  } else {
    console.log('  (geen factuur.delete entries gevonden)')
  }

  console.log('\nOrders met factuur_type=null en wel een order_id (mogelijk wees-facturen):')
  const { data: wezen } = await sb
    .from('facturen')
    .select('id, factuurnummer, totaal, datum, order_id, offerte_id, relatie:relaties(bedrijfsnaam)')
    .is('factuur_type', null)
    .order('datum', { ascending: false })
    .limit(20)
  console.log(wezen)
}

main().catch(e => { console.error(e); process.exit(1) })
