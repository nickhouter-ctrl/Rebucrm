import { createDbClient } from './db.mjs'
import fs from 'fs'
const c = await createDbClient()
const sql = fs.readFileSync('./supabase/migrations/032_performance_indexes.sql', 'utf-8')
// Split op ; maar respect NIET comments/lege regels
const statements = sql.split(/;\s*\n/).map(s => s.trim()).filter(s => s && !s.startsWith('--'))
for (const stmt of statements) {
  try {
    await c.query(stmt)
    console.log('✓', stmt.slice(0, 80))
  } catch (e) {
    console.error('✗', stmt.slice(0, 80), '→', e.message)
  }
}
await c.end()
console.log('Migratie 032 klaar.')
