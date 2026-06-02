/**
 * Sluit oude verkoopkansen (t/m 2025) "slim" af.
 *
 * Classificatie per actieve/on_hold verkoopkans waarvan de laatste activiteit
 * (laatste offerte-datum, anders created_at) vóór 2026-01-01 ligt:
 *   - GEWONNEN  → geaccepteerde offerte OF een niet-concept factuur aanwezig
 *                 ⇒ status 'afgerond' (telt terecht als gewonnen in cijfers)
 *   - DOOD      → geen akkoord, geen echte factuur
 *                 ⇒ status 'afgerond' + laatste offerte op 'afgewezen'
 *                   zodat de prognose 'm als verloren ziet (niet als gewonnen)
 *
 * DRY RUN standaard. Voer uit met `--apply` om daadwerkelijk te schrijven.
 *
 * Draaien:
 *   npx tsx --env-file=.env.local scripts/afronden-oude-verkoopkansen.ts
 *   npx tsx --env-file=.env.local scripts/afronden-oude-verkoopkansen.ts --apply
 */
import { createClient } from '@supabase/supabase-js'

const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } })

const APPLY = process.argv.includes('--apply')
const GRENS = '2026-01-01' // laatste activiteit vóór deze datum = "oud"

type Offerte = { id: string; status: string | null; datum: string | null; facturen: { status: string | null; factuur_type: string | null }[] | null }
type Project = { id: string; naam: string | null; status: string | null; created_at: string | null; offertes: Offerte[] | null }

function laatsteActiviteit(p: Project): string {
  const datums = (p.offertes || []).map(o => o.datum).filter(Boolean) as string[]
  if (datums.length) return datums.sort().slice(-1)[0]
  return p.created_at || ''
}

async function main() {
  console.log(`\n${APPLY ? '⚠️  APPLY-MODUS — er wordt geschreven' : '🔍 DRY RUN — er wordt niets gewijzigd'}`)
  console.log(`Grens: laatste activiteit vóór ${GRENS}\n`)

  const { data, error } = await sb
    .from('projecten')
    .select('id, naam, status, created_at, offertes(id, status, datum, facturen(status, factuur_type))')
    .in('status', ['actief', 'on_hold'])

  if (error) { console.error('Query-fout:', error.message); process.exit(1) }
  const projecten = (data || []) as unknown as Project[]

  const oud = projecten.filter(p => {
    const d = laatsteActiviteit(p)
    return d && d < GRENS
  })

  const gewonnen: Project[] = []
  const dood: Project[] = []
  for (const p of oud) {
    const offs = p.offertes || []
    const heeftAkkoord = offs.some(o => o.status === 'geaccepteerd')
    const heeftEchteFactuur = offs.some(o => (o.facturen || []).some(f => f.status !== 'concept'))
    if (heeftAkkoord || heeftEchteFactuur) gewonnen.push(p)
    else dood.push(p)
  }

  console.log(`Totaal actief/on_hold:        ${projecten.length}`)
  console.log(`Daarvan oud (t/m 2025):       ${oud.length}`)
  console.log(`  → GEWONNEN (akkoord/factuur): ${gewonnen.length}  → afgerond`)
  console.log(`  → DOOD (geen akkoord):        ${dood.length}  → afgerond + offerte afgewezen\n`)

  const sample = (arr: Project[], n = 8) => arr.slice(0, n).map(p => `   • ${(p.naam || '(naamloos)').slice(0, 50)} — laatste: ${laatsteActiviteit(p).slice(0, 10)}`).join('\n')
  if (gewonnen.length) console.log(`Voorbeelden GEWONNEN:\n${sample(gewonnen)}\n`)
  if (dood.length) console.log(`Voorbeelden DOOD:\n${sample(dood)}\n`)

  if (!APPLY) {
    console.log('Niets gewijzigd. Draai met --apply om door te voeren.\n')
    return
  }

  let ok = 0, fail = 0
  for (const p of gewonnen) {
    const { error: e } = await sb.from('projecten').update({ status: 'afgerond' }).eq('id', p.id).in('status', ['actief', 'on_hold'])
    if (e) { console.log(`❌ ${p.naam} — ${e.message}`); fail++ } else ok++
  }
  for (const p of dood) {
    const { error: e } = await sb.from('projecten').update({ status: 'afgerond' }).eq('id', p.id).in('status', ['actief', 'on_hold'])
    if (e) { console.log(`❌ ${p.naam} — ${e.message}`); fail++; continue }
    // Laatste offerte op 'afgewezen' zodat de kans als verloren telt (niet gewonnen)
    const offs = [...(p.offertes || [])].filter(o => o.datum).sort((a, b) => (a.datum! < b.datum! ? -1 : 1))
    const laatste = offs[offs.length - 1]
    if (laatste && laatste.status !== 'afgewezen') {
      await sb.from('offertes').update({ status: 'afgewezen' }).eq('id', laatste.id)
    }
    ok++
  }
  console.log(`\nKlaar: ${ok} afgesloten, ${fail} mislukt.\n`)
}

main().catch(e => { console.error(e); process.exit(1) })
