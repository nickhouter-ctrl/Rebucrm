import { createSupabaseAdmin } from './db.mjs'

const supa = await createSupabaseAdmin()

// Laatste 10 facturen aangemaakt vandaag
const vandaag = new Date().toISOString().split('T')[0]
const { data: facturen } = await supa
  .from('facturen')
  .select('id, factuurnummer, status, datum, totaal, snelstart_boeking_id, snelstart_synced_at, created_at, relatie_id')
  .gte('created_at', vandaag)
  .order('created_at', { ascending: false })
  .limit(10)

console.log('\n=== Facturen van vandaag ===')
for (const f of facturen || []) {
  console.log({
    nummer: f.factuurnummer,
    status: f.status,
    totaal: f.totaal,
    created: f.created_at,
    sync: f.snelstart_synced_at,
    boekingId: f.snelstart_boeking_id,
  })
}

// Laatste email logs voor facturen
const { data: logs } = await supa
  .from('email_log')
  .select('id, factuur_id, aan, verstuurd_op, onderwerp')
  .gte('verstuurd_op', vandaag)
  .order('verstuurd_op', { ascending: false })
  .limit(10)

console.log('\n=== Email logs vandaag ===')
for (const l of logs || []) {
  console.log({ aan: l.aan, onderwerp: l.onderwerp, factuurId: l.factuur_id, tijd: l.verstuurd_op })
}
