/**
 * Backfill bij de "verkoopkans volgt automatisch de stappen"-wijziging.
 *
 * De pipeline-fase wordt voortaan op leesmoment afgeleid (offerte/factuur-status),
 * dus bestaande kansen tonen vanzelf de juiste fase. Dit script ruimt alleen de
 * data op die niet vanzelf goed komt:
 *
 *  A) Eén opvolgtaak per verkoopkans: per project blijft de NIEUWSTE open
 *     "Offerte opvolgen"-taak staan; oudere open opvolgtaken van datzelfde
 *     project worden op 'afgerond' gezet (dubbele taken bij her-verzonden
 *     offertes). Handmatige taken (andere titel) blijven ongemoeid.
 *
 *  B) Afgerond = volledig betaald: actieve/on_hold kansen waarvan alle relevante
 *     facturen betaald (of gecrediteerd) zijn, krijgen status 'afgerond' — zelfde
 *     regel als autoArchiveerAfgerondeVerkoopkansen, hier als eenmalige inhaalslag.
 *
 * DRY RUN standaard. Schrijven met `--apply`.
 *   npx tsx --env-file=.env.local scripts/backfill-verkoopkans-taken-fases.mjs
 *   npx tsx --env-file=.env.local scripts/backfill-verkoopkans-taken-fases.mjs --apply
 */
import { createClient } from '@supabase/supabase-js'

const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } })
const APPLY = process.argv.includes('--apply')

async function fetchAll(table, select, build) {
  const rows = []
  const PAGE = 1000
  for (let from = 0; ; from += PAGE) {
    let q = sb.from(table).select(select).range(from, from + PAGE - 1)
    if (build) q = build(q)
    const { data, error } = await q
    if (error) throw new Error(`${table}: ${error.message}`)
    rows.push(...(data || []))
    if (!data || data.length < PAGE) break
  }
  return rows
}

// ---- A) Dubbele open opvolgtaken per verkoopkans ----
async function dedupeOpvolgtaken() {
  const taken = await fetchAll(
    'taken',
    'id, project_id, titel, status, created_at',
    q => q.ilike('titel', 'Offerte opvolgen%').neq('status', 'afgerond').not('project_id', 'is', null),
  )
  const perProject = new Map()
  for (const t of taken) {
    const arr = perProject.get(t.project_id) || []
    arr.push(t)
    perProject.set(t.project_id, arr)
  }
  const teSluiten = []
  for (const [, arr] of perProject) {
    if (arr.length <= 1) continue
    // Nieuwste op created_at blijft open, de rest dicht.
    arr.sort((a, b) => new Date(b.created_at || 0) - new Date(a.created_at || 0))
    teSluiten.push(...arr.slice(1).map(t => t.id))
  }
  console.log(`\n[A] Opvolgtaken: ${taken.length} open, ${perProject.size} kansen met open opvolgtaak.`)
  console.log(`    Dubbele open opvolgtaken om af te ronden: ${teSluiten.length}`)
  if (teSluiten.length && APPLY) {
    for (let i = 0; i < teSluiten.length; i += 200) {
      const batch = teSluiten.slice(i, i + 200)
      const { error } = await sb.from('taken').update({ status: 'afgerond' }).in('id', batch)
      if (error) throw new Error(`taken update: ${error.message}`)
    }
    console.log(`    ✅ ${teSluiten.length} dubbele opvolgtaken afgerond.`)
  }
  return teSluiten.length
}

// ---- B) Volledig betaalde kansen → afgerond ----
const OPEN_STATUSSEN = new Set(['concept', 'verzonden', 'deels_betaald', 'vervallen'])
async function archiveerBetaalde() {
  const projecten = await fetchAll(
    'projecten',
    'id, naam, status, offertes:offertes(id, facturen:facturen(id, status, factuur_type))',
    q => q.in('status', ['actief', 'on_hold']),
  )
  const teArchiveren = []
  for (const p of projecten) {
    const facturen = (p.offertes || []).flatMap(o => o.facturen || [])
    if (facturen.length === 0) continue
    const relevant = facturen.filter(f => f.status !== 'concept' && f.factuur_type !== 'credit')
    if (relevant.length === 0) continue
    const heeftRestOfVolledig = relevant.some(f => f.factuur_type === 'restbetaling' || f.factuur_type === 'volledig' || f.factuur_type === null)
    if (!heeftRestOfVolledig) continue
    // Geen enkele relevante factuur mag nog open staan.
    if (relevant.some(f => OPEN_STATUSSEN.has(f.status))) continue
    const alleBetaald = relevant.every(f => f.status === 'betaald' || f.status === 'gecrediteerd')
    if (alleBetaald) teArchiveren.push(p)
  }
  console.log(`\n[B] Actieve/on_hold kansen: ${projecten.length}. Volledig betaald → afronden: ${teArchiveren.length}`)
  for (const p of teArchiveren.slice(0, 15)) console.log(`    • ${p.naam || p.id}`)
  if (teArchiveren.length > 15) console.log(`    … en nog ${teArchiveren.length - 15}`)
  if (teArchiveren.length && APPLY) {
    const ids = teArchiveren.map(p => p.id)
    for (let i = 0; i < ids.length; i += 200) {
      const { error } = await sb.from('projecten').update({ status: 'afgerond' }).in('id', ids.slice(i, i + 200))
      if (error) throw new Error(`projecten update: ${error.message}`)
    }
    console.log(`    ✅ ${teArchiveren.length} kansen op afgerond gezet.`)
  }
  return teArchiveren.length
}

async function main() {
  console.log(APPLY ? '⚠️  APPLY-MODUS — er wordt geschreven' : '🔍 DRY RUN — er wordt niets gewijzigd')
  const a = await dedupeOpvolgtaken()
  const b = await archiveerBetaalde()
  console.log(`\nSamenvatting: ${a} dubbele opvolgtaken, ${b} kansen afgerond.${APPLY ? '' : '  (dry-run — voeg --apply toe om te schrijven)'}`)
}

main().catch(e => { console.error('FOUT:', e.message); process.exit(1) })
