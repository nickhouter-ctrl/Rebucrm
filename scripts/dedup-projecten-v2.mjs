import { createSupabaseAdmin } from './db.mjs'
const sb = await createSupabaseAdmin()
const { data: admin } = await sb.from('administraties').select('id').ilike('naam', '%Rebu%').single()

const alle = []
let from = 0
while (true) {
  const { data } = await sb.from('projecten')
    .select('id, naam, relatie_id, status, created_at')
    .eq('administratie_id', admin.id).range(from, from + 999)
  if (!data || data.length === 0) break
  alle.push(...data); from += 1000
}
console.log(`Totaal verkoopkansen: ${alle.length}`)

// Veel agressievere normalisatie
function norm(s) {
  if (!s) return ''
  return s
    .toLowerCase()
    // Strip email-reply prefixes
    .replace(/^(re|fw|fwd|aw|antw)\s*:\s*/gi, '')
    .replace(/^(re|fw|fwd|aw|antw)\s*:\s*/gi, '') // dubbele Re: Re:
    // Strip "Offerte met Nr. O-YYYY-XXXX," 
    .replace(/offerte\s+met\s+nr\.?\s*[a-z0-9-]+\s*,?\s*/gi, '')
    // Strip " van Rebu kozijnen"
    .replace(/\s+van\s+rebu\s+kozijnen\b/gi, '')
    // Strip "Offerte " / "Aanvraag" prefix
    .replace(/^(offerte|aanvraag|aanvraag\s+offerte)\s+/gi, '')
    // Strip "Ik heb interesse in Kunststof kozijn..."
    .replace(/^ik\s+heb\s+interesse\s+in\s+/gi, '')
    .replace(/\s+-\s+moh.*$/gi, '')
    // Normalize whitespace/punctuation
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
}

const grp = new Map()
for (const p of alle) {
  const key = norm(p.naam) + '|' + (p.relatie_id || 'geen')
  if (!key || norm(p.naam).length < 4) continue
  if (!grp.has(key)) grp.set(key, [])
  grp.get(key).push(p)
}
const dups = Array.from(grp.values()).filter(g => g.length > 1)
console.log(`Dubbele groepen: ${dups.length}, te mergen: ${dups.reduce((s, g) => s + g.length - 1, 0)}`)

if (process.argv.includes('--dry')) {
  for (const g of dups.slice(0, 10)) {
    console.log(`\n  "${g[0].naam}" × ${g.length}`)
    for (const p of g) console.log(`    - ${p.status}: ${p.naam}`)
  }
  process.exit(0)
}

let verwijderd = 0
for (const [, groep] of grp) {
  if (groep.length <= 1) continue
  // Behoud: actief/gewonnen status eerst, dan oudste
  groep.sort((a, b) => {
    const prio = { actief: 0, gewonnen: 0, on_hold: 1, afgerond: 2, geannuleerd: 3, verloren: 3, vervallen: 3 }
    const ap = prio[a.status] ?? 4, bp = prio[b.status] ?? 4
    if (ap !== bp) return ap - bp
    return new Date(a.created_at) - new Date(b.created_at)
  })
  const keep = groep[0]
  for (const dup of groep.slice(1)) {
    await sb.from('offertes').update({ project_id: keep.id }).eq('project_id', dup.id)
    await sb.from('taken').update({ project_id: keep.id }).eq('project_id', dup.id)
    await sb.from('emails').update({ project_id: keep.id }).eq('project_id', dup.id)
    const { error } = await sb.from('projecten').delete().eq('id', dup.id)
    if (error) console.error(`Delete ${dup.naam}: ${error.message}`)
    else verwijderd++
  }
  if (verwijderd % 100 === 0 && verwijderd > 0) console.log(`  voortgang: ${verwijderd}`)
}

const { count } = await sb.from('projecten').select('id', { count: 'exact', head: true }).eq('administratie_id', admin.id)
console.log(`\nVerwijderd: ${verwijderd}`)
console.log(`Verkoopkansen nu: ${count}`)
