import { createDbClient } from './db.mjs'
import fs from 'fs'
const c = await createDbClient()
const sql = fs.readFileSync('./supabase/migrations/059_factuur_geplande_datum.sql', 'utf-8')
await c.query(sql)
console.log('Migratie 059 toegepast (facturen.geplande_datum)')
await c.end()
