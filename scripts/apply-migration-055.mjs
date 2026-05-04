import { createDbClient } from './db.mjs'
import { readFileSync } from 'fs'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'

const __dirname = dirname(fileURLToPath(import.meta.url))
const sql = readFileSync(join(__dirname, '..', 'supabase', 'migrations', '055_factuur_aanmaning_stap.sql'), 'utf8')

const c = await createDbClient()
await c.query(sql)
console.log('Migratie 055 toegepast: aanmaning_stap + aanmaning_verstuurd_op')
await c.end()
