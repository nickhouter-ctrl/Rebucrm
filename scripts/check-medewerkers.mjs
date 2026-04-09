import { createSupabaseAdmin } from './db.mjs'

const supabase = await createSupabaseAdmin()

const { data } = await supabase.from('medewerkers').select('id, naam, email, type, actief, administratie_id').order('naam')
console.log('Alle medewerkers:')
data.forEach(m => console.log(`  ${m.id.substring(0, 8)} | ${m.naam} | ${m.email || '-'} | ${m.type} | actief: ${m.actief} | admin: ${m.administratie_id.substring(0, 8)}`))

// Check dubbelen
const namen = {}
data.forEach(m => { namen[m.naam] = (namen[m.naam] || []).concat(m) })
const dubbelen = Object.entries(namen).filter(([, v]) => v.length > 1)
if (dubbelen.length) {
  console.log('\nDubbele namen:')
  dubbelen.forEach(([naam, medewerkers]) => {
    console.log(`  ${naam}: ${medewerkers.length}x`)
    medewerkers.forEach(m => console.log(`    ${m.id} | email: ${m.email || '-'} | actief: ${m.actief}`))
  })
}
