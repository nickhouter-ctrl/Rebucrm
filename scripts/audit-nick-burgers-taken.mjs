// Inventariseer alle taken van Nick Burgers — laat zien welke mogelijk niet
// kloppen (auto-aangemaakt vanuit email, dubbel, oude open taken, etc.).
// Run zonder argument voor preview, met 'fix' om opschoning toe te passen.

import { createSupabaseAdmin } from './db.mjs'

const sb = await createSupabaseAdmin()
const dryRun = process.argv[2] !== 'fix'

// 1. Vind Nick Burgers
const { data: medewerkers } = await sb
  .from('medewerkers')
  .select('id, naam, profiel_id')
  .ilike('naam', '%Nick Burgers%')

if (!medewerkers || medewerkers.length === 0) {
  console.error('Nick Burgers niet gevonden in medewerkers tabel')
  process.exit(1)
}
const nick = medewerkers[0]
console.log(`Gevonden: ${nick.naam} (id=${nick.id}, profiel_id=${nick.profiel_id})`)

// 2. Alle taken — match op zowel medewerker_id als toegewezen_aan
const { data: taken, error } = await sb
  .from('taken')
  .select('id, taaknummer, titel, omschrijving, status, prioriteit, deadline, created_at, relatie_id, offerte_id, project_id, medewerker_id, toegewezen_aan, relatie:relaties(bedrijfsnaam)')
  .or(`medewerker_id.eq.${nick.id},toegewezen_aan.eq.${nick.profiel_id}`)
  .order('created_at', { ascending: false })

if (error) { console.error(error); process.exit(1) }

console.log(`\nTotaal ${taken.length} taken voor Nick Burgers`)
const open = taken.filter(t => t.status !== 'afgerond')
const afgerond = taken.filter(t => t.status === 'afgerond')
console.log(`  Open: ${open.length}, Afgerond: ${afgerond.length}`)

// 3. Categoriseer
const cat = {
  emailAanvraag: [],         // titel = "Nieuwe aanvraag - offerte nog te maken"
  emailReactie: [],          // titel matcht "Offerte reactie:..."
  nieuweVersie: [],          // titel matcht "Nieuwe versie aanvraag - ..." (oude auto-trigger)
  zonderRelatie: [],
  zonderTaaknummer: [],
  oude: [],
  duplicaten: new Map(),
}

for (const t of taken) {
  if (t.status === 'afgerond') continue
  if (t.titel === 'Nieuwe aanvraag - offerte nog te maken') cat.emailAanvraag.push(t)
  else if (/^Offerte reactie:.*offerte aanpassen$/.test(t.titel || '')) cat.emailReactie.push(t)
  else if (/^Nieuwe versie aanvraag\s*-/.test(t.titel || '')) cat.nieuweVersie.push(t)
  if (!t.relatie_id && !t.offerte_id) cat.zonderRelatie.push(t)
  if (!t.taaknummer || !t.taaknummer.trim()) cat.zonderTaaknummer.push(t)
  const ageDays = (Date.now() - new Date(t.created_at).getTime()) / 86400000
  if (ageDays > 60) cat.oude.push(t)

  const dupKey = `${(t.titel || '').toLowerCase()}|${t.relatie_id || ''}`
  const arr = cat.duplicaten.get(dupKey) || []
  arr.push(t)
  cat.duplicaten.set(dupKey, arr)
}

const dupGroepen = [...cat.duplicaten.entries()].filter(([, arr]) => arr.length > 1)

console.log('\n--- Categorieën ---')
console.log(`Email-aanvraag (auto): ${cat.emailAanvraag.length}`)
console.log(`Email-reactie (auto): ${cat.emailReactie.length}`)
console.log(`Nieuwe versie aanvraag (oude auto-trigger): ${cat.nieuweVersie.length}`)
console.log(`Zonder relatie + zonder offerte: ${cat.zonderRelatie.length}`)
console.log(`Zonder taaknummer: ${cat.zonderTaaknummer.length}`)
console.log(`Open + ouder dan 60 dagen: ${cat.oude.length}`)
console.log(`Duplicaten (zelfde titel+relatie): ${dupGroepen.length} groepen, ${dupGroepen.reduce((s, [, a]) => s + a.length - 1, 0)} extra rijen`)

