import { createSupabaseAdmin } from './db.mjs'
import { readFileSync } from 'fs'
import { resolve, dirname } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const envPath = resolve(__dirname, '..', '.env.local')
const content = readFileSync(envPath, 'utf-8')
for (const line of content.split('\n')) {
  const m = line.match(/^([^#=]+)=(.*)$/)
  if (m) { const k=m[1].trim(), v=m[2].trim().replace(/^["']|["']$/g,''); if (!process.env[k]) process.env[k]=v }
}

const sub = process.env.SNELSTART_SUBSCRIPTION_KEY
const ck = process.env.SNELSTART_CLIENT_KEY
const a = await fetch('https://auth.snelstart.nl/b2b/token', { method:'POST', headers:{'Ocp-Apim-Subscription-Key':sub,'Content-Type':'application/x-www-form-urlencoded'}, body: new URLSearchParams({grant_type:'clientkey',clientkey:ck}).toString() })
const { access_token: t } = await a.json()
const h = { Authorization: 'Bearer '+t, 'Ocp-Apim-Subscription-Key': sub, Accept:'application/json','Content-Type':'application/json' }

const supa = await createSupabaseAdmin()

// 1. Verwijder F-2026-00168 uit SnelStart (was concept, niet verstuurd)
console.log('Delete F-2026-00168 uit SnelStart (was concept):')
const del = await fetch('https://b2bapi.snelstart.nl/v2/verkoopboekingen/0bd661aa-70e7-46b8-bf84-e53a35655079', { method:'DELETE', headers:h })
console.log('  →', del.status, await del.text())

// Reset sync markers op F-2026-00168
await supa.from('facturen').update({ snelstart_boeking_id: null, snelstart_synced_at: null }).eq('factuurnummer', 'F-2026-00168')
console.log('  DB sync markers gereset')

// 2. Check details van F-2026-00167 om BTW te verifiëren
console.log('\nCheck F-2026-00167 (boeking f7a0100d):')
const check = await fetch('https://b2bapi.snelstart.nl/v2/verkoopboekingen/f7a0100d-495f-4f1b-bac3-3186af5f06da', { headers:h })
const checkText = await check.text()
console.log('  status:', check.status)
console.log('  body:', checkText.slice(0, 1500))
