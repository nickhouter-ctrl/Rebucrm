import { createDbClient } from './db.mjs'
import { readFileSync } from 'fs'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'

const __dirname = dirname(fileURLToPath(import.meta.url))
const sql = readFileSync(join(__dirname, '..', 'supabase', 'migrations', '056_taak_notities_update_policy.sql'), 'utf8')

const c = await createDbClient()
await c.query(sql)
console.log('Migratie 056 toegepast: UPDATE policy op taak_notities')
await c.end()
