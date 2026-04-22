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

// STAP 1: Import ontbrekende organisaties als relaties
const orgs = [...parse('/Users/houterminiopslag/Downloads/Organisaties.csv'), ...parse('/Users/houterminiopslag/Downloads/Organisaties 2.csv')]
const uniekePerNaam = new Map()
for (const o of orgs) { if (o.Naam && !uniekePerNaam.has(o.Naam)) uniekePerNaam.set(o.Naam, o) }
console.log('Unieke Tribe organisaties:', uniekePerNaam.size)

const { data: bestaand } = await supa.from('relaties').select('id, bedrijfsnaam').eq('administratie_id', adminId)
const bestaandeNamen = new Set((bestaand || []).map(r => (r.bedrijfsnaam || '').toLowerCase().trim()))
console.log('Bestaande relaties:', bestaand?.length)

const teImporteren = []
const tribeUuidNaarRelatie = new Map()
for (const o of uniekePerNaam.values()) {
  const lower = (o.Naam || '').toLowerCase().trim()
  if (bestaandeNamen.has(lower)) continue
  // Bouw adres samen
  const straat = [o.Organisatie_Bezoekadres_Straat, o.Organisatie_Bezoekadres_Huisnummer, o.Organisatie_Bezoekadres_Toevoeging].filter(Boolean).join(' ').trim() || null
  teImporteren.push({
    administratie_id: adminId,
    bedrijfsnaam: o.Naam,
    type: (o.Type_Enkelvoudige_naam_vertaald || '').toLowerCase().includes('particulier') ? 'particulier' : 'zakelijk',
    email: o.Organisatie_E_mailadres || o['Organisatie_E-mailadres'] || null,
    telefoon: o.Organisatie_Telefoonnummer || null,
    adres: straat,
    postcode: o.Organisatie_Bezoekadres_Postcode || null,
    plaats: o.Organisatie_Bezoekadres_Stad || null,
    kvk_nummer: o.Organisatie_Kvk_nummer || null,
    btw_nummer: o.Organisatie_BTW_nummer || null,
    _uuid: o.uuid,
  })
}
console.log('Te importeren als nieuwe relaties:', teImporteren.length)

let ingevoegd = 0
for (let i=0; i<teImporteren.length; i+=100) {
  const batch = teImporteren.slice(i, i+100).map(r => { const c = { ...r }; delete c._uuid; return c })
  const { data, error } = await supa.from('relaties').insert(batch).select('id, bedrijfsnaam')
  if (error) { console.error(error.message); continue }
  for (let j=0; j<data.length; j++) {
    const orig = teImporteren[i+j]
    if (orig._uuid) tribeUuidNaarRelatie.set(orig._uuid, data[j].id)
  }
  ingevoegd += data.length
}
console.log('✓ Nieuwe relaties aangemaakt:', ingevoegd)

// STAP 2: Bouw UUID→relatieId voor ALLE organisaties (nieuwe + bestaande)
const { data: alleRel } = await supa.from('relaties').select('id, bedrijfsnaam').eq('administratie_id', adminId)
const naamNaarId = new Map((alleRel || []).map(r => [(r.bedrijfsnaam||'').toLowerCase().trim(), r.id]))
const uuidNaarId = new Map()
for (const o of uniekePerNaam.values()) {
  const id = naamNaarId.get((o.Naam||'').toLowerCase().trim())
  if (id) uuidNaarId.set(o.uuid, id)
}
console.log('UUID→relatie-id mappings:', uuidNaarId.size)

// STAP 3: Verwijder alle eerdere tribe-notities en herkoppel alles
await supa.from('notities').delete().eq('bron', 'tribe')
console.log('Oude tribe-notities verwijderd')

const notCsv = parse('/Users/houterminiopslag/Downloads/Organisaties_Notities.csv')
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
let geenMatch = 0, leeg = 0
for (const n of notCsv) {
  const tekst = strip(n.Notities_Inhoud)
  if (!tekst) { leeg++; continue }
  const relId = uuidNaarId.get(n.parent)
  if (!relId) { geenMatch++; continue }
  const created = parseDT(n.Notities_Creatiedatum) || new Date().toISOString()
  insertBatch.push({ administratie_id: adminId, relatie_id: relId, gebruiker_id: findProfielId(n.Notities_Aanmaker_Voornaam__achternaam), tekst, created_at: created, bron: 'tribe' })
}
console.log(`Notities te inserten: ${insertBatch.length} | geen uuid-match: ${geenMatch} | leeg: ${leeg}`)

let notIngevoegd = 0
for (let i=0; i<insertBatch.length; i+=100) {
  const batch = insertBatch.slice(i,i+100)
  const { error } = await supa.from('notities').insert(batch)
  if (error) console.error(error.message); else notIngevoegd += batch.length
}
console.log(`✓ Notities ingevoegd: ${notIngevoegd}`)

// Verificatie
for (const zoek of ['grebra','schulenburg','ewg','basjes']) {
  const { data: r } = await supa.from('relaties').select('id, bedrijfsnaam').eq('administratie_id', adminId).ilike('bedrijfsnaam', '%'+zoek+'%').limit(1).maybeSingle()
  if (!r) { console.log(zoek, ': niet gevonden'); continue }
  const { count } = await supa.from('notities').select('id',{count:'exact',head:true}).eq('relatie_id', r.id)
  console.log(r.bedrijfsnaam, ':', count, 'notities')
}
