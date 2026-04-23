import { createSupabaseAdmin } from './db.mjs'
const sb = await createSupabaseAdmin()
const { data, error } = await sb.from('ai_tekening_template').select('*')
if (error) { console.error(error); process.exit(1) }
console.log(`${data?.length ?? 0} rijen in ai_tekening_template:`)
for (const r of data ?? []) {
  console.log(`  id=${r.id} supplier=${r.supplier} validated=${r.validated} usage=${r.usage_count} regions=${Array.isArray(r.remove_regions_pct) ? r.remove_regions_pct.length : 'n/a'}`)
}
