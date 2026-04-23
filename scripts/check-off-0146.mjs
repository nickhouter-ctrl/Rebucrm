import { createSupabaseAdmin } from './db.mjs'
const sb = await createSupabaseAdmin()
const { data: admin } = await sb.from('administraties').select('id').ilike('naam', '%Rebu%').single()

const { data: offertes } = await sb.from('offertes')
  .select('id, offertenummer, versie_nummer, status, subtotaal, totaal, regels:offerte_regels(id, omschrijving, aantal, prijs)')
  .eq('administratie_id', admin.id).eq('offertenummer', 'OFF-0146')
  .order('versie_nummer', { ascending: false })
console.log(`OFF-0146 versies: ${offertes.length}`)
for (const o of offertes) {
  console.log(`  v${o.versie_nummer} [${o.status}]: ${o.regels.length} regels, totaal €${o.totaal}`)
}

// Check leverancier PDF data
const laatste = offertes[0]
if (laatste) {
  const { data: meta } = await sb.from('documenten').select('storage_path').eq('entiteit_type', 'offerte_leverancier_data').eq('entiteit_id', laatste.id).maybeSingle()
  const { data: parsed } = await sb.from('documenten').select('storage_path').eq('entiteit_type', 'offerte_leverancier_parsed').eq('entiteit_id', laatste.id).maybeSingle()
  console.log(`\nleverancier_data: ${meta ? 'aanwezig' : 'ONTBREEKT'}`)
  console.log(`leverancier_parsed: ${parsed ? 'aanwezig' : 'ONTBREEKT'}`)
  if (meta) {
    try {
      const data = JSON.parse(meta.storage_path)
      console.log(`  marges: ${JSON.stringify(data.marges || {}).slice(0, 100)}`)
      console.log(`  margePercentage: ${data.margePercentage}`)
      console.log(`  prijzen: ${Object.keys(data.prijzen || {}).length} elementen`)
      const totaalMet40 = Object.values(data.prijzen || {}).reduce((s, p) => s + (Number(p.prijs) * Number(p.hoeveelheid) * 1.4), 0)
      console.log(`  SOM met 40% marge: €${totaalMet40.toFixed(2)}`)
    } catch (e) { console.log('parse fout:', e.message) }
  }
}
