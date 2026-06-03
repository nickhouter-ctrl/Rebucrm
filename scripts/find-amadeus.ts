import { createClient } from '@supabase/supabase-js'
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } })

async function main() {
  // Zoek de Amadeus-relatie
  const { data: relaties } = await sb
    .from('relaties')
    .select('id, bedrijfsnaam')
    .ilike('bedrijfsnaam', '%amadeus%')
  console.log('Gevonden relaties met "amadeus":')
  console.log(relaties)

  if (!relaties || relaties.length === 0) return

  for (const r of relaties) {
    console.log(`\n--- ${r.bedrijfsnaam} (${r.id}) ---`)
    const { data: projecten } = await sb
      .from('projecten')
      .select('id, naam, status, created_at, updated_at')
      .eq('relatie_id', r.id)
      .order('updated_at', { ascending: false })
    console.log('Verkoopkansen:')
    console.log(projecten)

    const { data: facturen } = await sb
      .from('facturen')
      .select('id, factuurnummer, status, factuur_type, totaal, betaald_bedrag, snelstart_openstaand, datum')
      .eq('relatie_id', r.id)
      .order('datum', { ascending: false })
    console.log('Facturen:')
    console.log(facturen)
  }
}

main().catch(e => { console.error(e); process.exit(1) })
