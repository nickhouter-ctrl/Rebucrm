import { createDbClient } from './db.mjs'
import { readFileSync } from 'fs'
import { resolve, dirname } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))

const client = await createDbClient()
const sql = readFileSync(resolve(__dirname, '..', 'supabase/migrations/023_snelstart_sync.sql'), 'utf-8')
await client.query(sql)
console.log('Migration 023 applied.')
await client.end()
