import { createSupabaseAdmin } from './db.mjs'
import { readFileSync } from 'fs'

const supa = await createSupabaseAdmin()
const adminId = 'e69b63b6-1027-4b35-95d7-0df18f697071'

function parseCsv(content) {
  content = content.replace(/^﻿/, '')
  const lines = content.split('\n')
  const headers = splitLine(lines[0]).map(cleanField)
  const rows = []
  let buf = ''
  for (let i = 1; i < lines.length; i++) {
    buf = buf ? buf + '\n' + lines[i] : lines[i]
    if (!buf.trim()) continue
    const parts = splitLine(buf)
    if (parts.length >= headers.length) {
      const obj = {}
      headers.forEach((h, j) => { obj[h] = cleanField(parts[j] || '') })
      rows.push(obj)
      buf = ''
    }
  }
  return rows
}
function splitLine(line) {
  const out = []
  let cur = ''
  let q = false
  for (const ch of line) {
    if (ch === '"') { q = !q; cur += ch; continue }
    if (ch === ';' && !q) { out.push(cur); cur = ''; continue }
    cur += ch
  }
  out.push(cur)
  return out
}
function cleanField(s) {
  return s.replace(/^"|"$/g, '').replace(/""/g, '"').trim()
}

function parseDateTime(s) {
  // "21-04-2026 20:00" of "21-04-2026"
  if (!s) return { date: null, time: null }
  const m = s.match(/^(\d{2})-(\d{2})-(\d{4})(?:\s+(\d{1,2}):(\d{2}))?$/)
  if (!m) return { date: null, time: null }
  const date = `${m[3]}-${m[2]}-${m[1]}` // YYYY-MM-DD
  const time = m[4] ? `${m[4].padStart(2, '0')}:${m[5]}:00` : null
  return { date, time }
}

const csv = parseCsv(readFileSync('/Users/houterminiopslag/Downloads/8205995b-fb73-4927-b63e-be0d90407270/Taken.csv', 'utf-8'))
console.log('Regels in Taken.csv:', csv.length)

// Filter alleen Jordy taken (CSV is al Jordy-only maar dubbelcheck)
const jordyTaken = csv.filter(t => /jordy/i.test(t['Toegewezen_aan_Voornaam__achternaam'] || ''))
console.log('Jordy taken in CSV:', jordyTaken.length)

let updated = 0, skipped = 0, notFound = 0
for (const t of jordyTaken) {
  const nummer = t['Nummer']
  if (!nummer) { skipped++; continue }
  const { date: deadline, time: deadline_tijd } = parseDateTime(t['Startdatum'])
  const titel = t['Onderwerp'] || null
  const type = t['Type_Naam_vertaald'] || null
  const fase = t['Fase_Naam_vertaald'] || null

  // Status op basis van Fase
  // "Gepland"/"Opvolgen" → open; "Afgerond"/"Afgesloten" → afgerond
  const status = /afgerond|afgesloten|voltooid/i.test(fase) ? 'afgerond' : 'open'

  // Sommige taken hebben alleen onderwerp "ophelderen" — voeg type als prefix bij titel als die ontbreekt in titel
  const finaleTitel = titel && type && !titel.toLowerCase().includes(type.toLowerCase())
    ? titel  // type staat al impliciet in categorie; niet wijzigen
    : titel

  const update = {
    ...(finaleTitel ? { titel: finaleTitel } : {}),
    ...(deadline ? { deadline } : {}),
    ...(deadline_tijd ? { deadline_tijd } : {}),
    status,
  }

  if (Object.keys(update).length === 0) { skipped++; continue }

  const { data, error } = await supa.from('taken').update(update).eq('taaknummer', nummer).eq('administratie_id', adminId).select('id')
  if (error) { console.error('Err', nummer, error.message); skipped++ }
  else if (!data || data.length === 0) { notFound++ }
  else { updated++ }
}

console.log(`\n✓ Updated: ${updated} | niet gevonden: ${notFound} | skipped: ${skipped}`)

// Map Tribe UUID → taaknummer voor notitie-koppeling
const uuidNaarNummer = new Map()
for (const t of jordyTaken) {
  if (t.uuid && t.Nummer) uuidNaarNummer.set(t.uuid, t.Nummer)
}

// Jordy profielId voor notities
const jordyId = 'd06a844a-d26a-4951-92d1-6424cb79b52d'

// Haal alle bestaande taaknummer → id mapping
const { data: bestaand } = await supa.from('taken').select('id, taaknummer').eq('administratie_id', adminId)
const nummerNaarId = new Map((bestaand || []).map(t => [t.taaknummer, t.id]))

// Huidige notities ophalen om duplicaten te voorkomen (per taak_id + tekst)
const { data: bestaandeNot } = await supa.from('taak_notities').select('taak_id, tekst, created_at')
const bestaandeKey = new Set((bestaandeNot || []).map(n => `${n.taak_id}::${(n.tekst || '').slice(0, 100)}`))

const notCsv = parseCsv(readFileSync('/Users/houterminiopslag/Downloads/8205995b-fb73-4927-b63e-be0d90407270/Taken_Notities.csv', 'utf-8'))
console.log('\nNotitie-regels:', notCsv.length)

function stripHtml(html) {
  return (html || '').replace(/<[^>]*>/g, '').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/\s+/g, ' ').trim()
}

function parseCreatiedatum(s) {
  // "18-03-2026 14:53"
  if (!s) return null
  const m = s.match(/^(\d{2})-(\d{2})-(\d{4})(?:\s+(\d{1,2}):(\d{2}))?$/)
  if (!m) return null
  const hh = m[4] ? m[4].padStart(2, '0') : '00'
  const mm = m[5] || '00'
  return `${m[3]}-${m[2]}-${m[1]}T${hh}:${mm}:00+00:00`
}

let notAangemaakt = 0, notOvergeslagen = 0, notGeenTaak = 0
const insertBatch = []
for (const n of notCsv) {
  const parentUuid = n.parent
  const tekst = stripHtml(n.Notities_Inhoud)
  if (!tekst) { notOvergeslagen++; continue }
  const taakNummer = uuidNaarNummer.get(parentUuid)
  if (!taakNummer) { notGeenTaak++; continue }
  const taakId = nummerNaarId.get(taakNummer)
  if (!taakId) { notGeenTaak++; continue }

  const key = `${taakId}::${tekst.slice(0, 100)}`
  if (bestaandeKey.has(key)) { notOvergeslagen++; continue }
  bestaandeKey.add(key)

  const created_at = parseCreatiedatum(n.Notities_Creatiedatum) || new Date().toISOString()
  insertBatch.push({
    administratie_id: adminId,
    taak_id: taakId,
    gebruiker_id: jordyId,
    tekst,
    created_at,
  })
}

console.log(`Notities te inserten: ${insertBatch.length} | bestaat/leeg: ${notOvergeslagen} | geen taak: ${notGeenTaak}`)

// Batch insert
for (let i = 0; i < insertBatch.length; i += 100) {
  const batch = insertBatch.slice(i, i + 100)
  const { error } = await supa.from('taak_notities').insert(batch)
  if (error) console.error('Insert batch error:', error.message)
  else notAangemaakt += batch.length
}
console.log(`✓ Notities aangemaakt: ${notAangemaakt}`)
