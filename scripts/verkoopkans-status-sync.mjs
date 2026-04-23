// Per verkoopkans: bepaal de status op basis van de gekoppelde offertes.
// - Heeft een geaccepteerde/gearchiveerde offerte → 'gewonnen' (uit actieve lijst)
// - Alle offertes afgewezen/verlopen → 'verloren'
// - Factuur betaald → 'gewonnen'
// - Anders → 'actief' blijft
import { createSupabaseAdmin } from './db.mjs'
const sb = await createSupabaseAdmin()
const { data: admin } = await sb.from('administraties').select('id').ilike('naam', '%Rebu%').single()

const projs = []
let from = 0
while (true) {
  const { data } = await sb.from('projecten').select('id, naam, status').eq('administratie_id', admin.id).range(from, from + 999)
  if (!data || data.length === 0) break
  projs.push(...data); from += 1000
}
console.log(`Projecten: ${projs.length}`)

const offertes = []
from = 0
while (true) {
  const { data } = await sb.from('offertes').select('id, project_id, status, gearchiveerd, totaal').eq('administratie_id', admin.id).not('project_id', 'is', null).range(from, from + 999)
  if (!data || data.length === 0) break
  offertes.push(...data); from += 1000
}
const factuurCheck = await sb.from('facturen').select('offerte_id, status, betaald_bedrag, totaal').eq('administratie_id', admin.id).not('offerte_id', 'is', null)
const offBetaald = new Set()
for (const f of factuurCheck.data || []) {
  if (Number(f.betaald_bedrag || 0) >= Number(f.totaal || 0) && f.status === 'betaald') offBetaald.add(f.offerte_id)
}

const offByProj = new Map()
for (const o of offertes) {
  if (!offByProj.has(o.project_id)) offByProj.set(o.project_id, [])
  offByProj.get(o.project_id).push(o)
}

let updated = 0
for (const p of projs) {
  const offs = offByProj.get(p.id) || []
  if (offs.length === 0) continue
  const heeftAccept = offs.some(o => o.status === 'geaccepteerd' || o.gearchiveerd === true)
  const heeftBetaald = offs.some(o => offBetaald.has(o.id))
  const alleAfgewezen = offs.every(o => ['afgewezen', 'verlopen'].includes(o.status))

  let nieuweStatus = null
  if (heeftBetaald || heeftAccept) nieuweStatus = 'afgerond'  // gewonnen + klaar → afgerond
  else if (alleAfgewezen) nieuweStatus = 'verloren'

  if (nieuweStatus && nieuweStatus !== p.status) {
    await sb.from('projecten').update({ status: nieuweStatus }).eq('id', p.id)
    updated++
  }
}
console.log(`Status bijgewerkt: ${updated}`)

// Stats
const { count: actief } = await sb.from('projecten').select('id', { count: 'exact', head: true }).eq('administratie_id', admin.id).eq('status', 'actief')
console.log(`Actieve verkoopkansen nu: ${actief}`)
