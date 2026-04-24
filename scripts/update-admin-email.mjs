import { createSupabaseAdmin } from './db.mjs'
const sb = await createSupabaseAdmin()

const OLD = 'admin@rebu.nl'
const NEW = 'Nick@rebukozijnen.nl'
const NEW_LOWER = NEW.toLowerCase()

// Update auth user
const { data: { users } } = await sb.auth.admin.listUsers()
const user = users.find(u => u.email === OLD)
if (!user) { console.log('Auth user niet gevonden'); process.exit(1) }
console.log(`Auth user gevonden: ${user.id}`)

const { error: authErr } = await sb.auth.admin.updateUserById(user.id, { email: NEW_LOWER, email_confirm: true })
if (authErr) { console.error('Auth update fout:', authErr); process.exit(1) }
console.log('✓ Auth email bijgewerkt')

// Update profielen.email
const { error: profErr } = await sb.from('profielen').update({ email: NEW_LOWER }).eq('id', user.id)
if (profErr) console.error('Profiel update fout:', profErr)
else console.log('✓ Profiel email bijgewerkt')

console.log('\nLogin nu met', NEW)
