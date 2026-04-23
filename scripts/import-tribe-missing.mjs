// Insert Tribe-rijen die nog NIET in CRM staan als nieuwe offertes + relaties.
import XLSX from 'xlsx'
import { createSupabaseAdmin } from './db.mjs'

const DRY = process.argv.includes('--dry')
const sb = await createSupabaseAdmin()
const { data: admin } = await sb.from('administraties').select('id').ilike('naam', '%Rebu%').single()
const adminId = admin.id

const wb = XLSX.readFile('/Users/houterminiopslag/Downloads/Offertes.xlsx')
const tribe = XLSX.utils.sheet_to_json(wb.Sheets['Offertes'], { defval: null })

function excelDateToISO(n) {
  if (!n) return null
  if (typeof n === 'string') { const d = new Date(n); return isNaN(d) ? null : d.toISOString().slice(0, 10) }
  const d = new Date(new Date(Date.UTC(1899, 11, 30)).getTime() + Number(n) * 86400000)
  return d.toISOString().slice(0, 10)
}
function fase2status(f) {
  const m = (f || '').toLowerCase()
  if (m.includes('akkoord') || m.includes('definitief') || m.includes('getekend')) return 'geaccepteerd'
  if (m.includes('afgewezen') || m.includes('verloren')) return 'afgewezen'
  if (m.includes('verlopen')) return 'verlopen'
  if (m.includes('verstuurd') || m.includes('bekeken')) return 'verzonden'
  if (m.includes('concept')) return 'concept'
  return 'verzonden'
}

// CRM offertes: verzamel alle Tribe-nummers die AL in CRM staan
// We matchen op offertenummer of via onderwerp
const crmAll = []
let from = 0
while (true) {
  const { data } = await sb.from('offertes').select('id, offertenummer, onderwerp, relatie_id').eq('administratie_id', adminId).range(from, from + 999)
  if (!data || data.length === 0) break
  crmAll.push(...data); from += 1000
}

// Index CRM op alle herkenbare Tribe-nummers (uit offertenummer + uit onderwerp)
const aanwezig = new Set()
for (const o of crmAll) {
  const nums = new Set()
  // Uit offertenummer
  const m1 = String(o.offertenummer || '').match(/(\d{4})[^\d]*(\d{1,6})/)
  if (m1) nums.add(`${m1[1]}-${parseInt(m1[2])}`)
  // Uit onderwerp ("Nr. O-2025-0082")
  const m2s = [...(o.onderwerp || '').matchAll(/(?:Nr\.?\s*)?O?-?(\d{4})-?(\d{3,5})/gi)]
  for (const m of m2s) nums.add(`${m[1]}-${parseInt(m[2])}`)
  for (const n of nums) aanwezig.add(n)
}

// Relaties ophalen
const relaties = []
from = 0
while (true) {
  const { data } = await sb.from('relaties').select('id, bedrijfsnaam, email, telefoon, contactpersoon').eq('administratie_id', adminId).range(from, from + 999)
  if (!data || data.length === 0) break
  relaties.push(...data); from += 1000
}
const relByNaam = new Map()
for (const r of relaties) {
  if (r.bedrijfsnaam) relByNaam.set(r.bedrijfsnaam.toLowerCase().trim(), r)
}

let ingevoerd = 0, geskipt = 0, relsNieuw = 0, relsUpd = 0

