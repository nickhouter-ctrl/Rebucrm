import { createDbClient } from './db.mjs'
import { readFileSync } from 'fs'
import { resolve, dirname } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const sql = readFileSync(resolve(__dirname, '..', 'supabase/migrations/044_fk_cascade_relaties.sql'), 'utf-8')

const client = await createDbClient()
try {
  await client.query(sql)
  console.log('Migration 044 toegepast')
} catch (e) {
  console.error('Fout:', e.message)
  process.exit(1)
} finally {
  await client.end()
}
