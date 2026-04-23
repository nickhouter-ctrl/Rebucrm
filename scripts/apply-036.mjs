import { createDbClient } from './db.mjs'
import fs from 'fs'
const c = await createDbClient()
const sql = fs.readFileSync('./supabase/migrations/036_offerte_archief.sql', 'utf-8')
await c.query(sql)
console.log('Migratie 036 toegepast')
await c.end()
