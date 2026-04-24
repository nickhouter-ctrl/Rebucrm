import { createDbClient } from './db.mjs'
const c = await createDbClient()
const r = await c.query(`SELECT column_name, data_type FROM information_schema.columns WHERE table_name='email_log' ORDER BY ordinal_position`)
for (const row of r.rows) console.log(`${row.column_name}: ${row.data_type}`)
await c.end()
