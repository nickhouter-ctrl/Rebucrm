/**
 * Strict gefilterd: alleen verkoopkansen die in de laatste 60 dagen op 'afgerond'
 * zijn gezet EN waarvan de facturen verdacht zijn (geen betaalde factuur,
 * gecrediteerde factuur zonder credit-nota, of overbetaling op aanbetaling
 * terwijl restbetaling open staat).
 *
 * Verkoopkansen zonder facturen worden genegeerd — die zijn handmatig
 * gearchiveerd (verloren lead etc), niet door de SnelStart-bug.
 */
import { createClient } from '@supabase/supabase-js'
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } })

async function main() {
  const grens = new Date(); grens.setDate(grens.getDate() - 60)
  const grensIso = grens.toISOString()
  console.log(`Periode: vanaf ${grensIso.slice(0, 10)}\n`)
  console.log('Zoekt: afgearchiveerde verkoopkansen MET facturen waar iets niet klopt.\n')

  const { data: afgerondeProjecten } = await sb
    .from('projecten')
    .select('id, naam, status, updated_at, relatie:relaties(bedrijfsnaam), offertes:offertes(id, facturen:facturen(id, factuurnummer, status, factuur_type, totaal, betaald_bedrag, snelstart_openstaand, datum, gerelateerde_factuur_id))')
    .eq('status', 'afgerond')
    .gte('updated_at', grensIso)
    .order('updated_at', { ascending: false })

  if (!afgerondeProjecten) {
    console.log('Geen data.')
    return
  }

  let verdacht = 0
  let totMetFacturen = 0
  for (const p of afgerondeProjecten) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const facturen = ((p.offertes as any[]) || []).flatMap((o: any) => o.facturen || [])
    if (facturen.length === 0) continue  // Verkoopkans zonder facturen → handmatig of bij verloren lead, sla over
    totMetFacturen++

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const rel = (p.relatie as any)?.bedrijfsnaam || '(geen klant)'

    const issues: string[] = []

    // 1) Concept-facturen worden vaak nog niet verstuurd → geen probleem
    // 2) 'verzonden' / 'deels_betaald' / 'vervallen' factuur op een afgearchiveerd project = probleem
    const onbetaaldeOpen = facturen.filter((f: { status: string; factuur_type: string | null }) =>
      ['verzonden', 'deels_betaald', 'vervallen'].includes(f.status) && f.factuur_type !== 'credit'
    )
    if (onbetaaldeOpen.length > 0) {
      issues.push(`${onbetaaldeOpen.length} factuur staat nog OPEN (verzonden/deels/vervallen) ondanks afgearchiveerd`)
    }

    // 3) Gecrediteerde factuur zonder bijbehorende credit-nota in dit project
    const gecrediteerdZonderCredit = facturen.filter((f: { status: string; factuur_type: string | null; id: string }) =>
      f.status === 'gecrediteerd' && f.factuur_type !== 'credit'
      && !facturen.some((c: { factuur_type: string | null; gerelateerde_factuur_id: string | null }) => c.factuur_type === 'credit' && c.gerelateerde_factuur_id === f.id)
    )
    if (gecrediteerdZonderCredit.length > 0) {
      issues.push(`${gecrediteerdZonderCredit.length} factuur op 'gecrediteerd' zonder echte credit-nota — typische bug-signatuur`)
    }

    // 4) Aanbetaling met groot negatief openstaand (dubbele betaling op verkeerde factuur)
    const overbetaaldeAanbet = facturen.find((f: { factuur_type: string | null; snelstart_openstaand: number | null }) =>
      f.factuur_type === 'aanbetaling' && f.snelstart_openstaand != null && f.snelstart_openstaand < -1
    )
    const restOpen = facturen.find((f: { factuur_type: string | null; status: string }) =>
      f.factuur_type === 'restbetaling' && (f.status === 'verzonden' || f.status === 'vervallen')
    )
    if (overbetaaldeAanbet && restOpen) {
      issues.push(`aanbetaling overbetaald (€${Math.abs(Number(overbetaaldeAanbet.snelstart_openstaand)).toFixed(2)}) terwijl restbetaling open → dubbele betaling op verkeerde factuur`)
    }

    if (issues.length === 0) continue

    verdacht++
    console.log(`⚠️  ${p.naam}  —  ${rel}`)
    console.log(`     id: ${p.id}  archived: ${p.updated_at.slice(0, 10)}`)
    for (const i of issues) console.log(`     • ${i}`)
    for (const f of facturen) {
      const sym = (f as { status: string }).status === 'gecrediteerd' ? '⚠️' :
        ['verzonden', 'deels_betaald', 'vervallen'].includes((f as { status: string }).status) ? '🔓' : '  '
      console.log(`     ${sym} ${(f as { factuurnummer: string }).factuurnummer}  €${Number((f as { totaal: number }).totaal).toFixed(2)}  ${(f as { status: string }).status}/${(f as { factuur_type: string | null }).factuur_type || '-'}  open=${(f as { snelstart_openstaand: number | null }).snelstart_openstaand ?? '-'}`)
    }
    console.log('')
  }

  console.log(`\n=== SAMENVATTING ===`)
  console.log(`Verkoopkansen gearchiveerd (laatste 60 dagen): ${afgerondeProjecten.length}`)
  console.log(`Daarvan met facturen:                          ${totMetFacturen}`)
  console.log(`Daarvan VERDACHT:                              ${verdacht}`)
}

main().catch(e => { console.error(e); process.exit(1) })
