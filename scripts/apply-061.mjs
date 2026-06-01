import { createDbClient } from './db.mjs'
import fs from 'fs'
const c = await createDbClient()
await c.query(fs.readFileSync('./supabase/migrations/061_vrije_dagen.sql', 'utf-8'))
console.log('Migratie 061 toegepast (vrije_dagen)')
await c.end()
