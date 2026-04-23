import { createDbClient } from './db.mjs'
import fs from 'fs'
const c = await createDbClient()
const sql = fs.readFileSync('./supabase/migrations/033_ai_tekening_feedback.sql', 'utf-8')
await c.query(sql)
console.log('Migratie 033 toegepast')
await c.end()
