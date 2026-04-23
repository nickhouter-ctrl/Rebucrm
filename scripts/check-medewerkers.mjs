import { createSupabaseAdmin } from './db.mjs'
const sb = await createSupabaseAdmin()
const { data } = await sb.from('medewerkers').select('id, naam, email, telefoon, profiel_id')
console.log('Medewerkers:')
for (const m of data) console.log(`  ${m.id} | naam="${m.naam}" | email="${m.email}" | tel="${m.telefoon}" | profiel_id=${m.profiel_id}`)
