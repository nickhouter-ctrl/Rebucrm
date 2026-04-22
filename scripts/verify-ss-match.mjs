import { createSupabaseAdmin } from './db.mjs'
const sb = await createSupabaseAdmin()
const { data: admin } = await sb.from('administraties').select('id').ilike('naam', '%Rebu%').single()
const { data } = await sb.from('facturen').select('snelstart_openstaand, vervaldatum').eq('administratie_id', admin.id)
const vandaag = new Date().toISOString().slice(0, 10)
const open = data.reduce((s, f) => f.snelstart_openstaand != null ? s + Number(f.snelstart_openstaand) : s, 0)
const verv = data.reduce((s, f) => {
  if (f.snelstart_openstaand == null) return s
  if (!f.vervaldatum || f.vervaldatum > vandaag) return s
  return s + Number(f.snelstart_openstaand)
}, 0)
console.log(`CRM openstaand: €${open.toFixed(2)}`)
console.log(`CRM vervallen:  €${verv.toFixed(2)}`)
