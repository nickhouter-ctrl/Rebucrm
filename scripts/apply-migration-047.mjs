import { readFileSync } from 'fs'
import { resolve, dirname } from 'path'
import { fileURLToPath } from 'url'
import { createDbClient } from './db.mjs'

const __dirname = dirname(fileURLToPath(import.meta.url))
const sqlPath = resolve(__dirname, '..', 'supabase', 'migrations', '047_offerte_concept_state.sql')
const sql = readFileSync(sqlPath, 'utf-8')

const c = await createDbClient()
try {
  await c.query(sql)
  console.log('Migration 047 applied: offerte_concept_state')
} catch (err) {
  console.error('Migration failed:', err.message)
  process.exit(1)
} finally {
  await c.end()
}
