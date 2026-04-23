// Agressieve sync: match NIET alleen op nummer maar ook op relatie+onderwerp+datum
// Vult prijzen in voor offertes die nog op totaal=0 staan.
import XLSX from 'xlsx'
import { createSupabaseAdmin } from './db.mjs'

const DRY = process.argv.includes('--dry')
const sb = await createSupabaseAdmin()
const { data: admin } = await sb.from('administraties').select('id').ilike('naam', '%Rebu%').single()
const adminId = admin.id

const wb = XLSX.readFile('/Users/houterminiopslag/Downloads/Offertes.xlsx')
const tribe = XLSX.utils.sheet_to_json(wb.Sheets['Offertes'], { defval: null })
  .filter(r => r.Nummer && Number(r.Totaal) > 0)
console.log(`Tribe rijen met prijs: ${tribe.length}`)

function excelDateToISO(n) {
  if (!n) return null
  if (typeof n === 'string') { const d = new Date(n); return isNaN(d) ? null : d.toISOString().slice(0, 10) }
  const d = new Date(new Date(Date.UTC(1899, 11, 30)).getTime() + Number(n) * 86400000)
  return d.toISOString().slice(0, 10)
}
function fase2status(f) {
  const m = (f || '').toLowerCase()
  if (m.includes('akkoord') || m.includes('geaccepteerd') || m.includes('getekend')) return 'geaccepteerd'
  if (m.includes('afgewezen') || m.includes('verloren')) return 'afgewezen'
  if (m.includes('verlopen') || m.includes('vervallen')) return 'verlopen'
  if (m.includes('verstuurd') || m.includes('bekeken')) return 'verzonden'
  return null
}
function cleanNaam(s) {
  return (s || '').toLowerCase()
    .replace(/^(re|fw|fwd|aw)\s*:\s*/gi, '').replace(/^(re|fw|fwd|aw)\s*:\s*/gi, '')
    .replace(/offerte\s+met\s+nr\.?\s*[a-z0-9-]+\s*,?\s*/gi, '')
    .replace(/\s+van\s+rebu\s+kozijnen\b/gi, '')
    .replace(/^(offerte|aanvraag|aanvraag\s+offerte)\s+/gi, '')
    .replace(/[^a-z0-9]+/g, ' ').trim()
}

// CRM offertes zonder prijs
const crm = []
let from = 0
while (true) {
  const { data } = await sb.from('offertes')
    .select('id, offertenummer, subtotaal, totaal, btw_totaal, datum, status, versie_nummer, relatie_id, onderwerp, geldig_tot, created_at')
    .eq('administratie_id', adminId).or('totaal.is.null,totaal.eq.0').range(from, from + 999)
  if (!data || data.length === 0) break
  crm.push(...data); from += 1000
}
console.log(`CRM offertes zonder prijs: ${crm.length}`)

// Relaties index
const relaties = []
from = 0
while (true) {
  const { data } = await sb.from('relaties').select('id, bedrijfsnaam, contactpersoon, email, telefoon').eq('administratie_id', adminId).range(from, from + 999)
  if (!data || data.length === 0) break
  relaties.push(...data); from += 1000
}
const relByNaam = new Map()
for (const r of relaties) {
  const k = (r.bedrijfsnaam || '').toLowerCase().trim()
  if (!k) continue
  if (!relByNaam.has(k)) relByNaam.set(k, r)
}

// Tribe matching: voor elke CRM offerte zonder prijs, zoek Tribe match op RELATIE + ONDERWERP
let updates = 0, notFound = 0
const used = new Set()  // Tribe-rijen die al gebruikt zijn

for (const o of crm) {
  const oRelatieNaam = relaties.find(r => r.id === o.relatie_id)?.bedrijfsnaam?.toLowerCase().trim() || ''
  const oOnderwerp = cleanNaam(o.onderwerp)

  // Probeer match: 1) exact onderwerp + relatie, 2) onderwerp substring, 3) alleen relatie + dichtste datum
  let match = null
  const kandidaten = tribe.filter((t, i) => !used.has(i))
  for (let i = 0; i < tribe.length; i++) {
    if (used.has(i)) continue
    const t = tribe[i]
    const tRelatie = (t.Relatie_name || '').toLowerCase().trim()
    const tOnderwerp = cleanNaam(t.Onderwerp || '')
    // Heuristiek: relatie-match EN (onderwerp-match OR contains)
    const relatieMatch = oRelatieNaam && tRelatie && (tRelatie.includes(oRelatieNaam) || oRelatieNaam.includes(tRelatie))
    const onderwerpMatch = oOnderwerp && tOnderwerp && (tOnderwerp === oOnderwerp || tOnderwerp.includes(oOnderwerp) || oOnderwerp.includes(tOnderwerp))
    if (relatieMatch && onderwerpMatch && oOnderwerp.length > 4) {
      match = { row: t, idx: i }
      break
    }
  }
  if (!match) { notFound++; continue }
  used.add(match.idx)
  const r = match.row

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
    // Regel toevoegen als nog geen
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

console.log(`\n${DRY ? '[DRY] ' : ''}Extra offertes bijgewerkt: ${updates}`)
console.log(`Niet gevonden in Tribe: ${notFound}`)
