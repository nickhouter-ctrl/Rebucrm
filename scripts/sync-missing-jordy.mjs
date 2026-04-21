import { createSupabaseAdmin } from './db.mjs'
import { readFileSync } from 'fs'

function splitLine(line) {
  const out = []; let cur = ''; let q = false
  for (const ch of line) {
    if (ch === '"') { q = !q; cur += ch; continue }
    if (ch === ';' && !q) { out.push(cur); cur = ''; continue }
    cur += ch
  }
  out.push(cur); return out
}
function clean(s){ return s.replace(/^"|"$/g,'').replace(/""/g,'"').trim() }

function parseCsv(path) {
  const content = readFileSync(path,'utf-8').replace(/^﻿/,'')
  const lines = content.split('\n')
  const headers = splitLine(lines[0]).map(clean)
  const rows = []
  let buf = ''
  for (let i = 1; i < lines.length; i++) {
    buf = buf ? buf + '\n' + lines[i] : lines[i]
    if (!buf.trim()) continue
    const parts = splitLine(buf)
    if (parts.length >= headers.length) {
      const obj = {}; headers.forEach((h,j)=>{ obj[h] = clean(parts[j]||'') })
      rows.push(obj); buf = ''
    }
  }
  return rows
}
function parseDT(s){
  if (!s) return { date: null, time: null }
  const m = s.match(/^(\d{2})-(\d{2})-(\d{4})(?:\s+(\d{1,2}):(\d{2}))?$/)
  if (!m) return { date:null, time:null }
  return { date: `${m[3]}-${m[2]}-${m[1]}`, time: m[4] ? `${m[4].padStart(2,'0')}:${m[5]}:00` : null }
}

const supa = await createSupabaseAdmin()
const adminId = 'e69b63b6-1027-4b35-95d7-0df18f697071'
const jordyId = 'd06a844a-d26a-4951-92d1-6424cb79b52d'

// Lees oude full CSVs
const oud = [
  ...parseCsv('/Users/houterminiopslag/Downloads/Taken.csv'),
  ...parseCsv('/Users/houterminiopslag/Downloads/Taken 2.csv'),
]

// Lijst 395 Jordy nummers uit Taken 4.csv
const jordyNummers = readFileSync('/Users/houterminiopslag/Downloads/Taken 4.csv','utf-8').replace(/^﻿/,'').split('\n').slice(1).map(l => {
  const first = l.split(';')[0]
  return first.replace(/^"|"$/g,'').trim()
}).filter(Boolean)
console.log('Jordy CSV totaal:', jordyNummers.length)

// Lijst nieuwe 356 die al gesynced zijn
const nieuweNummers = new Set(parseCsv('/Users/houterminiopslag/Downloads/8205995b-fb73-4927-b63e-be0d90407270/Taken.csv').map(t => t.Nummer).filter(Boolean))

const missing = jordyNummers.filter(n => !nieuweNummers.has(n))
console.log('Missing (niet in nieuwe export):', missing.length)

// Match met oud
const oudMap = new Map(oud.map(t => [t.Nummer, t]))
let updated = 0, geenData = []
for (const n of missing) {
  const t = oudMap.get(n)
  if (!t) { geenData.push(n); continue }
  const { date: deadline, time: deadline_tijd } = parseDT(t.Startdatum)
  const titel = t.Onderwerp || null
  const fase = t.Fase_Naam_vertaald || ''
  const status = /afgerond|afgesloten|voltooid/i.test(fase) ? 'afgerond' : 'open'
  const upd = { toegewezen_aan: jordyId, status, ...(titel ? { titel } : {}), ...(deadline ? { deadline } : {}), ...(deadline_tijd ? { deadline_tijd } : {}) }
  const { data } = await supa.from('taken').update(upd).eq('taaknummer', n).eq('administratie_id', adminId).select('id')
  if (data && data.length) updated++
}
console.log(`Bijgewerkt vanuit oud-full: ${updated}`)
console.log(`Geen data voor (alleen nummer bekend): ${geenData.length}`)

// Voor de nummers zonder data: zeker weten dat ze aan Jordy hangen en status=open
let ensured = 0
for (const n of geenData) {
  const { data } = await supa.from('taken').update({ toegewezen_aan: jordyId, status: 'open' }).eq('taaknummer', n).eq('administratie_id', adminId).select('id')
  if (data && data.length) ensured++
}
console.log(`Nummers zonder data bevestigd aan Jordy (status=open): ${ensured}`)

// Final telling
const { count: jordyOpen } = await supa.from('taken').select('id', { count:'exact', head:true }).eq('administratie_id', adminId).eq('toegewezen_aan', jordyId).neq('status','afgerond')
console.log(`\nTotaal open taken Jordy: ${jordyOpen}`)
