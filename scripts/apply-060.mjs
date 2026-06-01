import { createDbClient } from './db.mjs'
import fs from 'fs'
const c = await createDbClient()
const sql = fs.readFileSync('./supabase/migrations/060_aanvraag_sla.sql', 'utf-8')
await c.query(sql)
console.log('Migratie 060 toegepast (taken SLA-velden)')
await c.end()
