import { createDbClient } from './db.mjs'
import fs from 'fs'
const c = await createDbClient()
await c.query(fs.readFileSync('./supabase/migrations/062_relatie_vaste_klant.sql', 'utf-8'))
console.log('Migratie 062 toegepast (relaties.vaste_klant)')
await c.end()
