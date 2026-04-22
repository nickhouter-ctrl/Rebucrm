import { createSupabaseAdmin } from './db.mjs'

const supa = await createSupabaseAdmin()
const adminId = 'e69b63b6-1027-4b35-95d7-0df18f697071'

const { data: taken } = await supa
  .from('taken')
  .select('id, taaknummer, titel, omschrijving, relatie_id, relatie:relaties(bedrijfsnaam, contactpersoon, email)')
  .eq('administratie_id', adminId)
  .not('omschrijving', 'is', null)
  .neq('status', 'afgerond')

// Haal alle relaties op voor herkoppeling
const { data: alleRelaties } = await supa.from('relaties').select('id, bedrijfsnaam, contactpersoon, email').eq('administratie_id', adminId).range(0, 3000)
const relatieEmailMap = new Map()
const relatieNaamMap = new Map()
for (const r of alleRelaties || []) {
  if (r.email) relatieEmailMap.set(r.email.toLowerCase().trim(), r.id)
  if (r.bedrijfsnaam) relatieNaamMap.set(r.bedrijfsnaam.toLowerCase().trim(), r.id)
  if (r.contactpersoon) relatieNaamMap.set(r.contactpersoon.toLowerCase().trim(), r.id)
}

let ontkoppeld = 0, herkoppeld = 0, ongemoeid = 0
for (const t of taken || []) {
  if (!t.relatie) continue
  const m = (t.omschrijving).match(/E-?mail\s+(?:ontvangen\s+)?van\s+([^:]+):/i) || (t.omschrijving).match(/Reactie\s+ontvangen\s+van\s+([^:]+):/i)
  if (!m) continue
  const afzender = m[1].trim().toLowerCase()
  const bedrijf = (t.relatie.bedrijfsnaam || '').toLowerCase()
  const contact = (t.relatie.contactpersoon || '').toLowerCase()
  const heeftMatch = (bedrijf && (bedrijf.includes(afzender.split(/\s+/)[0]) || afzender.includes(bedrijf.split(/\s+/)[0])))
    || (contact && (contact.includes(afzender.split(/\s+/)[0]) || afzender.includes(contact.split(/\s+/)[0])))
    || (t.relatie.email && afzender.includes(t.relatie.email.split('@')[0]))
  if (heeftMatch) { ongemoeid++; continue }

  // Probeer te herkoppelen op afzendernaam (exact match)
  let correctId = relatieNaamMap.get(afzender)
  if (!correctId) {
    // Fuzzy op eerste woord (min 4 chars)
    const w = afzender.split(/\s+/)[0]
    if (w.length >= 4) {
      for (const [k, id] of relatieNaamMap) if (k.includes(w)) { correctId = id; break }
    }
  }

  if (correctId && correctId !== t.relatie_id) {
    await supa.from('taken').update({ relatie_id: correctId }).eq('id', t.id)
    herkoppeld++
  } else {
    // Niet te herkoppelen — ontkoppel de foutieve relatie zodat hij triagebaar is
    await supa.from('taken').update({ relatie_id: null }).eq('id', t.id)
    ontkoppeld++
  }
}
console.log(`✓ Herkoppeld naar juiste klant: ${herkoppeld}`)
console.log(`✓ Ontkoppeld (triage nodig): ${ontkoppeld}`)
console.log(`  Onverstoord: ${ongemoeid}`)
