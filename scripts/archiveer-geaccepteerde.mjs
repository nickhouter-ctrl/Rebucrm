import { createSupabaseAdmin } from './db.mjs'
const sb = await createSupabaseAdmin()
const { data: admin } = await sb.from('administraties').select('id').ilike('naam', '%Rebu%').single()

const { count: voor } = await sb.from('offertes').select('id', { count: 'exact', head: true })
  .eq('administratie_id', admin.id).eq('status', 'geaccepteerd').or('gearchiveerd.is.null,gearchiveerd.eq.false')
console.log(`Geaccepteerde niet-gearchiveerd: ${voor}`)

const { error } = await sb.from('offertes').update({ gearchiveerd: true, gearchiveerd_op: new Date().toISOString() })
  .eq('administratie_id', admin.id).eq('status', 'geaccepteerd').or('gearchiveerd.is.null,gearchiveerd.eq.false')
if (error) { console.error(error.message); process.exit(1) }

const { count: na } = await sb.from('offertes').select('id', { count: 'exact', head: true })
  .eq('administratie_id', admin.id).eq('gearchiveerd', true)
console.log(`Totaal gearchiveerd nu: ${na}`)
