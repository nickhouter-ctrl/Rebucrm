import XLSX from 'xlsx'
import { createSupabaseAdmin } from '/Users/houterminiopslag/Documents/projects/Rebu/scripts/db.mjs'
const sb = await createSupabaseAdmin()
const { data: admin } = await sb.from('administraties').select('id').ilike('naam', '%Rebu%').single()

const wb = XLSX.readFile('/Users/houterminiopslag/Downloads/Offertes.xlsx')
const tribe = XLSX.utils.sheet_to_json(wb.Sheets['Offertes'], { defval: null })

console.log('=== Tribe rijen met "nijbroek" of "steunebrink" ===')
for (const r of tribe.filter(r => /nijbroek|steunebrink/i.test((r.Onderwerp || '') + ' ' + (r.Relatie_name || '')))) {
  console.log(`  ${r.Nummer} | "${r.Onderwerp}" | ${r.Relatie_name} | €${r.Totaal} | ${r.Fase_Naam_vertaald}`)
}

console.log('\n=== CRM offertes met "nijbroek" of "steunebrink" ===')
const { data } = await sb.from('offertes').select('id, offertenummer, versie_nummer, status, totaal, onderwerp, relatie:relaties(bedrijfsnaam)').eq('administratie_id', admin.id).or('onderwerp.ilike.%nijbroek%,onderwerp.ilike.%steunebrink%').limit(30)
for (const o of data || []) {
  console.log(`  ${o.offertenummer} v${o.versie_nummer} | "${o.onderwerp}" | ${o.relatie?.bedrijfsnaam} | €${o.totaal} | ${o.status}`)
}
