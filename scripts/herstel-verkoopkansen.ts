/**
 * Eenmalig: zet de 7 verkoopkansen weer terug op 'afgerond' (de gebruiker
 * bevestigt dat de oorspronkelijke handmatige archivering correct was).
 */
import { createClient } from '@supabase/supabase-js'
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } })

const teArchiveren = [
  { id: '3ed82d08-b071-4c82-98d5-bde51e1a4dee', label: 'Aannemingsbedrijf J.G. Schaaf B.V. — Vliet' },
  { id: 'c7c3804e-dbc1-4fda-9a1f-fc0e2f15eb57', label: 'Benjamin van Vliet — Sint Jansteen' },
  { id: 'cfbb0870-d13f-4c4b-84bf-08ac39261f09', label: 'timmerbedrijf john de lange vof — offerte aanvraag' },
  { id: 'b25b45ab-3cd7-4064-a5ed-ce53c92e7839', label: 'MK timmer en onderhoud — aanvraag Michael' },
  { id: '4d17ae5d-5552-46d4-bc4a-e21849e1eeb8', label: 'Jal bouw en interieur bv — tulpenburg 37 Amstelveen' },
  { id: '4cd6d690-9058-43e7-9401-e527e0cdb4cd', label: 'Andy Stoutenburg — aanbouw' },
  { id: 'f5272235-6a42-4105-a957-86cf4b4931b9', label: 'Bouwbedrijf M. Geerlofs — offerte Kirsten' },
]

async function main() {
  console.log(`Zetten van ${teArchiveren.length} verkoopkansen terug op 'afgerond'...\n`)
  let ok = 0
  let fail = 0
  for (const p of teArchiveren) {
    const { error } = await sb
      .from('projecten')
      .update({ status: 'afgerond', updated_at: new Date().toISOString() })
      .eq('id', p.id)
      .eq('status', 'actief')  // veiligheid: alleen update als hij nu actief staat
    if (error) {
      console.log(`❌  ${p.label}  —  ${error.message}`)
      fail++
    } else {
      console.log(`✓   ${p.label}`)
      ok++
    }
  }
  console.log(`\nKlaar: ${ok} terug op afgerond, ${fail} mislukt.`)
}

main().catch(e => { console.error(e); process.exit(1) })
