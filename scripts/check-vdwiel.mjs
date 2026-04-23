import { createSupabaseAdmin } from './db.mjs'
const sb = await createSupabaseAdmin()
const { data: admin } = await sb.from('administraties').select('id').ilike('naam', '%Rebu%').single()

const { data: rel } = await sb.from('relaties').select('id, bedrijfsnaam').eq('administratie_id', admin.id).ilike('bedrijfsnaam', '%wiel%').limit(5)
console.log('Wiel relaties:', rel)

for (const r of rel || []) {
  const { data: projs } = await sb.from('projecten').select('id, naam, status, created_at').eq('administratie_id', admin.id).eq('relatie_id', r.id)
  console.log(`\n=== ${r.bedrijfsnaam} — ${projs.length} verkoopkansen ===`)
  // Ouderlandsdijk specifiek
  const ouder = (projs || []).filter(p => /ouderl|driehuiz/i.test(p.naam))
  for (const p of ouder) console.log(`  "${p.naam}" | ${p.status}`)
}
