// Vindt facturen met totaal > 0 maar geen factuur_regels,
// rekent incl BTW → excl + 21% BTW, en voegt 1 regel toe + corrigeert subtotaal/btw_totaal.
import { createSupabaseAdmin } from './db.mjs'

const supabase = await createSupabaseAdmin()
const { data: admin } = await supabase.from('administraties').select('id').ilike('naam', '%Rebu%').single()

// 1. Alle facturen met totaal > 0
const facturen = []
let from = 0
while (true) {
  const { data } = await supabase
    .from('facturen')
    .select('id, factuurnummer, totaal, subtotaal, btw_totaal, onderwerp, factuur_type, status, snelstart_boeking_id')
    .eq('administratie_id', admin.id)
    .gt('totaal', 0)
    .range(from, from + 999)
  if (!data || data.length === 0) break
  facturen.push(...data)
  from += 1000
}

// 2. Per factuur: check of er regels zijn
const ids = facturen.map(f => f.id)
// Query in chunks om te voorkomen dat URL te lang wordt
const regelCount = new Map()
for (let i = 0; i < ids.length; i += 100) {
  const chunk = ids.slice(i, i + 100)
  const { data: rows } = await supabase
    .from('factuur_regels')
    .select('factuur_id')
    .in('factuur_id', chunk)
  for (const r of rows || []) regelCount.set(r.factuur_id, (regelCount.get(r.factuur_id) || 0) + 1)
}

const leeg = facturen.filter(f => !regelCount.get(f.id))
console.log(`Facturen met totaal>0 zonder regels: ${leeg.length}`)
let som = 0
for (const f of leeg) {
  som += Number(f.totaal)
  console.log(`  ${f.factuurnummer} | totaal €${f.totaal} | ${f.factuur_type || '-'} | ${f.onderwerp || '-'} | status=${f.status}`)
}
console.log(`Totaal bedrag: €${som.toFixed(2)}`)

if (process.argv.includes('--dry')) {
  console.log('\n[DRY RUN] Geen wijzigingen uitgevoerd. Run zonder --dry om te repareren.')
  process.exit(0)
}

console.log('\n--- REPAREREN ---')
let fixed = 0
for (const f of leeg) {
  const totaalIncl = Number(f.totaal)
  const btwPct = 21
  const excl = Math.round((totaalIncl / (1 + btwPct / 100)) * 100) / 100
  const btwBedrag = Math.round((totaalIncl - excl) * 100) / 100

  // Omschrijving: gebruik onderwerp of factuur_type fallback
  const typeOms = f.factuur_type === 'aanbetaling' ? 'Aanbetaling' : f.factuur_type === 'restbetaling' ? 'Restbetaling' : 'Werkzaamheden'
  const omschrijving = f.onderwerp && f.onderwerp.trim().length > 0 ? f.onderwerp : typeOms

  // Voeg regel toe
  const { error: regelErr } = await supabase.from('factuur_regels').insert({
    factuur_id: f.id,
    omschrijving,
    aantal: 1,
    prijs: excl,
    btw_percentage: btwPct,
    totaal: excl,
    volgorde: 0,
  })
  if (regelErr) {
    console.error(`  ${f.factuurnummer}: regel-insert fout: ${regelErr.message}`)
    continue
  }
  // Update factuur totalen (som excl / btw / totaal)
  const { error: updErr } = await supabase.from('facturen')
    .update({ subtotaal: excl, btw_totaal: btwBedrag, totaal: totaalIncl })
    .eq('id', f.id)
  if (updErr) {
    console.error(`  ${f.factuurnummer}: factuur-update fout: ${updErr.message}`)
    continue
  }
  fixed++
  console.log(`  ✓ ${f.factuurnummer}: regel toegevoegd (excl €${excl} + BTW €${btwBedrag} = €${totaalIncl})`)
}
console.log(`\nGefixt: ${fixed} / ${leeg.length}`)
