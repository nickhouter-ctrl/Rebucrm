import { createSupabaseAdmin } from './db.mjs'
import { readFileSync } from 'fs'

function splitLine(l){const o=[];let c='',q=false;for(const ch of l){if(ch=='"'){q=!q;c+=ch;continue}if(ch==';'&&!q){o.push(c);c='';continue}c+=ch}o.push(c);return o}
function clean(s){return s.replace(/^"|"$/g,'').replace(/""/g,'"').trim()}
function parse(path){const c=readFileSync(path,'utf-8').replace(/^﻿/,'');const lines=c.split('\n');const h=splitLine(lines[0]).map(clean);const r=[];let b='';for(let i=1;i<lines.length;i++){b=b?b+'\n'+lines[i]:lines[i];if(!b.trim())continue;const parts=splitLine(b);if(parts.length>=h.length){const o={};h.forEach((x,j)=>{o[x]=clean(parts[j]||'')});r.push(o);b=''}}return r}
function parseDT(s){if(!s)return null;const m=s.match(/^(\d{2})-(\d{2})-(\d{4})(?:\s+(\d{1,2}):(\d{2}))?$/);if(!m)return null;const hh=m[4]?m[4].padStart(2,'0'):'00';return `${m[3]}-${m[2]}-${m[1]}T${hh}:${m[5]||'00'}:00+00:00`}
function strip(h){return (h||'').replace(/<[^>]*>/g,'').replace(/&nbsp;/g,' ').replace(/&amp;/g,'&').replace(/&lt;/g,'<').replace(/&gt;/g,'>').replace(/&quot;/g,'"').replace(/\s+/g,' ').trim()}

const supa = await createSupabaseAdmin()
const adminId = 'e69b63b6-1027-4b35-95d7-0df18f697071'
const jordyId = 'd06a844a-d26a-4951-92d1-6424cb79b52d'

// STAP 1: verwijder alle eerder geïmporteerde Tribe-notities (identificeer op tekst match)
const notCsv = parse('/Users/houterminiopslag/Downloads/Organisaties_Notities.csv')
const tribeTeksten = new Set()
for (const n of notCsv) {
  const t = strip(n.Notities_Inhoud)
  if (t) tribeTeksten.add(t.slice(0, 200))
}
console.log('Tribe unieke note-teksten:', tribeTeksten.size)

// Haal alle notities op die met Tribe-tekst matchen EN gebruiker=Jordy (want zo heb ik ze geïmporteerd)
const { data: mogelijk } = await supa.from('notities').select('id, tekst, relatie_id').eq('gebruiker_id', jordyId).is('bron', null)
console.log('Jordy notities zonder bron:', mogelijk?.length)

const teVerwijderen = (mogelijk || []).filter(n => tribeTeksten.has((n.tekst || '').slice(0, 200)))
console.log('Match met Tribe tekst (→ verwijderen):', teVerwijderen.length)

for (let i = 0; i < teVerwijderen.length; i += 100) {
  const batch = teVerwijderen.slice(i, i+100)
  await supa.from('notities').delete().in('id', batch.map(n => n.id))
}
console.log('✓ Opgeruimd')

// STAP 2: Map Tribe UUID → Tribe Naam
const orgs = [...parse('/Users/houterminiopslag/Downloads/Organisaties.csv'), ...parse('/Users/houterminiopslag/Downloads/Organisaties 2.csv')]
const uuidNaam = new Map()
for (const o of orgs) if (o.uuid && o.Naam) uuidNaam.set(o.uuid, o.Naam)

// STAP 3: Alle relaties in DB
const { data: relaties } = await supa.from('relaties').select('id, bedrijfsnaam, contactpersoon, email').eq('administratie_id', adminId)

