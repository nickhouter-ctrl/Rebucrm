import { createSupabaseAdmin } from './db.mjs'

const supa = await createSupabaseAdmin()
const adminId = 'e69b63b6-1027-4b35-95d7-0df18f697071'

// Taken waarvan omschrijving begint met "E-mail van/ontvangen van X" waarbij X niet
// overeenkomt met de gekoppelde relatie bedrijfsnaam/contactpersoon
const { data: taken } = await supa
  .from('taken')
  .select('id, taaknummer, titel, omschrijving, relatie_id, relatie:relaties(bedrijfsnaam, contactpersoon, email)')
  .eq('administratie_id', adminId)
  .not('omschrijving', 'is', null)
  .neq('status', 'afgerond')

const verdacht = []
for (const t of taken || []) {
  if (!t.relatie) continue
  const m = t.omschrijving.match(/E-?mail\s+(?:ontvangen\s+)?van\s+([^:]+):/i) || t.omschrijving.match(/Reactie\s+ontvangen\s+van\s+([^:]+):/i)
  if (!m) continue
  const afzender = m[1].trim().toLowerCase()
  const bedrijf = (t.relatie.bedrijfsnaam || '').toLowerCase()
  const contact = (t.relatie.contactpersoon || '').toLowerCase()
  // Match check: afzender moet voorkomen in bedrijfsnaam of contactpersoon
  const heeftMatch = (bedrijf && (bedrijf.includes(afzender.split(/\s+/)[0]) || afzender.includes(bedrijf.split(/\s+/)[0])))
    || (contact && (contact.includes(afzender.split(/\s+/)[0]) || afzender.includes(contact.split(/\s+/)[0])))
    || (t.relatie.email && afzender.includes(t.relatie.email.split('@')[0]))
  if (!heeftMatch) {
    verdacht.push({ taak: t.taaknummer || t.id.slice(0,8), titel: t.titel, afzender: m[1].trim(), klant: t.relatie.bedrijfsnaam })
  }
}

console.log('Totaal open taken met e-mail origin:', (taken || []).filter(t => /E-?mail|Reactie/.test(t.omschrijving || '')).length)
console.log('\nVerdacht gekoppeld (afzender matcht niet met klant):', verdacht.length)
console.log('\nSample (eerste 20):')
for (const v of verdacht.slice(0, 20)) console.log(` - ${v.taak} | afzender: "${v.afzender}" | klant: "${v.klant}" | titel: ${v.titel}`)
