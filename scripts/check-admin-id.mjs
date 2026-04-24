import { createSupabaseAdmin } from './db.mjs'
const sb = await createSupabaseAdmin()
const { data: admins } = await sb.from('administraties').select('id, naam')
console.log('Administraties:', admins)
const { data: sample } = await sb.from('facturen').select('administratie_id').limit(5)
console.log('Factuur admin_ids sample:', sample)
