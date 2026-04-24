import { createSupabaseAdmin } from './db.mjs'
const sb = await createSupabaseAdmin()

// Check in profielen
const { data: pro } = await sb.from('profielen').select('id, naam, email, rol').ilike('email', '%admin%rebu%')
console.log('Profielen met admin:', pro)

// Check alle medewerker-emails
const { data: mw } = await sb.from('medewerkers').select('id, naam, email')
console.log('\nMedewerkers:')
for (const m of mw || []) console.log(`  ${m.naam}: ${m.email}`)

// Check auth users
const { data: users } = await sb.auth.admin.listUsers()
console.log('\nAuth users met admin of rebu:')
for (const u of users?.users || []) {
  if (u.email?.includes('admin') || u.email?.includes('rebu')) console.log(`  ${u.email} (id: ${u.id.slice(0, 8)})`)
}
