import fs from 'fs'
import { createSupabaseAdmin } from './db.mjs'

const DRY = process.argv.includes('--dry')
const sb = await createSupabaseAdmin()
const { data: admin } = await sb.from('administraties').select('id').ilike('naam', '%Rebu%').single()
const adminId = admin.id

const txt = fs.readFileSync('/Users/houterminiopslag/Downloads/Facturen.csv', 'utf-8')
function parseCSV(t) {
  const rows = []; let row=[], f='', q=false
  for (let i=0;i<t.length;i++) {
    const c = t[i]
    if (c==='"') { if(q&&t[i+1]==='"'){f+='"';i++} else q=!q }
    else if (c===';' && !q){ row.push(f); f='' }
    else if ((c==='\n'||c==='\r') && !q){ if(f!==''||row.length>0){row.push(f);rows.push(row);row=[];f=''} if(c==='\r'&&t[i+1]==='\n')i++ }
    else f+=c
  }
  if (f!==''||row.length>0){row.push(f);rows.push(row)}
  return rows
}
const rows = parseCSV(txt)
const headers = rows[0].map(h => h.replace(/^﻿/, ''))
const data = rows.slice(1).filter(r => r.length === headers.length)
const ci = k => headers.indexOf(k)

function parseDate(s) {
  if (!s) return null
  const m = s.match(/^(\d{2})-(\d{2})-(\d{4})/)
  if (!m) return null
  return `${m[3]}-${m[2]}-${m[1]}`
}
function parseNum(s) {
  if (!s) return 0
  return parseFloat(s.replace(/\./g, '').replace(',', '.')) || 0
}
function norm(s) { return (s || '').toLowerCase().replace(/[^a-z0-9 ]/g, '').replace(/\s+/g, ' ').trim() }

// Cache relaties
const relaties = []
let fromR = 0
while (true) {
  const { data: batch } = await sb.from('relaties').select('id, bedrijfsnaam').eq('administratie_id', adminId).range(fromR, fromR+999)
  if (!batch?.length) break
  relaties.push(...batch); fromR += 1000
}
const relByNaam = new Map(relaties.map(r => [norm(r.bedrijfsnaam), r]))

// Status + type mapping
function mapStatus(fase) {
  const f = (fase || '').toLowerCase()
  if (f === 'betaald' || f === 'paid') return 'betaald'
  if (f === 'verstuurd' || f === 'sent') return 'verzonden'
  if (f === 'gecrediteerd' || f === 'credited') return 'gecrediteerd'
  return 'concept'
}
function mapType(soort, pct) {
  const s = (soort || '').toLowerCase()
  if (s.includes('credit')) return 'credit'
  if (s === '1e factuur') return 'aanbetaling'
  if (s === '2e factuur') return 'aanbetaling'
  if (s === '3e factuur') return 'restbetaling'
  if (pct === '100%') return 'volledig'
  return 'volledig'
}

let matched = 0, geimporteerd = 0, bijgewerkt = 0, zonderRelatie = 0
const zonderRelatieLog = []
const factuurByNummer = new Map()

// Cache bestaande CRM facturen
const crmFact = []
let fromF = 0
while (true) {
  const { data: batch } = await sb.from('facturen').select('id, factuurnummer, status, relatie_id, factuur_type').eq('administratie_id', adminId).range(fromF, fromF+999)
  if (!batch?.length) break
  crmFact.push(...batch); fromF += 1000
}
const crmByNr = new Map(crmFact.map(f => [f.factuurnummer, f]))

