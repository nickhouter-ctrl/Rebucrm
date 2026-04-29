import { readFileSync } from 'fs'
import { resolve, dirname } from 'path'
import { fileURLToPath } from 'url'
import { createSupabaseAdmin, createDbClient } from './db.mjs'

const __dirname = dirname(fileURLToPath(import.meta.url))
try {
  const envPath = resolve(__dirname, '..', '.env.local')
  for (const line of readFileSync(envPath, 'utf-8').split('\n')) {
    const m = line.match(/^([^#=]+)=(.*)$/)
    if (m) {
      const k = m[1].trim()
      const v = m[2].trim().replace(/^["']|["']$/g, '')
      if (!process.env[k]) process.env[k] = v
    }
  }
} catch {}

const sb = await createSupabaseAdmin()
const tabellen = [
  'ai_tekening_feedback', 'ai_tekening_template', 'audit_log', 'bekende_leveranciers',
  'leverancier_detectie_log', 'leverancier_prijs_correctie', 'login_audit',
  'offerte_concept_state', 'tfa_codes'
]
const client = await createDbClient()
for (const t of tabellen) {
  const { rows } = await client.query(
    `SELECT column_name FROM information_schema.columns WHERE table_name = $1 AND table_schema = 'public' ORDER BY ordinal_position`,
    [t]
  )
  console.log(`${t}: ${rows.map(r => r.column_name).join(', ')}`)
}
await client.end()
