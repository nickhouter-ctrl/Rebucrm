import { createSupabaseAdmin } from './db.mjs'

const supabase = await createSupabaseAdmin()
const { data: admin } = await supabase.from('administraties').select('id').ilike('naam', '%Rebu%').single()
const adminId = admin.id

const { data: relaties } = await supabase
  .from('relaties')
  .select('id, bedrijfsnaam, type, email, telefoon')
  .eq('administratie_id', adminId)
  .order('created_at', { ascending: true })

function normaliseer(naam) {
  return (naam || '').toLowerCase()
    .replace(/[^a-z0-9\s]/g, '') // verwijder speciale tekens
    .replace(/\s+/g, ' ')
    .trim()
}

// Groepeer op genormaliseerde naam
const groepen = new Map()
for (const r of relaties) {
  const key = normaliseer(r.bedrijfsnaam)
  if (!key) continue
  if (!groepen.has(key)) groepen.set(key, [])
  groepen.get(key).push(r)
}

// Toon duplicaten
let dupGroepen = 0
let dupRelaties = 0
const duplicaten = []

for (const [key, groep] of groepen) {
  if (groep.length > 1) {
    dupGroepen++
    dupRelaties += groep.length - 1
    duplicaten.push(groep)
    if (dupGroepen <= 10) {
      console.log(`\nDuplicaat: "${groep[0].bedrijfsnaam}"`)
      for (const r of groep) {
        console.log(`  - ${r.bedrijfsnaam} (${r.type}) email: ${r.email || '-'} tel: ${r.telefoon || '-'}`)
      }
    }
  }
}

console.log(`\n--- Exacte duplicaten ---`)
console.log(`${dupGroepen} groepen, ${dupRelaties} te verwijderen`)

// Nu ook fuzzy duplicaten zoeken (bv "A. Bax" vs "Aart Bax")
// Strategie: vergelijk initialen + achternaam
function extractAchternaam(naam) {
  const parts = naam.toLowerCase().replace(/[^a-z\s]/g, '').trim().split(/\s+/)
  if (parts.length === 0) return ''
  return parts[parts.length - 1] // laatste woord = achternaam
}

function isInitiaal(woord) {
  return woord.length <= 2 || (woord.length === 2 && woord[1] === '.')
}

const fuzzyDups = []
const verwerkt = new Set()

for (let i = 0; i < relaties.length; i++) {
  if (verwerkt.has(relaties[i].id)) continue
  const a = relaties[i]
  const aNorm = normaliseer(a.bedrijfsnaam)
  const aAchternaam = extractAchternaam(a.bedrijfsnaam)

  const groep = [a]

  for (let j = i + 1; j < relaties.length; j++) {
    if (verwerkt.has(relaties[j].id)) continue
    const b = relaties[j]
    const bNorm = normaliseer(b.bedrijfsnaam)
    const bAchternaam = extractAchternaam(b.bedrijfsnaam)

    // Skip als exact dezelfde (al gevangen boven)
    if (aNorm === bNorm) continue

    // Fuzzy match: zelfde achternaam + een van beiden heeft initialen
    if (aAchternaam && bAchternaam && aAchternaam === bAchternaam && aAchternaam.length > 3) {
      const aWords = a.bedrijfsnaam.toLowerCase().split(/[\s.]+/).filter(w => w.length > 0)
      const bWords = b.bedrijfsnaam.toLowerCase().split(/[\s.]+/).filter(w => w.length > 0)

      // Check of een initiaal overeenkomt
      const aFirst = aWords[0] || ''
      const bFirst = bWords[0] || ''

      if (aFirst[0] === bFirst[0]) {
        groep.push(b)
        verwerkt.add(b.id)
      }
    }

    // Fuzzy: een naam bevat de andere (bv "Bouwbedrijf Linden" vs "Bouw- en Timmerbedrijf Linden")
    if (aNorm.length > 8 && bNorm.length > 8) {
      if (aNorm.includes(bNorm) || bNorm.includes(aNorm)) {
        groep.push(b)
        verwerkt.add(b.id)
      }
    }
  }

  if (groep.length > 1) {
    verwerkt.add(a.id)
    fuzzyDups.push(groep)
  }
}

console.log(`\n--- Fuzzy duplicaten ---`)
console.log(`${fuzzyDups.length} groepen gevonden`)
for (const groep of fuzzyDups.slice(0, 20)) {
  console.log(`\n  Groep:`)
  for (const r of groep) {
    console.log(`    - "${r.bedrijfsnaam}" (${r.type})`)
  }
}
