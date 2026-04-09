import pg from 'pg'
import { readFileSync } from 'fs'
import { resolve, dirname } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))

// Load .env.local
function loadEnv() {
  try {
    const envPath = resolve(__dirname, '..', '.env.local')
    const content = readFileSync(envPath, 'utf-8')
    for (const line of content.split('\n')) {
      const match = line.match(/^([^#=]+)=(.*)$/)
      if (match) {
        const key = match[1].trim()
        const val = match[2].trim().replace(/^["']|["']$/g, '')
        if (!process.env[key]) process.env[key] = val
      }
    }
  } catch {}
}

loadEnv()

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || ''
const projectRef = supabaseUrl.match(/https:\/\/([^.]+)/)?.[1]

export async function createDbClient() {
  const dbPassword = process.env.SUPABASE_DB_PASSWORD
  if (!projectRef || !dbPassword) {
    console.error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_DB_PASSWORD in .env.local')
    process.exit(1)
  }
  const client = new pg.Client({
    host: `db.${projectRef}.supabase.co`,
    port: 5432,
    database: 'postgres',
    user: 'postgres',
    password: dbPassword,
    ssl: { rejectUnauthorized: false },
  })
  await client.connect()
  return client
}

// Supabase JS client met service_role key — voor helper scripts
export async function createSupabaseAdmin() {
  const { createClient } = await import('@supabase/supabase-js')
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !serviceKey) {
    console.error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env.local')
    process.exit(1)
  }
  return createClient(url, serviceKey)
}

export function getProjectRef() {
  return projectRef
}

export function getServiceRoleKey() {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!key) {
    console.error('Missing SUPABASE_SERVICE_ROLE_KEY in .env.local')
    process.exit(1)
  }
  return key
}
