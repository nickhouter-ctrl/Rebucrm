// Verwijder alle 'Nieuwe aanvraag - offerte nog te maken' taken zodat de
// aanvragen-pagina schoon begint. Daarna komen er alleen aanvragen bij
// die de gebruiker zelf via /email aanmaakt.
import { createSupabaseAdmin } from './db.mjs'

const sb = await createSupabaseAdmin()

const { data: taken, error } = await sb
  .from('taken')
  .select('id, taaknummer, status')
  .eq('titel', 'Nieuwe aanvraag - offerte nog te maken')

if (error) {
  console.error('Ophalen mislukt:', error.message)
  process.exit(1)
}

console.log(`${taken?.length || 0} aanvraag-taken gevonden`)

if (taken && taken.length > 0) {
  const ids = taken.map(t => t.id)
  // Verwijder gerelateerde notities + tijdregistraties als die er zijn
  await sb.from('notities').delete().in('taak_id', ids)
  const { error: delErr } = await sb.from('taken').delete().in('id', ids)
  if (delErr) {
    console.error('Verwijderen mislukt:', delErr.message)
    process.exit(1)
  }
  console.log(`${ids.length} taken verwijderd`)
}
