import { readFileSync } from 'fs'
import { resolve, dirname } from 'path'
import { fileURLToPath } from 'url'
import { createDbClient } from './db.mjs'

const __dirname = dirname(fileURLToPath(import.meta.url))
const sql = readFileSync(resolve(__dirname, '..', 'supabase', 'migrations', '051_security_advisor_warnings.sql'), 'utf-8')

const client = await createDbClient()
try {
  await client.query('BEGIN')
  await client.query(sql)
  await client.query('COMMIT')
  console.log('Migration 051 succesvol toegepast.')
} catch (e) {
  await client.query('ROLLBACK').catch(() => {})
  console.error('Migration faalde:', e.message)
  process.exit(1)
} finally {
  await client.end()
}
