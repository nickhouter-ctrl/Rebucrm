import { readFileSync } from 'fs'
import { resolve, dirname } from 'path'
import { fileURLToPath } from 'url'
import { createSupabaseAdmin } from './db.mjs'

const __dirname = dirname(fileURLToPath(import.meta.url))
try {
  const envPath = resolve(__dirname, '..', '.env.local')
  for (const line of readFileSync(envPath, 'utf-8').split('\n')) {
    const m = line.match(/^([^#=]+)=(.*)$/)
    if (m) {
      const k = m[1].trim()
      const v = m[2].trim().replace(/^["']|["']$/g, '')
      if (!process.env[k]) process.env[k] = v
    }
  }
} catch {}

const sb = await createSupabaseAdmin()
const { data: admin } = await sb.from('administraties').select('id, naam').ilike('naam', '%Rebu%').single()
console.log('Administratie:', admin)

const { count: totaal } = await sb.from('projecten').select('id', { count: 'exact', head: true }).eq('administratie_id', admin.id)
console.log('Totaal projecten:', totaal)

const { data: sample } = await sb.from('projecten').select('*').eq('administratie_id', admin.id).limit(3)
console.log('Sample:', JSON.stringify(sample, null, 2))

const { data: statussen } = await sb.from('projecten').select('status').eq('administratie_id', admin.id)
const counts = {}
for (const s of (statussen || [])) counts[s.status || 'null'] = (counts[s.status || 'null'] || 0) + 1
console.log('Status verdeling:', counts)