for (const r of data) {
  const nummer = r[ci('Nummer')]?.trim()
  if (!nummer) continue
  const relNaam = (r[ci('Relatie_name')] || '').trim()
  const onderwerp = r[ci('Onderwerp')] || null
  const datum = parseDate(r[ci('Factuurdatum')])
  const vervaldatum = parseDate(r[ci('Vervaldatum')])
  const subtotaal = parseNum(r[ci('Totaal_excl._BTW')])
  const btwTotaal = parseNum(r[ci('BTW_bedrag')])
  const totaal = subtotaal + btwTotaal
  const fase = r[ci('Fase_Naam_vertaald')]
  const soort = r[ci('Factuursoort_Naam_vertaald')]
  const pct = r[ci('Factuurpercentage')]
  const status = mapStatus(fase)
  const type = mapType(soort, pct)

  const relatie = relByNaam.get(norm(relNaam))
  if (!relatie) {
    zonderRelatie++
    if (zonderRelatieLog.length < 20) zonderRelatieLog.push(`${nummer} → "${relNaam}"`)
    continue
  }

  factuurByNummer.set(nummer, { nummer, status, relatie, subtotaal })

  const existing = crmByNr.get(nummer)
  if (existing) {
    matched++
    // Update status + type + relatie_id als ze afwijken
    const upd = {}
    if (existing.status !== status) upd.status = status
    if (existing.factuur_type !== type) upd.factuur_type = type
    if (existing.relatie_id !== relatie.id) upd.relatie_id = relatie.id
    if (Object.keys(upd).length > 0) {
      if (!DRY) await sb.from('facturen').update(upd).eq('id', existing.id)
      bijgewerkt++
    }
  } else {
    geimporteerd++
    if (!DRY) {
      await sb.from('facturen').insert({
        administratie_id: adminId,
        factuurnummer: nummer,
        datum,
        vervaldatum,
        status,
        factuur_type: type,
        relatie_id: relatie.id,
        onderwerp,
        subtotaal,
        btw_totaal: btwTotaal,
        totaal,
        betaald_bedrag: status === 'betaald' ? totaal : 0,
      })
    }
  }
}

console.log(`\nMatched (bestaand): ${matched}`)
console.log(`Bijgewerkt: ${bijgewerkt}`)
console.log(`Geïmporteerd (nieuw): ${geimporteerd}`)
console.log(`Zonder relatie-match (overgeslagen): ${zonderRelatie}`)
if (zonderRelatieLog.length) {
  console.log('\nVoorbeelden zonder relatie:')
  for (const l of zonderRelatieLog) console.log(' ', l)
}

// ===== EINDAFREKENING RAPPORT =====
// Groepeer per relatie: wie heeft 1e/2e factuur maar geen 3e?
const perRel = new Map()
for (const r of data) {
  if (!r[ci('Nummer')]) continue
  const rel = (r[ci('Relatie_name')] || '').trim()
  if (!perRel.has(rel)) perRel.set(rel, [])
  perRel.get(rel).push({
    nummer: r[ci('Nummer')],
    soort: r[ci('Factuursoort_Naam_vertaald')],
    pct: r[ci('Factuurpercentage')],
    fase: r[ci('Fase_Naam_vertaald')],
    datum: r[ci('Factuurdatum')],
    subtotaal: parseNum(r[ci('Totaal_excl._BTW')]),
    onderwerp: r[ci('Onderwerp')] || '',
  })
}

const mistEind = []
for (const [rel, facts] of perRel) {
  const aanbets = facts.filter(f => f.soort === '1e Factuur' || f.soort === '2e Factuur')
  const rests = facts.filter(f => f.soort === '3e Factuur')
  if (aanbets.length > 0 && rests.length < aanbets.length) {
    // Vind aanbetalingen die nog geen restbetaling hebben gehad
    for (const a of aanbets) {
      // Geen match op Referentie/datum → mist eindafrekening
      mistEind.push({ rel, aanbet: a })
    }
  }
}

console.log(`\n===== EINDAFREKENING NODIG =====`)
console.log(`Aantal openstaande eindafrekeningen: ${mistEind.length}`)
console.log(`\nLijst (relatie | aanbet-nr | datum | % | bedrag excl):`)
for (const m of mistEind) {
  console.log(`  ${m.rel} | ${m.aanbet.nummer} | ${m.aanbet.datum} | ${m.aanbet.pct} | €${m.aanbet.subtotaal.toFixed(2)} | ${m.aanbet.fase}`)
}
