import { createDbClient } from './db.mjs'
const c = await createDbClient()
await c.query(`ALTER TABLE facturen DROP CONSTRAINT IF EXISTS facturen_factuur_type_check;
ALTER TABLE facturen ADD CONSTRAINT facturen_factuur_type_check CHECK (factuur_type IN ('volledig', 'aanbetaling', 'restbetaling', 'credit'));`)
console.log('factuur_type constraint uitgebreid met "credit"')
await c.end()
