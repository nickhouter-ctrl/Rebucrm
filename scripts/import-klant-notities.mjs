import { createSupabaseAdmin } from './db.mjs'
import { readFileSync } from 'fs'

function splitLine(l){const o=[];let c='',q=false;for(const ch of l){if(ch=='"'){q=!q;c+=ch;continue}if(ch==';'&&!q){o.push(c);c='';continue}c+=ch}o.push(c);return o}
function clean(s){return s.replace(/^"|"$/g,'').replace(/""/g,'"').trim()}
function parse(path){const c=readFileSync(path,'utf-8').replace(/^﻿/,'');const lines=c.split('\n');const h=splitLine(lines[0]).map(clean);const r=[];let b='';for(let i=1;i<lines.length;i++){b=b?b+'\n'+lines[i]:lines[i];if(!b.trim())continue;const parts=splitLine(b);if(parts.length>=h.length){const o={};h.forEach((x,j)=>{o[x]=clean(parts[j]||'')});r.push(o);b=''}}return r}
function parseDT(s){if(!s)return null;const m=s.match(/^(\d{2})-(\d{2})-(\d{4})(?:\s+(\d{1,2}):(\d{2}))?$/);if(!m)return null;const hh=m[4]?m[4].padStart(2,'0'):'00';return `${m[3]}-${m[2]}-${m[1]}T${hh}:${m[5]||'00'}:00+00:00`}
function stripHtml(h){return (h||'').replace(/<[^>]*>/g,'').replace(/&nbsp;/g,' ').replace(/&amp;/g,'&').replace(/&lt;/g,'<').replace(/&gt;/g,'>').replace(/&quot;/g,'"').replace(/\s+/g,' ').trim()}

const supa = await createSupabaseAdmin()
const adminId = 'e69b63b6-1027-4b35-95d7-0df18f697071'

// Map Tribe UUID → relatie naam uit Organisaties.csv
const orgs = [...parse('/Users/houterminiopslag/Downloads/Organisaties.csv'), ...parse('/Users/houterminiopslag/Downloads/Organisaties 2.csv')]
const uuidNaarNaam = new Map()
for (const o of orgs) { if (o.uuid && o.Naam) uuidNaarNaam.set(o.uuid, o.Naam) }
console.log('Tribe organisaties met naam:', uuidNaarNaam.size)

// Alle relaties in DB — lookup op bedrijfsnaam
const { data: relaties } = await supa.from('relaties').select('id, bedrijfsnaam').eq('administratie_id', adminId)
const relatieByNaam = new Map((relaties||[]).map(r => [r.bedrijfsnaam?.toLowerCase().trim(), r.id]))

// Gebruiker mapping (aanmaker naam → profiel_id)
const { data: profielen } = await supa.from('profielen').select('id, naam').eq('administratie_id', adminId)
function findProfielId(naam) {
  if (!naam) return null
  const l = naam.toLowerCase()
  for (const p of profielen) {
    const pn = (p.naam||'').toLowerCase()
    if (pn === l || (l.includes(pn.split(/\s+/)[0]) && pn.split(/\s+/)[0].length > 2)) return p.id
    if (l.includes('jordy') && pn.includes('jordy')) return p.id
    if (l.includes('houter') && pn.includes('houter')) return p.id
    if (l.includes('burgers') && pn.includes('burgers')) return p.id
  }
  return null
}
const jordyId = 'd06a844a-d26a-4951-92d1-6424cb79b52d'  // fallback

// Notities CSV
const notCsv = parse('/Users/houterminiopslag/Downloads/Organisaties_Notities.csv')
console.log('Notitie-regels totaal:', notCsv.length)

// Bestaande notities (voor dedup): key = relatie_id + tekst[:80] + created_at[:10]
const { data: bestaand } = await supa.from('notities').select('relatie_id, tekst, created_at')
const dupKey = new Set((bestaand||[]).map(n => `${n.relatie_id}::${(n.tekst||'').slice(0,80)}::${n.created_at?.slice(0,10)}`))

let ingevoegd = 0, geenRelatie = 0, dupes = 0, leeg = 0
const insertBatch = []
for (const n of notCsv) {
  const tekst = stripHtml(n.Notities_Inhoud)
  if (!tekst) { leeg++; continue }
  const orgNaam = uuidNaarNaam.get(n.parent)
  if (!orgNaam) { geenRelatie++; continue }
  const relatieId = relatieByNaam.get(orgNaam.toLowerCase().trim())
  if (!relatieId) { geenRelatie++; continue }
  const created = parseDT(n.Notities_Creatiedatum) || new Date().toISOString()
  const k = `${relatieId}::${tekst.slice(0,80)}::${created.slice(0,10)}`
  if (dupKey.has(k)) { dupes++; continue }
  dupKey.add(k)
  const gebruikerId = findProfielId(n.Notities_Aanmaker_Voornaam__achternaam) || jordyId
  insertBatch.push({ administratie_id: adminId, relatie_id: relatieId, gebruiker_id: gebruikerId, tekst, created_at: created })
}
console.log(`Te inserten: ${insertBatch.length} | dupes: ${dupes} | leeg: ${leeg} | geen relatie: ${geenRelatie}`)

for (let i = 0; i < insertBatch.length; i += 100) {
  const batch = insertBatch.slice(i, i+100)
  const { error } = await supa.from('notities').insert(batch)
  if (error) console.error('Batch error:', error.message)
  else ingevoegd += batch.length
}
console.log(`✓ Ingevoegd: ${ingevoegd}`)

// Verificatie voor genoemde klanten
for (const n of ['Niels Schulenburg','EWG Bouw','Bouwbedrijf Basjes']) {
  const { data: r } = await supa.from('relaties').select('id, bedrijfsnaam').ilike('bedrijfsnaam', '%' + n + '%').maybeSingle()
  if (!r) { console.log(n, ': relatie niet gevonden'); continue }
  const { count } = await supa.from('notities').select('id', { count:'exact', head:true }).eq('relatie_id', r.id)
  console.log(`${r.bedrijfsnaam}: ${count} notities`)
}
