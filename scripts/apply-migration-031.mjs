import { createDbClient } from './db.mjs'
const c = await createDbClient()
await c.query("ALTER TABLE facturen ADD COLUMN IF NOT EXISTS snelstart_openstaand NUMERIC(12,2);")
console.log('Migratie 031 toegepast')
await c.end()