for (const t of tribe) {
  if (!t.Nummer || !Number(t.Totaal) || Number(t.Totaal) <= 0) { geskipt++; continue }
  // Normalizeer Tribe nummer
  const nm = String(t.Nummer).match(/(\d{4})[^\d]*(\d{1,6})/)
  if (!nm) { geskipt++; continue }
  const tribeKey = `${nm[1]}-${parseInt(nm[2])}`
  if (aanwezig.has(tribeKey)) { geskipt++; continue }

  // Relatie opzoeken of aanmaken
  let relatieId = null
  const relNaam = t.Relatie_name ? String(t.Relatie_name).trim() : ''
  if (relNaam) {
    const bestaande = relByNaam.get(relNaam.toLowerCase())
    if (bestaande) {
      relatieId = bestaande.id
      // Eventueel email/telefoon aanvullen
      const upd = {}
      const email = t['E-mail_adres'] || t['Contactpersoon_E-mailadres']
      const tel = t.Contactpersoon_Telefoon
      const cp = t.Contactpersoon_Voornaam__achternaam
      if (email && !bestaande.email) upd.email = String(email).trim()
      if (tel && !bestaande.telefoon) upd.telefoon = String(tel).trim()
      if (cp && !bestaande.contactpersoon) upd.contactpersoon = String(cp).trim()
      if (Object.keys(upd).length > 0) {
        if (!DRY) await sb.from('relaties').update(upd).eq('id', relatieId)
        Object.assign(bestaande, upd)
        relsUpd++
      }
    } else {
      // Nieuwe relatie aanmaken
      const nieuw = {
        administratie_id: adminId,
        bedrijfsnaam: relNaam.slice(0, 200),
        type: 'zakelijk',
        email: t['E-mail_adres'] || t['Contactpersoon_E-mailadres'] || null,
        telefoon: t.Contactpersoon_Telefoon || null,
        contactpersoon: t.Contactpersoon_Voornaam__achternaam || null,
        standaard_marge: 40,
      }
      if (!DRY) {
        const { data: ins, error } = await sb.from('relaties').insert(nieuw).select('id').single()
        if (error) { console.error('Relatie insert fout:', error.message, relNaam); continue }
        relatieId = ins.id
        const rec = { ...nieuw, id: relatieId }
        relaties.push(rec)
        relByNaam.set(relNaam.toLowerCase(), rec)
      }
      relsNieuw++
    }
  }

  // Offerte insert
  const totaalIncl = Number(t.Totaal)
  const excl = Number(t['Totaal_excl._BTW']) || Math.round((totaalIncl / 1.21) * 100) / 100
  const btw = totaalIncl - excl
  const datum = excelDateToISO(t.Offertedatum) || new Date().toISOString().slice(0, 10)
  const geldig = excelDateToISO(t.Geldig_tot)
  const nieuweOfferte = {
    administratie_id: adminId,
    offertenummer: String(t.Nummer),
    onderwerp: t.Onderwerp ? String(t.Onderwerp).slice(0, 255) : null,
    datum,
    geldig_tot: geldig,
    status: fase2status(t.Fase_Naam_vertaald),
    versie_nummer: Number(t.Versie) || 1,
    subtotaal: Math.round(excl * 100) / 100,
    btw_totaal: Math.round(btw * 100) / 100,
    totaal: Math.round(totaalIncl * 100) / 100,
    relatie_id: relatieId,
  }
  if (!DRY) {
    const { data: ofIns, error } = await sb.from('offertes').insert(nieuweOfferte).select('id').single()
    if (error) { console.error('Offerte insert fout:', error.message, t.Nummer); continue }
    // Regel
    await sb.from('offerte_regels').insert({
      offerte_id: ofIns.id,
      omschrijving: t.Onderwerp || 'Kunststof kozijnen leveren',
      aantal: 1, prijs: nieuweOfferte.subtotaal, btw_percentage: 21, totaal: nieuweOfferte.subtotaal, volgorde: 0,
    })
  }
  aanwezig.add(tribeKey)
  ingevoerd++
  if (ingevoerd % 200 === 0) console.log(`  voortgang: ${ingevoerd} nieuwe offertes`)
}

console.log(`\n${DRY ? '[DRY] ' : ''}Tribe rijen: ${tribe.length}`)
console.log(`Nieuwe offertes: ${ingevoerd}`)
console.log(`Geskipt (al aanwezig of geen prijs): ${geskipt}`)
console.log(`Nieuwe relaties: ${relsNieuw}, bestaande aangevuld: ${relsUpd}`)
