import { createSupabaseAdmin } from './db.mjs'
const supa = await createSupabaseAdmin()
const { data } = await supa
  .from('facturen')
  .select('id, factuurnummer, status, datum, totaal, snelstart_boeking_id, snelstart_synced_at, created_at')
  .order('created_at', { ascending: false })
  .limit(10)
for (const f of data || []) console.log(f)
