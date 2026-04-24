import { createSupabaseAdmin } from './db.mjs'

const sb = await createSupabaseAdmin()

// Zoek relatie Bouwbedrijf Gebr. Winkelaar in Purmerend
const { data: relatie, error: relErr } = await sb
  .from('relaties')
  .select('id, bedrijfsnaam, plaats, administratie_id')
  .ilike('bedrijfsnaam', '%Winkelaar%')
  .ilike('plaats', '%Purmerend%')
  .maybeSingle()

if (relErr || !relatie) {
  console.error('Relatie niet gevonden:', relErr)
  process.exit(1)
}
console.log(`Relatie gevonden: ${relatie.bedrijfsnaam} (${relatie.id})`)

// Check of de verkoopkans al bestaat
const { data: bestaand } = await sb
  .from('projecten')
  .select('id, naam, status')
  .eq('relatie_id', relatie.id)
  .ilike('naam', '%Burggolf%')

if (bestaand && bestaand.length > 0) {
  console.log('Verkoopkans bestaat al:', bestaand)
  process.exit(0)
}

// Maak de verkoopkans aan
const { data: nieuw, error: insErr } = await sb
  .from('projecten')
  .insert({
    administratie_id: relatie.administratie_id,
    relatie_id: relatie.id,
    naam: 'opvang Burggolf Purmerend',
    status: 'actief',
    bron: 'tribe_import',
    created_at: '2026-04-17T09:37:00Z',
  })
  .select()
  .single()

if (insErr) {
  console.error('Fout:', insErr)
  process.exit(1)
}
console.log('Verkoopkans aangemaakt:', nieuw)
