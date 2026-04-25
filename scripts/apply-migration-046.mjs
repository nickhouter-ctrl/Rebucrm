import { readFileSync } from 'fs'
import { resolve, dirname } from 'path'
import { fileURLToPath } from 'url'
import { createDbClient } from './db.mjs'

const __dirname = dirname(fileURLToPath(import.meta.url))
const sqlPath = resolve(__dirname, '..', 'supabase', 'migrations', '046_leverancier_registry.sql')
const sql = readFileSync(sqlPath, 'utf-8')

const c = await createDbClient()
try {
  await c.query(sql)
  console.log('Migration 046 applied: bekende_leveranciers + leverancier_detectie_log')
  const r = await c.query('SELECT naam, display_naam FROM bekende_leveranciers ORDER BY display_naam')
  console.log('Geseede leveranciers:')
  for (const row of r.rows) console.log(` - ${row.naam}: ${row.display_naam}`)
} catch (err) {
  console.error('Migration failed:', err.message)
  process.exit(1)
} finally {
  await c.end()
}
