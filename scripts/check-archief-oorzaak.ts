/**
 * Onderzoekt of de 7 verkoopkansen handmatig of automatisch zijn afgearchiveerd
 * door de audit_log te bevragen voor het tijdvenster rond de archiveerdatum.
 */
import { createClient } from '@supabase/supabase-js'
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } })

const ids = [
  '3ed82d08-b071-4c82-98d5-bde51e1a4dee',  // Schaaf - Vliet
  'c7c3804e-dbc1-4fda-9a1f-fc0e2f15eb57',  // Sint Jansteen
  'cfbb0870-d13f-4c4b-84bf-08ac39261f09',  // john de lange
  'b25b45ab-3cd7-4064-a5ed-ce53c92e7839',  // MK timmer
  '4d17ae5d-5552-46d4-bc4a-e21849e1eeb8',  // Jal bouw
  '4cd6d690-9058-43e7-9401-e527e0cdb4cd',  // Stoutenburg
  'f5272235-6a42-4105-a957-86cf4b4931b9',  // Geerlofs
  // En de 2 die we niet hersteld hebben:
  '462cc9c0-c08a-46eb-b4e0-9376d46f3c6a',  // D. Horn
  '3f5841fe-41d3-458f-ab7f-451493880353',  // v.d. Wiel
]

async function main() {
  console.log('=== Audit-log voor de 9 verdachte projecten ===\n')

  for (const id of ids) {
    const { data: entries } = await sb
      .from('audit_log')
      .select('created_at, user_email, actie, details')
      .eq('entiteit_id', id)
      .order('created_at', { ascending: true })

    console.log(`Project ${id}:`)
    if (!entries || entries.length === 0) {
      console.log('  (geen audit-entries)')
    } else {
      for (const e of entries) {
        console.log(`  ${e.created_at}  ${e.user_email || '(systeem)'}  ${e.actie}  ${JSON.stringify(e.details).slice(0, 200)}`)
      }
    }
    console.log('')
  }

  // Daarnaast: brede zoektocht naar ALLE audit-entries op 23-24 april
  // (de dagen waarop deze projecten zijn gearchiveerd). Mogelijk zien we
  // daar een batch-pattern.
  console.log('=== Alle audit-entries op 23-24 april 2026 (rond archiveerdatum) ===\n')
  const { data: alleApril } = await sb
    .from('audit_log')
    .select('created_at, user_email, actie, entiteit_type, entiteit_id, details')
    .gte('created_at', '2026-04-23T00:00:00Z')
    .lt('created_at', '2026-04-25T00:00:00Z')
    .order('created_at', { ascending: true })
    .limit(100)

  if (!alleApril || alleApril.length === 0) {
    console.log('Geen audit-entries op die data — wijst op DB-level mutaties zonder audit (handmatig in DB / oude code zonder audit).')
  } else {
    console.log(`${alleApril.length} entries:`)
    for (const e of alleApril) {
      console.log(`  ${e.created_at}  ${e.user_email || '(systeem)'}  ${e.actie}  ${e.entiteit_type}/${e.entiteit_id?.slice(0, 8)}`)
    }
  }
}

main().catch(e => { console.error(e); process.exit(1) })
