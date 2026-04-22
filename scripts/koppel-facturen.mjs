import { createSupabaseAdmin } from './db.mjs'

const supabase = await createSupabaseAdmin()
const { data: admin } = await supabase.from('administraties').select('id').ilike('naam', '%Rebu%').single()
const adminId = admin.id

// Zoek relaties
async function vind(query) {
  const { data } = await supabase
    .from('relaties')
    .select('id, bedrijfsnaam, contactpersoon, email')
    .eq('administratie_id', adminId)
    .ilike('bedrijfsnaam', `%${query}%`)
    .limit(10)
  return data || []
}

console.log('ABA kandidaten:')
for (const r of await vind('ABA')) console.log(`  ${r.id} - ${r.bedrijfsnaam} | ${r.email || '-'}`)

console.log('\nStefan kandidaten:')
for (const r of await vind('Stefan')) console.log(`  ${r.id} - ${r.bedrijfsnaam} | ${r.email || '-'}`)
console.log('\nAnna kandidaten:')
for (const r of await vind('Anna')) console.log(`  ${r.id} - ${r.bedrijfsnaam} | ${r.email || '-'}`)

// Zoek ook in contactpersoon veld
async function vindContact(query) {
  const { data } = await supabase
    .from('relaties')
    .select('id, bedrijfsnaam, contactpersoon, email')
    .eq('administratie_id', adminId)
    .ilike('contactpersoon', `%${query}%`)
    .limit(10)
  return data || []
}
console.log('\nContactpersoon Stefan:')
for (const r of await vindContact('Stefan')) console.log(`  ${r.id} - ${r.bedrijfsnaam} / ${r.contactpersoon} | ${r.email || '-'}`)
console.log('\nContactpersoon Anna:')
for (const r of await vindContact('Anna')) console.log(`  ${r.id} - ${r.bedrijfsnaam} / ${r.contactpersoon} | ${r.email || '-'}`)
