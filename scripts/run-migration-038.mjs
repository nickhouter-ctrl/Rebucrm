import { createDbClient } from './db.mjs'
import { readFileSync } from 'fs'
import { resolve, dirname } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const sql = readFileSync(resolve(__dirname, '..', 'supabase/migrations/038_notities_project_id.sql'), 'utf-8')

const client = await createDbClient()
try {
  await client.query(sql)
  console.log('Migration 038 toegepast')
} catch (e) {
  console.error('Fout:', e.message)
  process.exit(1)
} finally {
  await client.end()
}
