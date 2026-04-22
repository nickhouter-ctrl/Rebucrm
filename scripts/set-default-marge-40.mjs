import { createSupabaseAdmin } from './db.mjs'

const supabase = await createSupabaseAdmin()
const { data: admin } = await supabase.from('administraties').select('id').ilike('naam', '%Rebu%').single()

const { error, count } = await supabase
  .from('relaties')
  .update({ standaard_marge: 40 }, { count: 'exact' })
  .eq('administratie_id', admin.id)
  .is('standaard_marge', null)

if (error) {
  console.error('FOUT:', error.message)
  process.exit(1)
}
console.log(`Standaard marge 40% gezet op ${count} relaties.`)