// 4. Voorbeelden per categorie
function preview(label, list, n = 5) {
  if (list.length === 0) return
  console.log(`\n=== ${label} (${list.length}) ===`)
  for (const t of list.slice(0, n)) {
    const klant = t.relatie?.bedrijfsnaam ? ` | ${t.relatie.bedrijfsnaam}` : ''
    console.log(`  ${t.id.slice(0, 8)} | ${t.created_at.slice(0, 10)} | ${(t.taaknummer || '—').padEnd(12)} | ${t.titel}${klant}`)
  }
  if (list.length > n) console.log(`  ... +${list.length - n} meer`)
}
preview('Email-aanvraag taken', cat.emailAanvraag, 8)
preview('Email-reactie taken', cat.emailReactie, 8)
preview('Nieuwe versie aanvraag', cat.nieuweVersie, 8)
preview('Zonder relatie/offerte', cat.zonderRelatie, 8)
preview('Zonder taaknummer', cat.zonderTaaknummer, 8)
preview('Open > 60 dagen oud', cat.oude, 8)

if (dupGroepen.length > 0) {
  console.log(`\n=== Duplicaten (${dupGroepen.length} groepen) ===`)
  for (const [key, arr] of dupGroepen.slice(0, 5)) {
    console.log(`  ${arr.length}× ${arr[0].titel} (relatie=${arr[0].relatie?.bedrijfsnaam || '—'})`)
    for (const t of arr) console.log(`    - ${t.id.slice(0, 8)} ${t.created_at.slice(0, 10)} status=${t.status}`)
  }
}

// 5. Schoonmaak — alleen bij 'fix' argument
if (dryRun) {
  console.log(`\n[DRY RUN] Run 'node scripts/audit-nick-burgers-taken.mjs fix' om te schonen.`)
  console.log('  Voorgestelde acties:')
  console.log(`    - Verwijder ${cat.emailAanvraag.length} email-aanvraag taken (al opgeruimd in eerdere cleanup, eventueel rest)`)
  console.log(`    - Verwijder ${cat.emailReactie.length} email-reactie auto-taken`)
  console.log(`    - Markeer ${cat.oude.length} taken > 60 dagen oud als 'afgerond' (of verwijder)`)
  console.log(`    - Dedupliceer ${dupGroepen.reduce((s, [, a]) => s + a.length - 1, 0)} duplicaat-rijen (bewaar oudste)`)
  process.exit(0)
}

// FIX MODE
console.log(`\n[FIX MODE] Schoonmaak uitvoeren...`)
const teVerwijderen = new Set()

// a) Email-auto taken weg
for (const t of cat.emailAanvraag) teVerwijderen.add(t.id)
for (const t of cat.emailReactie) teVerwijderen.add(t.id)
for (const t of cat.nieuweVersie) teVerwijderen.add(t.id)

// b) Duplicaten: bewaar OUDSTE per groep, markeer rest
for (const [, arr] of dupGroepen) {
  // Sort by created_at ascending — bewaar [0]
  arr.sort((a, b) => a.created_at.localeCompare(b.created_at))
  for (let i = 1; i < arr.length; i++) teVerwijderen.add(arr[i].id)
}

// c) Open taken ouder dan 60 dagen → markeer als afgerond i.p.v. verwijderen
const oudeIds = cat.oude.filter(t => !teVerwijderen.has(t.id)).map(t => t.id)

const ids = [...teVerwijderen]
console.log(`Verwijderen: ${ids.length} taken`)
const BATCH = 100
for (let i = 0; i < ids.length; i += BATCH) {
  const batch = ids.slice(i, i + BATCH)
  const { error: e } = await sb.from('taken').delete().in('id', batch)
  if (e) console.error(`Batch ${i}:`, e.message)
  else process.stdout.write(`\r  ${Math.min(i + BATCH, ids.length)}/${ids.length}`)
}
console.log('\n')

if (oudeIds.length > 0) {
  console.log(`Afronden (taken > 60 dagen oud): ${oudeIds.length}`)
  for (let i = 0; i < oudeIds.length; i += BATCH) {
    const batch = oudeIds.slice(i, i + BATCH)
    const { error: e } = await sb.from('taken').update({ status: 'afgerond' }).in('id', batch)
    if (e) console.error(`Batch ${i}:`, e.message)
    else process.stdout.write(`\r  ${Math.min(i + BATCH, oudeIds.length)}/${oudeIds.length}`)
  }
  console.log('\n')
}

console.log('Klaar.')
