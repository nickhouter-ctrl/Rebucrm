import { createSupabaseAdmin } from './db.mjs'
const sb = await createSupabaseAdmin()
const { data: admin } = await sb.from('administraties').select('id').ilike('naam', '%Rebu%').single()

for (const fnr of ['2024-11-00011', 'F-2024-00017']) {
  const { data: f } = await sb.from('facturen')
    .select('id, factuurnummer, totaal, snelstart_boeking_id')
    .eq('administratie_id', admin.id).eq('factuurnummer', fnr).single()
  if (!f) { console.log(`${fnr}: niet gevonden`); continue }
  // factuur_regels cascade via FK
  const { error } = await sb.from('facturen').delete().eq('id', f.id)
  if (error) console.error(`${fnr}: ${error.message}`)
  else console.log(`✓ ${fnr} verwijderd (€${f.totaal})`)
}
