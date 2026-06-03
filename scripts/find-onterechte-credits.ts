/**
 * Diagnose-script: vindt facturen die mogelijk door de SnelStart-sync bug zijn
 * geraakt (ten onrechte op 'gecrediteerd' gezet door klein negatief openstaand
 * saldo) of nu nog steeds verdachte symptomen vertonen.
 *
 * Run met:
 *   cd ~/Documents/projects/Rebu && npx tsx --env-file=.env.local scripts/find-onterechte-credits.ts
 */
import { createClient } from '@supabase/supabase-js'

const url = process.env.NEXT_PUBLIC_SUPABASE_URL
const key = process.env.SUPABASE_SERVICE_ROLE_KEY
if (!url || !key) {
  console.error('Missing SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY in env')
  process.exit(1)
}

const sb = createClient(url, key, { auth: { persistSession: false } })

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type FactuurRow = any

function fmt(f: FactuurRow): string {
  const rel = f.relatie?.bedrijfsnaam || '(geen klant)'
  const open = Number(f.snelstart_openstaand ?? 0)
  return `  ${f.factuurnummer || '(geen nummer)'}  ${rel}  €${Number(f.totaal).toFixed(2)}  openstaand=${open.toFixed(2)}  status=${f.status}  type=${f.factuur_type || '-'}  datum=${f.datum}`
}

async function main() {
  console.log('=== SNELSTART-SYNC INCIDENT DIAGNOSE ===\n')

  // === 1) Facturen met klein negatief snelstart_openstaand (-€10 < x < 0)
  // ongeacht status — dit is de exacte bug-signatuur ===
  console.log('1) Facturen met klein negatief openstaand-saldo (-€10 < x < 0)')
  console.log('   Dit is de exacte signatuur die de OUDE SnelStart-sync foutief op')
  console.log('   "gecrediteerd" zette (zoals bij Amadeus).\n')

  const { data: kleinNegatief } = await sb
    .from('facturen')
    .select('id, factuurnummer, status, factuur_type, totaal, snelstart_openstaand, datum, relatie:relaties(bedrijfsnaam), offerte:offertes(id, project:projecten(id, naam, status))')
    .lt('snelstart_openstaand', 0)
    .gte('snelstart_openstaand', -10)
    .order('snelstart_openstaand', { ascending: true })

  if (!kleinNegatief || kleinNegatief.length === 0) {
    console.log('   Geen facturen met deze signatuur gevonden.\n')
  } else {
    for (const f of kleinNegatief) {
      const flag = f.status === 'gecrediteerd' && f.factuur_type !== 'credit' ? '⚠️  NU NOG STEEDS GECREDITEERD' : '   handmatig hersteld'
      console.log(`${flag}\n${fmt(f)}`)
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const proj = (f.offerte as any)?.project
      if (proj) console.log(`     verkoopkans: "${proj.naam}" (status: ${proj.status})`)
    }
    console.log('')
  }

  // === 2) Facturen met status='gecrediteerd' maar GEEN credit-nota wijst er
  // naar — verdacht ongeacht openstaand-saldo ===
  console.log('2) Status=gecrediteerd zonder bijbehorende credit-nota in CRM\n')

  const { data: gecrediteerde } = await sb
    .from('facturen')
    .select('id, factuurnummer, status, factuur_type, totaal, snelstart_openstaand, datum, relatie:relaties(bedrijfsnaam), offerte:offertes(id, project:projecten(id, naam, status))')
    .eq('status', 'gecrediteerd')
    .neq('factuur_type', 'credit')
    .order('datum', { ascending: false })

  const ids = (gecrediteerde || []).map(f => f.id)
  let creditNotaIds = new Set<string>()
  if (ids.length > 0) {
    const { data: creditNotas } = await sb
      .from('facturen')
      .select('gerelateerde_factuur_id')
      .eq('factuur_type', 'credit')
      .in('gerelateerde_factuur_id', ids)
    creditNotaIds = new Set((creditNotas || []).map(c => c.gerelateerde_factuur_id).filter(Boolean) as string[])
  }

  const verdacht = (gecrediteerde || []).filter(f => !creditNotaIds.has(f.id))

  if (verdacht.length === 0) {
    console.log('   Geen verdachte gevallen.\n')
  } else {
    for (const f of verdacht) {
      console.log(fmt(f))
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const proj = (f.offerte as any)?.project
      if (proj) console.log(`     verkoopkans: "${proj.naam}" (status: ${proj.status})`)
    }
    console.log('')
  }

  // === 3) Afgearchiveerde verkoopkansen waar GEEN factuur op 'betaald' staat
  // (zou betekenen dat de auto-archive foutief getriggerd is) ===
  console.log('3) Verkoopkansen op "afgerond" zonder enkele factuur op "betaald"')
  console.log('   Mogelijk verkeerd gearchiveerd door auto-archive na verkeerde credit-status.\n')

  const { data: afgerondeProjecten } = await sb
    .from('projecten')
    .select('id, naam, status, updated_at, relatie:relaties(bedrijfsnaam), offertes:offertes(id, facturen:facturen(id, factuurnummer, status, factuur_type, totaal))')
    .eq('status', 'afgerond')
    .order('updated_at', { ascending: false })
    .limit(100)

  const verdachteProjecten: FactuurRow[] = []
  for (const p of afgerondeProjecten || []) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const offertes = (p.offertes as any[]) || []
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const facturen = offertes.flatMap((o: any) => o.facturen || [])
    const heeftBetaald = facturen.some((f: { status: string }) => f.status === 'betaald')
    const heeftGecrediteerd = facturen.some((f: { status: string; factuur_type: string | null }) => f.status === 'gecrediteerd' && f.factuur_type !== 'credit')
    if (!heeftBetaald && heeftGecrediteerd) verdachteProjecten.push(p)
  }

  if (verdachteProjecten.length === 0) {
    console.log('   Geen verdachte afgearchiveerde verkoopkansen.\n')
  } else {
    for (const p of verdachteProjecten) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const rel = (p.relatie as any)?.bedrijfsnaam || '(geen klant)'
      console.log(`  "${p.naam}" — ${rel} (id: ${p.id})`)
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const facturen = (p.offertes as any[]).flatMap((o: any) => o.facturen || [])
      for (const f of facturen) {
        console.log(`     factuur ${f.factuurnummer}: ${f.status} (€${Number(f.totaal).toFixed(2)})`)
      }
    }
    console.log('')
  }

  // === 4) Samenvatting ===
  console.log('=== SAMENVATTING ===')
  console.log(`Bug-signatuur (klein negatief openstaand):  ${kleinNegatief?.length || 0} factuur(en)`)
  console.log(`Verdacht 'gecrediteerd' zonder credit-nota: ${verdacht.length} factuur(en)`)
  console.log(`Mogelijk fout afgearchiveerde verkoopkansen: ${verdachteProjecten.length}`)
}

main().catch(e => { console.error(e); process.exit(1) })
