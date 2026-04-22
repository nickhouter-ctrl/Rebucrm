import { createSupabaseAdmin } from './db.mjs'

const supa = await createSupabaseAdmin()
const adminId = 'e69b63b6-1027-4b35-95d7-0df18f697071'

// Haal ALLE projecten op (via paginatie — Supabase cap = 1000)
async function fetchAll(query) {
  const all = []
  for (let from = 0; ; from += 1000) {
    const { data } = await query.range(from, from + 999)
    if (!data || data.length === 0) break
    all.push(...data)
    if (data.length < 1000) break
  }
  return all
}

const projecten = await fetchAll(supa.from('projecten').select('id, naam, relatie_id, status').eq('administratie_id', adminId).order('created_at', { ascending: true }))
console.log('Totaal projecten:', projecten.length)

// Haal alle offertes op met project_id
const offertes = await fetchAll(supa.from('offertes').select('id, project_id, groep_id, offertenummer, versie_nummer').eq('administratie_id', adminId))
console.log('Totaal offertes:', offertes.length)

// Map: project_id → [offertes]
const offertesPerProject = new Map()
for (const o of offertes) {
  if (!o.project_id) continue
  if (!offertesPerProject.has(o.project_id)) offertesPerProject.set(o.project_id, [])
  offertesPerProject.get(o.project_id).push(o)
}

// Groepeer projecten op relatie_id + normalized naam
function norm(s) {
  let n = (s || '').toLowerCase().trim()
  // Strip alle Re:/Fw: varianten
  while (/^(?:re|fw|fwd|aanvraag|offerte|offerte-aanvraag)\s*:\s*/i.test(n)) {
    n = n.replace(/^(?:re|fw|fwd|aanvraag|offerte|offerte-aanvraag)\s*:\s*/i, '')
  }
  // Strip "Offerte met Nr. O-XXXX-YYYY," prefix
  n = n.replace(/^offerte\s+met\s+nr\.?\s+o-\d+-\d+,?\s*/gi, '')
  // Strip "van Rebu kozijnen" suffix
  n = n.replace(/\s+van\s+rebu\s+kozijnen\s*$/gi, '')
  // Verwijder leestekens
  n = n.replace(/[.,/\\()[\]!?:;'"]/g, '')
  n = n.replace(/\s*-\s*/g, ' ')
  n = n.replace(/\s+/g, ' ').trim()
  // Eerste ~40 tekens
  return n.slice(0, 40)
}

const groepen = new Map() // key = relatie_id::naam-normalized
for (const p of projecten) {
  if (!p.relatie_id) continue
  const key = `${p.relatie_id}::${norm(p.naam)}`
  if (!groepen.has(key)) groepen.set(key, [])
  groepen.get(key).push(p)
}

let samengevoegd = 0
let verwijderd = 0
let merged_offertes = 0

for (const [, arr] of groepen) {
  if (arr.length < 2) continue

  // Sorteer: met offertes voorrang, dan oudste (eerste created_at = eerder in arr)
  arr.sort((a, b) => {
    const oa = (offertesPerProject.get(a.id) || []).length
    const ob = (offertesPerProject.get(b.id) || []).length
    if (oa !== ob) return ob - oa // meest offertes eerst
    return 0 // oorspronkelijke volgorde behouden (oudst eerst)
  })

  const primary = arr[0]
  const doubles = arr.slice(1)

  for (const dup of doubles) {
    const dupOffertes = offertesPerProject.get(dup.id) || []
    if (dupOffertes.length === 0) {
      // Leeg duplicaat → verwijderen
      const { error } = await supa.from('projecten').delete().eq('id', dup.id)
      if (!error) verwijderd++
      else console.error('Delete error', dup.id, error.message)
    } else {
      // Offertes en taken verplaatsen naar primary-project, dan dup verwijderen
      for (const off of dupOffertes) {
        await supa.from('offertes').update({ project_id: primary.id }).eq('id', off.id)
        merged_offertes++
      }
      await supa.from('taken').update({ project_id: primary.id }).eq('project_id', dup.id)
      await supa.from('emails').update({ project_id: primary.id }).eq('project_id', dup.id)
      await supa.from('documenten').update({ entiteit_id: primary.id }).eq('entiteit_id', dup.id).eq('entiteit_type', 'project')
      const { error } = await supa.from('projecten').delete().eq('id', dup.id)
      if (!error) samengevoegd++
      else console.error('Merge delete error', dup.id, error.message)
    }
  }
}

console.log(`\n✓ Leeg duplicaat verwijderd: ${verwijderd}`)
console.log(`✓ Samengevoegd (offertes verplaatst): ${samengevoegd} projecten, ${merged_offertes} offertes`)
