import { createSupabaseAdmin } from './db.mjs'

const supabase = await createSupabaseAdmin()
const { data: admin } = await supabase.from('administraties').select('id').ilike('naam', '%Rebu%').single()
const adminId = admin.id

// Pagineer alle relaties
const relaties = []
let from = 0
while (true) {
  const { data: batch, error } = await supabase
    .from('relaties')
    .select('id, bedrijfsnaam, type, email, telefoon, adres, postcode, plaats, contactpersoon, created_at')
    .eq('administratie_id', adminId)
    .order('created_at', { ascending: true })
    .range(from, from + 999)
  if (error) { console.error('Batch error:', error.message); break }
  if (!batch || batch.length === 0) break
  relaties.push(...batch)
  from += 1000
}
console.log(`Opgehaald: ${relaties.length} relaties`)

function normNaam(s) {
  return (s || '').toLowerCase()
    .replace(/\s+b\.?v\.?\s*$|\s+vof\s*$|\s+v\.?o\.?f\.?\s*$|\s+eenmanszaak\s*$/g, '')
    .replace(/[^a-z0-9]/g, '')
    .trim()
}
function normEmail(s) { return (s || '').toLowerCase().trim() }
function normTel(s) { return (s || '').replace(/[^0-9]/g, '') }

// Union-find voor groepering
const parent = new Map()
for (const r of relaties) parent.set(r.id, r.id)
function find(x) {
  let p = parent.get(x)
  while (p !== x) { x = p; p = parent.get(x) }
  return x
}
function union(a, b) {
  const ra = find(a), rb = find(b)
  if (ra !== rb) parent.set(ra, rb)
}

// Bouw indexen
const naamIdx = new Map()
const emailIdx = new Map()
const telIdx = new Map()
for (const r of relaties) {
  const nn = normNaam(r.bedrijfsnaam)
  if (nn && nn.length >= 4) {
    if (!naamIdx.has(nn)) naamIdx.set(nn, [])
    naamIdx.get(nn).push(r.id)
  }
  const ne = normEmail(r.email)
  if (ne && ne.includes('@')) {
    if (!emailIdx.has(ne)) emailIdx.set(ne, [])
    emailIdx.get(ne).push(r.id)
  }
  const nt = normTel(r.telefoon)
  if (nt && nt.length >= 8) {
    if (!telIdx.has(nt)) telIdx.set(nt, [])
    telIdx.get(nt).push(r.id)
  }
}

// Union groepen
for (const [, ids] of naamIdx) {
  for (let i = 1; i < ids.length; i++) union(ids[0], ids[i])
}
for (const [, ids] of emailIdx) {
  for (let i = 1; i < ids.length; i++) union(ids[0], ids[i])
}
for (const [, ids] of telIdx) {
  for (let i = 1; i < ids.length; i++) union(ids[0], ids[i])
}

// Verzamel groepen
const groepen = new Map()
const byId = new Map(relaties.map(r => [r.id, r]))
for (const r of relaties) {
  const root = find(r.id)
  if (!groepen.has(root)) groepen.set(root, [])
  groepen.get(root).push(r)
}

const duplicateGroups = Array.from(groepen.values()).filter(g => g.length > 1)
const totalDupRelaties = duplicateGroups.reduce((s, g) => s + g.length - 1, 0)
console.log(`\nGevonden: ${duplicateGroups.length} groepen met dubbele relaties, ${totalDupRelaties} te mergen`)

// Preview eerste 10
for (const g of duplicateGroups.slice(0, 10)) {
  console.log(`\n  ${g.length}x "${g[0].bedrijfsnaam}"`)
  for (const r of g) {
    console.log(`    - ${r.bedrijfsnaam} | ${r.email || '-'} | ${r.telefoon || '-'} | ${r.plaats || '-'}`)
  }
}

