import { createClient } from '@supabase/supabase-js'
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } })

async function main() {
  const STET_ID = '15fe8b89-4fdd-423d-ba47-3a31d4839fbb'

  // Pak offertes met created_by / aangemaakt_door
  const { data: offertes } = await sb
    .from('offertes')
    .select('*')
    .eq('relatie_id', STET_ID)
    .order('datum', { ascending: false })
    .limit(5)

  if (offertes && offertes.length > 0) {
    console.log('Eerste offerte alle velden:')
    console.log(JSON.stringify(offertes[0], null, 2).slice(0, 1500))
    console.log('\nAlle offertes van Stet bouw — relevante velden:')
    for (const o of offertes) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const oo = o as any
      console.log(`  ${o.offertenummer}  ${oo.datum}  created_by=${oo.created_by ?? oo.aangemaakt_door ?? oo.verstuurd_door ?? oo.gebruiker_id ?? '?'}  status=${oo.status}`)
    }

    // Profielen lookup
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const creators = [...new Set(offertes.map((o: any) => o.created_by ?? o.aangemaakt_door ?? o.gebruiker_id).filter(Boolean))]
    if (creators.length > 0) {
      const { data: profs } = await sb.from('profielen').select('id, naam, email').in('id', creators as string[])
      console.log('\nMakers:')
      console.log(profs)
    }
  }
}

main().catch(e => { console.error(e); process.exit(1) })
