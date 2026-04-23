import XLSX from 'xlsx'
import { createSupabaseAdmin } from './db.mjs'
const sb = await createSupabaseAdmin()
const { data: admin } = await sb.from('administraties').select('id').ilike('naam', '%Rebu%').single()

const { data: zonder } = await sb.from('offertes')
  .select('id, offertenummer, onderwerp, status, versie_nummer, created_at, datum, relatie:relaties(bedrijfsnaam, email, telefoon)')
  .eq('administratie_id', admin.id).or('totaal.is.null,totaal.eq.0').limit(40)

console.log(`Sample 40 offertes zonder prijs:`)
for (const o of zonder || []) {
  console.log(`  ${o.offertenummer} v${o.versie_nummer} [${o.status}] ${o.datum || '?'} | ${o.relatie?.bedrijfsnaam || '(geen relatie)'} | "${(o.onderwerp || '').slice(0, 60)}"`)
}

// Tel hoeveel relaties zonder email/telefoon
const { count: zonderEmail } = await sb.from('relaties').select('id', { count: 'exact', head: true }).eq('administratie_id', admin.id).or('email.is.null,email.eq.')
const { count: zonderTel } = await sb.from('relaties').select('id', { count: 'exact', head: true }).eq('administratie_id', admin.id).or('telefoon.is.null,telefoon.eq.')
console.log(`\nRelaties zonder email: ${zonderEmail}`)
console.log(`Relaties zonder telefoon: ${zonderTel}`)

// Tribe: hoeveel rijen hebben emails/telefoons
const wb = XLSX.readFile('/Users/houterminiopslag/Downloads/Offertes.xlsx')
const tribe = XLSX.utils.sheet_to_json(wb.Sheets['Offertes'], { defval: null })
const metEmail = tribe.filter(r => r['E-mail_adres']).length
const metTel = tribe.filter(r => r.Telefoonnummer).length
console.log(`\nTribe rijen met email: ${metEmail}`)
console.log(`Tribe rijen met telefoon: ${metTel}`)
// Welke kolom heet telefoon
const keys = Object.keys(tribe[0] || {})
console.log('Telefoon-achtige kolommen:', keys.filter(k => /telefoon|telefon|phone|gsm/i.test(k)))
console.log('Email-achtige kolommen:', keys.filter(k => /mail/i.test(k)))