if (process.argv.includes('--dry')) {
  console.log('\n[DRY RUN] Geen wijzigingen uitgevoerd.')
  process.exit(0)
}

console.log('\n--- MERGE STARTEN ---\n')

let merged = 0
let errors = 0

// Helper: score voor "beste" relatie om master te maken
function score(r) {
  return (r.email ? 2 : 0) + (r.telefoon ? 2 : 0) + (r.adres ? 1 : 0)
    + (r.postcode ? 1 : 0) + (r.plaats ? 1 : 0) + (r.contactpersoon ? 1 : 0)
    + (r.type === 'zakelijk' ? 1 : 0)
}

for (const groep of duplicateGroups) {
  // Kies master: hoogste score, bij gelijke score → oudste created_at
  const master = groep.slice().sort((a, b) => {
    const s = score(b) - score(a)
    if (s !== 0) return s
    return new Date(a.created_at) - new Date(b.created_at)
  })[0]

  const duplicaten = groep.filter(r => r.id !== master.id)

  for (const dup of duplicaten) {
    // Verhuis alle gerelateerde records naar master
    const tables = [
      { table: 'projecten', column: 'relatie_id' },
      { table: 'offertes', column: 'relatie_id' },
      { table: 'facturen', column: 'relatie_id' },
      { table: 'orders', column: 'relatie_id' },
      { table: 'taken', column: 'relatie_id' },
      { table: 'notities', column: 'relatie_id' },
      { table: 'emails', column: 'relatie_id' },
      { table: 'email_log', column: 'relatie_id' },
      { table: 'berichten', column: 'relatie_id' },
      { table: 'contactpersonen', column: 'relatie_id' },
      { table: 'afspraken', column: 'relatie_id' },
    ]
    for (const { table, column } of tables) {
      const { error } = await supabase.from(table).update({ [column]: master.id }).eq(column, dup.id)
      if (error && !error.message.includes('does not exist') && !error.message.includes('column')) {
        // Negeer als tabel/kolom niet bestaat
      }
    }
    // documenten met entiteit_type = 'relatie'
    await supabase.from('documenten')
      .update({ entiteit_id: master.id })
      .eq('entiteit_id', dup.id)
      .eq('entiteit_type', 'relatie')

    // klant_relaties duplicaat verwijderen (of verhuizen)
    await supabase.from('klant_relaties').delete().eq('relatie_id', dup.id)

    // Verwijder duplicaat
    const { error: delErr } = await supabase.from('relaties').delete().eq('id', dup.id)
    if (delErr) {
      console.error(`  FOUT bij verwijderen "${dup.bedrijfsnaam}" (${dup.id}): ${delErr.message}`)
      errors++
    } else {
      merged++
    }
  }

  // Master aanvullen met ontbrekende velden uit duplicaten
  const upd = {}
  if (!master.email) {
    const r = groep.find(x => x.email)
    if (r) upd.email = r.email
  }
  if (!master.telefoon) {
    const r = groep.find(x => x.telefoon)
    if (r) upd.telefoon = r.telefoon
  }
  if (!master.contactpersoon) {
    const r = groep.find(x => x.contactpersoon)
    if (r) upd.contactpersoon = r.contactpersoon
  }
  if (!master.adres) {
    const r = groep.find(x => x.adres)
    if (r) { upd.adres = r.adres; upd.postcode = r.postcode; upd.plaats = r.plaats }
  }
  if (Object.keys(upd).length > 0) {
    await supabase.from('relaties').update(upd).eq('id', master.id)
  }

  if ((merged + errors) % 50 === 0) console.log(`  voortgang: ${merged} samengevoegd, ${errors} fouten`)
}

console.log(`\nDone. Samengevoegd: ${merged}, fouten: ${errors}`)

const { count } = await supabase
  .from('relaties')
  .select('id', { count: 'exact', head: true })
  .eq('administratie_id', adminId)
console.log(`Totaal relaties nu: ${count}`)
