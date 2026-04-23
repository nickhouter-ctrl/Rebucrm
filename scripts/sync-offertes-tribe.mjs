import XLSX from 'xlsx'
import { createSupabaseAdmin } from './db.mjs'

const DRY = process.argv.includes('--dry')
const sb = await createSupabaseAdmin()
const { data: admin } = await sb.from('administraties').select('id').ilike('naam', '%Rebu%').single()
const adminId = admin.id

const wb = XLSX.readFile('/Users/houterminiopslag/Downloads/Offertes.xlsx')
const rows = XLSX.utils.sheet_to_json(wb.Sheets['Offertes'], { defval: null })

// Excel datum (serienummer) → JS Date
function excelDateToISO(n) {
  if (!n) return null
  if (typeof n === 'string') {
    const d = new Date(n)
    if (!isNaN(d)) return d.toISOString().slice(0, 10)
    return null
  }
  const epoch = new Date(Date.UTC(1899, 11, 30))
  const d = new Date(epoch.getTime() + Number(n) * 86400000)
  return d.toISOString().slice(0, 10)
}

function normWithYear(s, fallbackYear) {
  if (!s) return ''
  const str = String(s).trim()
  const m = str.match(/(\d{4})[^\d]*(\d{1,6})/)
  if (m) return `${m[1]}-${parseInt(m[2], 10)}`
  const lastNum = str.match(/(\d+)(?!.*\d)/)
  if (!lastNum) return ''
  return fallbackYear ? `${fallbackYear}-${parseInt(lastNum[1], 10)}` : `x-${parseInt(lastNum[1], 10)}`
}
function norm(s) { return normWithYear(s, null) }

// CRM offertes ophalen
const crm = []
let from = 0
while (true) {
  const { data } = await sb.from('offertes')
    .select('id, offertenummer, subtotaal, totaal, btw_totaal, datum, status, versie_nummer, relatie_id, onderwerp, geldig_tot')
    .eq('administratie_id', adminId).range(from, from + 999)
  if (!data || data.length === 0) break
  crm.push(...data); from += 1000
}
const crmMap = new Map()
for (const c of crm) {
  const fallbackYear = c.datum ? String(c.datum).slice(0, 4) : null
  const k = normWithYear(c.offertenummer, fallbackYear)
  if (!k) continue
  if (!crmMap.has(k)) crmMap.set(k, [])
  crmMap.get(k).push(c)
  const ln = (String(c.offertenummer || '').match(/(\d+)(?!.*\d)/) || [null, null])[1]
  if (ln) {
    const noYear = `x-${parseInt(ln, 10)}`
    if (noYear !== k) {
      if (!crmMap.has(noYear)) crmMap.set(noYear, [])
      crmMap.get(noYear).push(c)
    }
  }
}

// Relaties ophalen (voor email/telefoon aanvulling)
const relaties = []
from = 0
while (true) {
  const { data } = await sb.from('relaties').select('id, bedrijfsnaam, email, telefoon, contactpersoon').eq('administratie_id', adminId).range(from, from + 999)
  if (!data || data.length === 0) break
  relaties.push(...data); from += 1000
}

// Tribe fase → CRM status
function tribeFaseNaarStatus(fase) {
  const m = (fase || '').toLowerCase()
  if (m.includes('akkoord') || m.includes('geaccepteerd') || m.includes('getekend')) return 'geaccepteerd'
  if (m.includes('afgewezen') || m.includes('verloren')) return 'afgewezen'
  if (m.includes('verlopen') || m.includes('vervallen')) return 'verlopen'
  if (m.includes('concept')) return 'concept'
  if (m.includes('verstuurd') || m.includes('bekeken')) return 'verzonden'
  return null
}

let updates = 0
let relatieUpdates = 0
const multiMatchSkip = []

for (const r of rows) {
  if (!r.Nummer || !Number(r.Totaal)) continue
  const k = norm(r.Nummer)
  const matches = crmMap.get(k) || []
  if (matches.length === 0) continue
  // Bij meerdere versies: kies de VERSIE die matcht (r.Versie) of hoogste
  let target = null
  const tribeVersie = Number(r.Versie) || 1
  target = matches.find(c => (c.versie_nummer || 1) === tribeVersie) || matches.sort((a, b) => (b.versie_nummer || 0) - (a.versie_nummer || 0))[0]
  if (!target) continue

  const totaalIncl = Number(r.Totaal)
  const excl = Number(r['Totaal_excl._BTW']) || Math.round((totaalIncl / 1.21) * 100) / 100
  const btw = totaalIncl - excl

  const upd = {}
  // Aanvullen als leeg / 0
  if (!target.totaal || Number(target.totaal) === 0) upd.totaal = Math.round(totaalIncl * 100) / 100
  if (!target.subtotaal || Number(target.subtotaal) === 0) upd.subtotaal = Math.round(excl * 100) / 100
  if (!target.btw_totaal || Number(target.btw_totaal) === 0) upd.btw_totaal = Math.round(btw * 100) / 100
  const datum = excelDateToISO(r.Offertedatum)
  if (datum && !target.datum) upd.datum = datum
  const geldig = excelDateToISO(r.Geldig_tot)
  if (geldig && !target.geldig_tot) upd.geldig_tot = geldig
  // Status: altijd overnemen uit Tribe als die een duidelijke fase heeft
  const newStatus = tribeFaseNaarStatus(r.Fase_Naam_vertaald)
  if (newStatus && newStatus !== target.status) upd.status = newStatus
  // Onderwerp
  if (r.Onderwerp && !target.onderwerp) upd.onderwerp = String(r.Onderwerp).slice(0, 255)

  if (Object.keys(upd).length > 0) {
    if (!DRY) await sb.from('offertes').update(upd).eq('id', target.id)
    updates++
    // Check of er 1 regel is; zo niet voeg er 1 toe
    if (upd.totaal && !DRY) {
      const { data: regels } = await sb.from('offerte_regels').select('id').eq('offerte_id', target.id).limit(1)
      if (!regels || regels.length === 0) {
        const regelExcl = Math.round(excl * 100) / 100
        await sb.from('offerte_regels').insert({
          offerte_id: target.id,
          omschrijving: r.Onderwerp || 'Kunststof kozijnen leveren',
          aantal: 1,
          prijs: regelExcl,
          btw_percentage: 21,
          totaal: regelExcl,
          volgorde: 0,
        })
      }
    }
  }

  // Relatie email/telefoon aanvullen
  if (target.relatie_id) {
    const rel = relaties.find(x => x.id === target.relatie_id)
    if (rel) {
      const rUpd = {}
      if (!rel.email && r['E-mail_adres']) rUpd.email = r['E-mail_adres']
      if (!rel.telefoon && r.Telefoonnummer) rUpd.telefoon = r.Telefoonnummer
      if (!rel.contactpersoon && r.Contactpersoon_Voornaam__achternaam) rUpd.contactpersoon = r.Contactpersoon_Voornaam__achternaam
      if (Object.keys(rUpd).length > 0) {
        if (!DRY) await sb.from('relaties').update(rUpd).eq('id', rel.id)
        Object.assign(rel, rUpd)  // update local cache
        relatieUpdates++
      }
    }
  }

  if (updates % 200 === 0 && updates > 0) console.log(`  voortgang: ${updates} offertes, ${relatieUpdates} relaties`)
}

console.log(`\n${DRY ? '[DRY RUN] Zou ' : ''}Offertes bijgewerkt: ${updates}`)
console.log(`${DRY ? '[DRY RUN] Zou ' : ''}Relaties aangevuld: ${relatieUpdates}`)
