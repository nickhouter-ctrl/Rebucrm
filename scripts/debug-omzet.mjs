import { createSupabaseAdmin } from './db.mjs'

const supabase = await createSupabaseAdmin()
const { data: admin } = await supabase.from('administraties').select('id').ilike('naam', '%Rebu%').single()
const adminId = admin.id

// Haal alle april 2026 facturen op
const { data: aprilFacturen } = await supabase
  .from('facturen')
  .select('id, factuurnummer, datum, totaal, status, onderwerp, factuur_type, offerte_id, relatie:relaties(bedrijfsnaam)')
  .eq('administratie_id', adminId)
  .gte('datum', '2026-04-01')
  .lte('datum', '2026-04-30')
  .neq('status', 'concept')
  .order('datum', { ascending: true })

console.log(`April 2026 facturen: ${aprilFacturen.length}`)

let totaal = 0
let vanImport = 0
let vanSysteem = 0
let importBedrag = 0
let systeemBedrag = 0

for (const f of aprilFacturen) {
  totaal += f.totaal || 0
  if (f.offerte_id) {
    vanSysteem++
    systeemBedrag += f.totaal || 0
  } else {
    vanImport++
    importBedrag += f.totaal || 0
  }
}

console.log(`\nTotaal: €${totaal.toFixed(2)}`)
console.log(`Van import (geen offerte_id): ${vanImport} facturen, €${importBedrag.toFixed(2)}`)
console.log(`Van systeem (met offerte_id): ${vanSysteem} facturen, €${systeemBedrag.toFixed(2)}`)
console.log(`\nTribe zegt: €86.006,30`)
console.log(`Verschil: €${(totaal - 86006.30).toFixed(2)}`)

// Toon de systeem-facturen (die niet uit de import komen)
if (vanSysteem > 0) {
  console.log('\n--- Systeem-facturen (niet uit import) ---')
  for (const f of aprilFacturen.filter(f => f.offerte_id)) {
    console.log(`  ${f.factuurnummer} | €${(f.totaal || 0).toFixed(2)} | ${f.status} | ${f.datum} | ${f.relatie?.bedrijfsnaam || '-'}`)
  }
}

// Check ook: staan er dubbele factuurnummers?
const nummers = aprilFacturen.map(f => f.factuurnummer)
const dubbel = nummers.filter((n, i) => nummers.indexOf(n) !== i)
if (dubbel.length > 0) {
  console.log('\n--- DUBBELE factuurnummers! ---')
  for (const d of [...new Set(dubbel)]) {
    const matches = aprilFacturen.filter(f => f.factuurnummer === d)
    console.log(`  ${d}: ${matches.length}x, totaal €${matches.reduce((s, f) => s + (f.totaal || 0), 0).toFixed(2)}`)
    for (const m of matches) {
      console.log(`    id: ${m.id} | offerte_id: ${m.offerte_id ? 'ja' : 'nee'} | €${(m.totaal || 0).toFixed(2)}`)
    }
  }
}
