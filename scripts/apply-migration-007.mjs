import { createDbClient } from './db.mjs'
const c = await createDbClient()
await c.query('ALTER TABLE facturen ADD COLUMN IF NOT EXISTS mollie_payment_id text;')
await c.query('ALTER TABLE facturen ADD COLUMN IF NOT EXISTS betaal_link text;')
await c.query('CREATE INDEX IF NOT EXISTS idx_facturen_mollie_payment_id ON facturen(mollie_payment_id);')
console.log('Migratie 007 (Mollie) alsnog toegepast')
await c.end()
