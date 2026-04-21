import { createSupabaseAdmin } from './db.mjs'

const supabase = await createSupabaseAdmin()
const { data: admin } = await supabase.from('administraties').select('id').ilike('naam', '%Rebu%').single()
const adminId = admin.id

// Pagineer relaties (>1000)
const relaties = []
let from = 0
while (true) {
  const { data: batch, error: batchErr } = await supabase
    .from('relaties')
    .select('id, bedrijfsnaam, type, email, telefoon, adres, postcode, contactpersoon, created_at')
    .eq('administratie_id', adminId)
    .order('created_at', { ascending: true })
    .range(from, from + 999)
  if (batchErr) { console.error('Batch error:', batchErr.message); break }
  if (!batch || batch.length === 0) break
  relaties.push(...batch)
  from += 1000
}
console.log(`${relaties.length} relaties opgehaald`)

function normaliseer(naam) {
  return (naam || '').toLowerCase().replace(/[^a-z0-9\s]/g, '').replace(/\s+/g, ' ').trim()
}

// Groepeer exacte duplicaten
const groepen = new Map()
for (const r of relaties) {
  const key = normaliseer(r.bedrijfsnaam)
  if (!key) continue
  if (!groepen.has(key)) groepen.set(key, [])
  groepen.get(key).push(r)
}

// Voeg ook fuzzy duplicaten toe die duidelijk zijn
// Handmatig bevestigde fuzzy groepen:
const fuzzyGroepen = [
  // "Freco Huis" varianten
  ['freco huis', 'joeri  freco huis', 'william olgers  freco huis'],
  // "uyen zonwering en kozijnen"
  ['uyen zonwering en kozijnen', 'administratie  uyen zonwering en kozijnen'],
  // "Menno sijm" varianten
  ['menno sijm timmerwerken', 'menno sijm'],
  // "Aku Geveltechniek"
  ['aku geveltechniek', 'werkvoorbereiding aku geveltechniek'],  // NB: al via achternaam
  // "Bouwbedrijf Boendermaker"
  ['bouwbedrijf b boendermaker', 'bouwbedrijf boendermaker dennis boendermaker'],
  // frank@studio33k
  ['frankstudio33knl', 'frankstudio33k'],
]

for (const keys of fuzzyGroepen) {
  const groep = []
  for (const key of keys) {
    const r = relaties.find(rel => normaliseer(rel.bedrijfsnaam) === key)
    if (r) groep.push(r)
  }
  if (groep.length > 1) {
    // Voeg als aparte groep toe als niet al gevangen
    const existing = groepen.get(normaliseer(groep[0].bedrijfsnaam))
    if (!existing || existing.length <= 1) {
      groepen.set('fuzzy_' + groep[0].id, groep)
    }
  }
}

let merged = 0
let errors = 0

for (const [key, groep] of groepen) {
  if (groep.length <= 1) continue

  // Bepaal de "master" = degene met de meeste data
  const master = groep.reduce((best, r) => {
    const score = (r.email ? 1 : 0) + (r.telefoon ? 1 : 0) + (r.adres ? 1 : 0) + (r.contactpersoon ? 1 : 0)
    const bestScore = (best.email ? 1 : 0) + (best.telefoon ? 1 : 0) + (best.adres ? 1 : 0) + (best.contactpersoon ? 1 : 0)
    return score > bestScore ? r : best
  })

  const duplicaten = groep.filter(r => r.id !== master.id)

  for (const dup of duplicaten) {
    // Verplaats alle gekoppelde records naar master
    const tables = [
      { table: 'projecten', column: 'relatie_id' },
      { table: 'offertes', column: 'relatie_id' },
      { table: 'facturen', column: 'relatie_id' },
      { table: 'orders', column: 'relatie_id' },
      { table: 'taken', column: 'relatie_id' },
      { table: 'notities', column: 'relatie_id' },
      { table: 'documenten', column: 'entiteit_id' },
    ]

    for (const { table, column } of tables) {
      if (table === 'documenten') {
        // Documenten: filter op entiteit_type = 'relatie'
        await supabase.from(table).update({ [column]: master.id }).eq(column, dup.id).eq('entiteit_type', 'relatie')
      } else {
        await supabase.from(table).update({ [column]: master.id }).eq(column, dup.id)
      }
    }

    // Verwijder klant_relaties duplicaat
    await supabase.from('klant_relaties').delete().eq('relatie_id', dup.id)

    // Verwijder het duplicaat
    const { error } = await supabase.from('relaties').delete().eq('id', dup.id)
    if (error) {
      console.error(`Fout bij verwijderen "${dup.bedrijfsnaam}": ${error.message}`)
      errors++
    } else {
      merged++
    }
  }

  // Update master met ontbrekende data van duplicaten
  const updateData = {}
  if (!master.email) {
    const metEmail = groep.find(r => r.email)
    if (metEmail) updateData.email = metEmail.email
  }
  if (!master.telefoon) {
    const metTel = groep.find(r => r.telefoon)
    if (metTel) updateData.telefoon = metTel.telefoon
  }
  if (!master.contactpersoon) {
    const metContact = groep.find(r => r.contactpersoon)
    if (metContact) updateData.contactpersoon = metContact.contactpersoon
  }

  if (Object.keys(updateData).length > 0) {
    await supabase.from('relaties').update(updateData).eq('id', master.id)
  }
}

console.log('Duplicaten samengevoegd:', merged)
console.log('Fouten:', errors)

// Tel hoeveel relaties er nu zijn
const { count } = await supabase
  .from('relaties')
  .select('id', { count: 'exact', head: true })
  .eq('administratie_id', adminId)

console.log('Totaal relaties na merge:', count)
