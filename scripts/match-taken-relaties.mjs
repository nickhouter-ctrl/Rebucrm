import { createSupabaseAdmin } from './db.mjs'
import { readFileSync } from 'fs'

function splitLine(l){const o=[];let c='',q=false;for(const ch of l){if(ch=='"'){q=!q;c+=ch;continue}if(ch==';'&&!q){o.push(c);c='';continue}c+=ch}o.push(c);return o}
function clean(s){return s.replace(/^"|"$/g,'').replace(/""/g,'"').trim()}
function parse(path){const c=readFileSync(path,'utf-8').replace(/^﻿/,'');const lines=c.split('\n');const h=splitLine(lines[0]).map(clean);const r=[];let b='';for(let i=1;i<lines.length;i++){b=b?b+'\n'+lines[i]:lines[i];if(!b.trim())continue;const parts=splitLine(b);if(parts.length>=h.length){const o={};h.forEach((x,j)=>{o[x]=clean(parts[j]||'')});r.push(o);b=''}}return r}

const supa = await createSupabaseAdmin()
const adminId = 'e69b63b6-1027-4b35-95d7-0df18f697071'

// CSV's combineren — nieuwe + oude — voor elke Nummer de relatie-naam
const alle = [
  ...parse('/Users/houterminiopslag/Downloads/8205995b-fb73-4927-b63e-be0d90407270/Taken.csv'),
  ...parse('/Users/houterminiopslag/Downloads/Taken.csv'),
  ...parse('/Users/houterminiopslag/Downloads/Taken 2.csv'),
]
const nummerNaarRelatienaam = new Map()
for (const t of alle) {
  if (!t.Nummer) continue
  const r = t.Relatie_name || t.Contactpersoon_Voornaam__achternaam
  if (!r) continue
  if (!nummerNaarRelatienaam.has(t.Nummer)) nummerNaarRelatienaam.set(t.Nummer, r)
}
console.log('Nummer→Relatie mappings uit CSVs:', nummerNaarRelatienaam.size)

// Alle relaties ophalen voor name matching
const { data: relaties } = await supa.from('relaties').select('id, bedrijfsnaam, contactpersoon').eq('administratie_id', adminId)
const relatieByNaam = new Map()
for (const r of relaties || []) {
  if (r.bedrijfsnaam) relatieByNaam.set(r.bedrijfsnaam.toLowerCase().trim(), r.id)
  if (r.contactpersoon) {
    const k = r.contactpersoon.toLowerCase().trim()
    if (!relatieByNaam.has(k)) relatieByNaam.set(k, r.id)
  }
}
console.log('Relaties in DB:', relaties?.length)

// Taken zonder relatie_id
const { data: taken } = await supa.from('taken').select('id, taaknummer').eq('administratie_id', adminId).is('relatie_id', null)
console.log('Taken zonder relatie:', taken?.length)

let updated = 0, geenMatch = 0, geenCsvData = 0
const onmatch = []
for (const t of taken || []) {
  if (!t.taaknummer) { geenCsvData++; continue }
  const csvRelNaam = nummerNaarRelatienaam.get(t.taaknummer)
  if (!csvRelNaam) { geenCsvData++; continue }
  const rid = relatieByNaam.get(csvRelNaam.toLowerCase().trim())
  if (!rid) {
    onmatch.push({ nummer: t.taaknummer, relatie: csvRelNaam })
    geenMatch++
    continue
  }
  await supa.from('taken').update({ relatie_id: rid }).eq('id', t.id)
  updated++
}
console.log(`\n✓ Updated: ${updated} | geen relatie-match: ${geenMatch} | geen CSV data: ${geenCsvData}`)
if (onmatch.length) {
  console.log('\nSample niet-matchende relaties (niet in CRM):')
  for (const o of onmatch.slice(0, 15)) console.log(' -', o.nummer, '→', o.relatie)
}

// Eindstand
const jordyId = 'd06a844a-d26a-4951-92d1-6424cb79b52d'
const { count: zonder } = await supa.from('taken').select('id', { count:'exact', head:true }).eq('administratie_id', adminId).eq('toegewezen_aan', jordyId).neq('status','afgerond').is('relatie_id', null)
console.log('\nJordy open taken zonder relatie nu:', zonder)
