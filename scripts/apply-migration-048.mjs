import { readFileSync } from 'fs'
import { resolve, dirname } from 'path'
import { fileURLToPath } from 'url'
import { createDbClient } from './db.mjs'

const __dirname = dirname(fileURLToPath(import.meta.url))
const sqlPath = resolve(__dirname, '..', 'supabase', 'migrations', '048_leverancier_prijs_correcties.sql')
const sql = readFileSync(sqlPath, 'utf-8')

const c = await createDbClient()
try {
  await c.query(sql)
  console.log('Migration 048 applied: leverancier_prijs_correctie')
} catch (err) {
  console.error('Migration failed:', err.message)
  process.exit(1)
} finally {
  await c.end()
}
