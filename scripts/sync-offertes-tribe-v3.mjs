// V3: match op Tribe-nummer EXTRACT uit CRM onderwerp ("Re: Offerte met Nr. O-2025-0082,...")
// Plus: relaties krijgen Contactpersoon_Telefoon + E-mail_adres uit Tribe.
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
  if (m.includes('verlopen') || m.includes('vervallen')) return 'verlopen'
  if (m.includes('verstuurd') || m.includes('bekeken')) return 'verzonden'
  return null
}

// Tribe index op Nummer (zoals "O-2025-0082", "2024-419" etc)
const tribeByNr = new Map()
for (const r of tribe) {
  if (!r.Nummer) continue
  const key = String(r.Nummer).toUpperCase().replace(/\s+/g, '')
  tribeByNr.set(key, r)
  // Ook zonder O- prefix voor flexibel matchen
  const stripped = key.replace(/^O-/, '')
  if (stripped !== key) tribeByNr.set(stripped, r)
}

// CRM offertes zonder prijs
const crm = []
let from = 0
while (true) {
  const { data } = await sb.from('offertes')
    .select('id, offertenummer, subtotaal, totaal, btw_totaal, datum, status, versie_nummer, relatie_id, onderwerp, geldig_tot')
    .eq('administratie_id', adminId).or('totaal.is.null,totaal.eq.0').range(from, from + 999)
  if (!data || data.length === 0) break
  crm.push(...data); from += 1000
}

// Voor elke CRM offerte: probeer Tribe-nummer uit ONDERWERP te extracten
// Patroon: "Nr. O-2025-0082" / "O-2025-0082" / "2024-00129"
let updates = 0
for (const o of crm) {
  const onderwerp = o.onderwerp || ''
  const matches = [...onderwerp.matchAll(/(?:Nr\.?\s*)?(O-\d{4}-\d{3,4}|\d{4}-\d{3,5})/gi)].map(m => m[1].toUpperCase())
  let tribeRow = null
  for (const m of matches) {
    if (tribeByNr.has(m)) { tribeRow = tribeByNr.get(m); break }
    const stripped = m.replace(/^O-/, '')
    if (tribeByNr.has(stripped)) { tribeRow = tribeByNr.get(stripped); break }
  }
  if (!tribeRow || !Number(tribeRow.Totaal)) continue
  const r = tribeRow

  const totaalIncl = Number(r.Totaal)
  const excl = Number(r['Totaal_excl._BTW']) || Math.round((totaalIncl / 1.21) * 100) / 100
  const btw = totaalIncl - excl
  const upd = {
    totaal: Math.round(totaalIncl * 100) / 100,
    subtotaal: Math.round(excl * 100) / 100,
    btw_totaal: Math.round(btw * 100) / 100,
  }
  const datum = excelDateToISO(r.Offertedatum); if (datum && !o.datum) upd.datum = datum
  const geldig = excelDateToISO(r.Geldig_tot); if (geldig && !o.geldig_tot) upd.geldig_tot = geldig
  const st = fase2status(r.Fase_Naam_vertaald); if (st && st !== o.status) upd.status = st

  if (!DRY) {
    await sb.from('offertes').update(upd).eq('id', o.id)
    const { data: reg } = await sb.from('offerte_regels').select('id').eq('offerte_id', o.id).limit(1)
    if (!reg || reg.length === 0) {
      await sb.from('offerte_regels').insert({
        offerte_id: o.id,
        omschrijving: r.Onderwerp || o.onderwerp || 'Kunststof kozijnen leveren',
        aantal: 1, prijs: upd.subtotaal, btw_percentage: 21, totaal: upd.subtotaal, volgorde: 0,
      })
    }
  }
  updates++
  if (updates % 200 === 0) console.log(`  voortgang: ${updates}`)
}
console.log(`\n${DRY ? '[DRY] ' : ''}Offertes via onderwerp-nummer bijgewerkt: ${updates}`)

// === Relaties aanvullen ===
const relaties = []
from = 0
while (true) {
  const { data } = await sb.from('relaties').select('id, bedrijfsnaam, email, telefoon, contactpersoon, factuur_email').eq('administratie_id', adminId).range(from, from + 999)
  if (!data || data.length === 0) break
  relaties.push(...data); from += 1000
}
const relByNaam = new Map()
for (const r of relaties) {
  if (r.bedrijfsnaam) relByNaam.set(r.bedrijfsnaam.toLowerCase().trim(), r)
}

let relUpd = 0
for (const t of tribe) {
  const naam = (t.Relatie_name || '').toLowerCase().trim()
  if (!naam) continue
  const r = relByNaam.get(naam)
  if (!r) continue
  const upd = {}
  const email = t['E-mail_adres'] || t['Contactpersoon_E-mailadres']
  const tel = t.Contactpersoon_Telefoon
  const cp = t.Contactpersoon_Voornaam__achternaam
  if (email && !r.email) upd.email = String(email).trim()
  if (tel && !r.telefoon) upd.telefoon = String(tel).trim()
  if (cp && !r.contactpersoon) upd.contactpersoon = String(cp).trim()
  if (Object.keys(upd).length > 0 && !DRY) {
    await sb.from('relaties').update(upd).eq('id', r.id)
    Object.assign(r, upd)
    relUpd++
  } else if (Object.keys(upd).length > 0) relUpd++
}
console.log(`${DRY ? '[DRY] ' : ''}Relaties aangevuld met email/telefoon/contactpersoon: ${relUpd}`)
