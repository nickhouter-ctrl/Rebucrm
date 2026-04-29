import { readFileSync } from 'fs'
import { resolve, dirname } from 'path'
import { fileURLToPath } from 'url'
import { createSupabaseAdmin } from './db.mjs'

const __dirname = dirname(fileURLToPath(import.meta.url))
try {
  const envPath = resolve(__dirname, '..', '.env.local')
  for (const line of readFileSync(envPath, 'utf-8').split('\n')) {
    const m = line.match(/^([^#=]+)=(.*)$/)
    if (m) { const k = m[1].trim(); const v = m[2].trim().replace(/^["']|["']$/g, ''); if (!process.env[k]) process.env[k] = v }
  }
} catch {}

const sb = await createSupabaseAdmin()
const NICK_HOUTER_MW = '2f63114e-fa21-44bf-b814-d74f937c2b7f'
const { data: mw } = await sb.from('medewerkers').select('id, profiel_id').eq('id', NICK_HOUTER_MW).single()
const NICK_HOUTER = mw.profiel_id || NICK_HOUTER_MW
console.log(`medewerker.id=${NICK_HOUTER_MW} profiel_id=${mw.profiel_id}\n`)

const { data: dups1 } = await sb.from('taken')
  .select('id, titel, deadline, status, created_at, relatie_id, omschrijving')
  .or(`medewerker_id.eq.${NICK_HOUTER_MW},toegewezen_aan.eq.${NICK_HOUTER}`)
  .ilike('titel', 'GG: morgen opbellen')
  .neq('status', 'afgerond')
console.log('=== "GG: morgen opbellen" ===')
for (const t of dups1) {
  console.log(`  ${t.id.slice(0, 8)} created=${t.created_at?.slice(0, 10)} deadline=${t.deadline || '—'} relatie=${t.relatie_id || '—'} omschrijving="${t.omschrijving || ''}"`)
}

const { data: dups2 } = await sb.from('taken')
  .select('id, titel, deadline, status, created_at, relatie_id, omschrijving')
  .or(`medewerker_id.eq.${NICK_HOUTER_MW},toegewezen_aan.eq.${NICK_HOUTER}`)
  .ilike('titel', 'Opvolgen')
  .neq('status', 'afgerond')
console.log('\n=== "Opvolgen" ===')
for (const t of dups2) {
  console.log(`  ${t.id.slice(0, 8)} created=${t.created_at?.slice(0, 10)} deadline=${t.deadline || '—'} relatie=${t.relatie_id || '—'} omschrijving="${t.omschrijving || ''}"`)
}
