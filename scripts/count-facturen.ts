import { createClient } from '@supabase/supabase-js'
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } })

async function main() {
  const { count: totaal } = await sb.from('facturen').select('*', { count: 'exact', head: true })
  console.log(`Totaal aantal facturen in DB: ${totaal}`)

  // Simuleer wat getFacturen() teruggeeft (geen limit specified → Supabase default 1000)
  const { data } = await sb
    .from('facturen')
    .select('id')
    .order('datum', { ascending: false })
  console.log(`Aantal opgehaald zonder paginatie:  ${data?.length || 0}`)

  if (totaal && data && totaal > data.length) {
    console.log(`\n⚠️  MISSEND: ${totaal - data.length} factuur/facturen worden NIET getoond door de Supabase 1000-rij default-limit!`)
  } else {
    console.log('\nGeen missende facturen door limit.')
  }

  // Per status tellen
  const statussen = ['concept', 'verzonden', 'betaald', 'deels_betaald', 'vervallen', 'gecrediteerd']
  console.log('\nPer status:')
  for (const s of statussen) {
    const { count } = await sb.from('facturen').select('*', { count: 'exact', head: true }).eq('status', s)
    console.log(`  ${s.padEnd(15)} ${count}`)
  }

  // Per jaar
  console.log('\nPer jaar (op datum):')
  for (const jaar of [2024, 2025, 2026]) {
    const { count } = await sb.from('facturen').select('*', { count: 'exact', head: true }).gte('datum', `${jaar}-01-01`).lt('datum', `${jaar + 1}-01-01`)
    console.log(`  ${jaar}: ${count}`)
  }
}

main().catch(e => { console.error(e); process.exit(1) })
