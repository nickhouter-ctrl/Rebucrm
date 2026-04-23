import { createSupabaseAdmin } from './db.mjs'
const sb = await createSupabaseAdmin()

// Koppel medewerkers aan profielen op basis van naam
const { data: profielen } = await sb.from('profielen').select('id, naam, email')
const { data: medewerkers } = await sb.from('medewerkers').select('id, naam, email, telefoon, profiel_id')

for (const m of medewerkers) {
  if (m.profiel_id) continue
  // Probeer match op naam (case-insensitive, eerste woord)
  const firstName = m.naam.split(' ')[0].toLowerCase()
  const match = profielen.find(p => p.naam && p.naam.toLowerCase().startsWith(firstName))
  if (match) {
    await sb.from('medewerkers').update({ profiel_id: match.id }).eq('id', m.id)
    console.log(`✓ ${m.naam} → profiel ${match.id} (${match.naam})`)
  } else {
    console.log(`✗ ${m.naam} — geen matchend profiel gevonden`)
  }
}
