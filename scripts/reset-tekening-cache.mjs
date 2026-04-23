import { createSupabaseAdmin } from './db.mjs'

const sb = await createSupabaseAdmin()

const { data, error } = await sb
  .from('ai_tekening_template')
  .update({ validated: false, usage_count: 0 })
  .neq('id', '00000000-0000-0000-0000-000000000000')
  .select('supplier, usage_count, validated')

if (error) {
  console.error('Fout:', error)
  process.exit(1)
}

console.log(`Reset ${data?.length ?? 0} templates:`)
for (const t of data ?? []) console.log(`  ${t.supplier}: validated=${t.validated} usage=${t.usage_count}`)
