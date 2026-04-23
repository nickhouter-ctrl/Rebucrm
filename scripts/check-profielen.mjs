import { createSupabaseAdmin } from './db.mjs'
const sb = await createSupabaseAdmin()
const { data } = await sb.from('profielen').select('id, naam, email, rol')
console.log('Alle profielen:')
for (const p of data) console.log(`  ${p.id} | naam="${p.naam}" | email="${p.email}" | rol=${p.rol}`)
