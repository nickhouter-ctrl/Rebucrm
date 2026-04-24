import { createSupabaseAdmin } from './db.mjs'
import { readFileSync } from 'fs'
import { resolve, dirname } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))
try {
  const content = readFileSync(resolve(__dirname, '..', '.env.local'), 'utf-8')
  for (const line of content.split('\n')) {
    const m = line.match(/^([^#=]+)=(.*)$/)
    if (m && !process.env[m[1].trim()]) process.env[m[1].trim()] = m[2].trim().replace(/^["']|["']$/g, '')
  }
} catch {}

const sb = await createSupabaseAdmin()
const { data: rel } = await sb
  .from('relaties')
  .select('id, bedrijfsnaam, email, snelstart_relatie_id')
  .ilike('bedrijfsnaam', '%Steunebrink%')
console.log('Steunebrink relaties:', rel)

// Haal SnelStart token + check relatie soort
const auth = await fetch('https://auth.snelstart.nl/b2b/token', {
  method: 'POST',
  headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
  body: new URLSearchParams({
    grant_type: 'clientcredentials',
    client_key: process.env.SNELSTART_CLIENT_KEY,
    subscription_key: process.env.SNELSTART_SUBSCRIPTION_KEY,
  })
})
const authJson = await auth.json()
const token = authJson.access_token
if (!token) { console.error('Auth failed:', authJson); process.exit(1) }

for (const r of rel || []) {
  if (!r.snelstart_relatie_id) { console.log(`  ${r.bedrijfsnaam}: geen snelstart_relatie_id`); continue }
  const res = await fetch(`https://b2bapi.snelstart.nl/v2/relaties/${r.snelstart_relatie_id}`, {
    headers: {
      'Authorization': `Bearer ${token}`,
      'Ocp-Apim-Subscription-Key': process.env.SNELSTART_SUBSCRIPTION_KEY,
    }
  })
  const json = await res.json()
  console.log(`\n${r.bedrijfsnaam} (${r.snelstart_relatie_id}):`)
  console.log('  naam:', json.naam)
  console.log('  relatiesoort:', json.relatiesoort)
  console.log('  email:', json.email)
}
