import { createSupabaseAdmin } from './db.mjs'
const sb = await createSupabaseAdmin()
const { data: admin } = await sb.from('administraties').select('id').ilike('naam', '%Rebu%').single()

// Offertes met totaal = 0, status geaccepteerd
const { data: nulOffertes } = await sb.from('offertes')
  .select('id, offertenummer, onderwerp, status, totaal, subtotaal, created_at, relatie:relaties(bedrijfsnaam)')
  .eq('administratie_id', admin.id).eq('status', 'geaccepteerd').eq('totaal', 0).limit(30)

console.log(`Geaccepteerde offertes met totaal=0: ${nulOffertes.length}`)
for (const o of nulOffertes.slice(0, 20)) {
  console.log(`  ${o.offertenummer} | ${o.relatie?.bedrijfsnaam || '-'} | ${o.onderwerp || '-'}`)
}

// Tel totaal
const { count: totaalNul } = await sb.from('offertes')
  .select('id', { count: 'exact', head: true })
  .eq('administratie_id', admin.id).eq('status', 'geaccepteerd').eq('totaal', 0)
console.log(`\nTotaal geaccepteerd met totaal=0: ${totaalNul}`)

// Offertes met regels waar prijs = 0
const { data: regelsNul } = await sb.from('offerte_regels')
  .select('id, offerte_id, omschrijving, aantal, prijs, offerte:offertes(offertenummer, status, administratie_id)')
  .eq('prijs', 0).limit(20)
const relevant = (regelsNul || []).filter(r => r.offerte?.administratie_id === admin.id && ['geaccepteerd', 'verzonden'].includes(r.offerte?.status))
console.log(`\nRegels met prijs=0 (max 20 sample):`)
for (const r of relevant.slice(0, 10)) {
  console.log(`  ${r.offerte?.offertenummer} | "${r.omschrijving}" | ${r.aantal}× €${r.prijs}`)
}
