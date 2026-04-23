import { createDbClient } from './db.mjs'
const c = await createDbClient()
await c.query("ALTER TABLE ai_tekening_template ADD COLUMN IF NOT EXISTS remove_regions_pct jsonb;")
console.log('Migration 034 applied')
await c.end()
