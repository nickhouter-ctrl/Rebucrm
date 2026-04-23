import { createDbClient } from './db.mjs'
const c = await createDbClient()
await c.query('ALTER TABLE relaties ADD COLUMN IF NOT EXISTS factuur_email TEXT;')
console.log('factuur_email kolom toegevoegd')
await c.end()