// Strict matching:
// 1. Exact bedrijfsnaam (case-insensitive)
// 2. Exact contactpersoon
// 3. Alle woorden van Tribe-naam zitten in CRM-naam of vice versa (alle unieke content woorden)
function normaliseer(s) {
  return (s || '').toLowerCase()
    .replace(/[.,'()&|-]/g, ' ')
    .replace(/\s+b\.?v\.?\s*$/i, '')
    .replace(/\s+v\.?o\.?f\.?\s*$/i, '')
    .replace(/\s+timmerwerk(en)?\s*$/i, '')
    .replace(/\s+bouw\s*$/i, '')
    .replace(/\s+/g, ' ').trim()
}
const relatieMap = new Map()
for (const r of relaties) {
  const k1 = (r.bedrijfsnaam || '').toLowerCase().trim()
  if (k1) relatieMap.set(k1, r.id)
  const n = normaliseer(r.bedrijfsnaam)
  if (n && !relatieMap.has(n)) relatieMap.set(n, r.id)
}

function findRelatie(tribeNaam) {
  const l = tribeNaam.toLowerCase().trim()
  if (relatieMap.has(l)) return relatieMap.get(l)
  const n = normaliseer(tribeNaam)
  if (relatieMap.has(n)) return relatieMap.get(n)
  return null
}

// STAP 4: Import met strict match
const dupKey = new Set()
const { data: bestaand } = await supa.from('notities').select('relatie_id, tekst, created_at')
for (const n of bestaand || []) dupKey.add(`${n.relatie_id}::${(n.tekst||'').slice(0,80)}::${n.created_at?.slice(0,10)}`)

const profielen = (await supa.from('profielen').select('id, naam').eq('administratie_id', adminId)).data || []
function findProfielId(naam) {
  if (!naam) return jordyId
  const l = naam.toLowerCase()
  for (const p of profielen) {
    const pn = (p.naam || '').toLowerCase()
    if (pn === l) return p.id
    const eerste = pn.split(/\s+/)[0]
    if (eerste.length >= 4 && l.includes(eerste)) return p.id
  }
  return jordyId
}

const insertBatch = []
let geenMatch = 0, leeg = 0, dup = 0
for (const n of notCsv) {
  const tekst = strip(n.Notities_Inhoud)
  if (!tekst) { leeg++; continue }
  const orgNaam = uuidNaam.get(n.parent)
  if (!orgNaam) { geenMatch++; continue }
  const relId = findRelatie(orgNaam)
  if (!relId) { geenMatch++; continue }
  const created = parseDT(n.Notities_Creatiedatum) || new Date().toISOString()
  const k = `${relId}::${tekst.slice(0,80)}::${created.slice(0,10)}`
  if (dupKey.has(k)) { dup++; continue }
  dupKey.add(k)
  insertBatch.push({ administratie_id: adminId, relatie_id: relId, gebruiker_id: findProfielId(n.Notities_Aanmaker_Voornaam__achternaam), tekst, created_at: created, bron: 'tribe' })
}
console.log(`Strikt gematched, te inserten: ${insertBatch.length} | geen match: ${geenMatch} | leeg: ${leeg} | dup: ${dup}`)

let ingevoegd = 0
for (let i=0; i<insertBatch.length; i+=100) {
  const batch = insertBatch.slice(i,i+100)
  const { error } = await supa.from('notities').insert(batch)
  if (error) console.error(error.message); else ingevoegd += batch.length
}
console.log(`✓ Ingevoegd: ${ingevoegd}`)

// Verificatie
for (const zoek of ['Niels Schulenburg','EWG Bouw','Bouwbedrijf Basjes','Bouwbedrijf Scholten','Niels Swart']) {
  const { data: r } = await supa.from('relaties').select('id, bedrijfsnaam').eq('administratie_id', adminId).ilike('bedrijfsnaam', zoek).limit(1).maybeSingle()
  if (!r) { console.log(zoek, 'niet in DB'); continue }
  const { count } = await supa.from('notities').select('id',{count:'exact',head:true}).eq('relatie_id', r.id)
  console.log(r.bedrijfsnaam, ':', count, 'notities')
}
