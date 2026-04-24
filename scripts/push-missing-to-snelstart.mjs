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
const APP_URL = 'https://rebucrm.vercel.app'
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY

// Alle facturen die via het systeem verstuurd zijn maar nog niet naar SnelStart
const { data: facturen } = await sb
  .from('facturen')
  .select('id, factuurnummer, factuur_type, totaal, status')
  .in('status', ['verzonden', 'deels_betaald', 'vervallen', 'betaald'])
  .not('mollie_payment_id', 'is', null)
  .is('snelstart_boeking_id', null)

console.log(`${facturen?.length ?? 0} facturen missen SnelStart-sync:\n`)
let ok = 0, err = 0
for (const f of facturen || []) {
  process.stdout.write(`  ${f.factuurnummer} (${f.factuur_type || 'standaard'}, €${f.totaal}) ... `)
  try {
    const res = await fetch(`${APP_URL}/api/admin/push-factuur-snelstart`, {
      method: 'POST',
      headers: { 'x-admin-key': KEY, 'Content-Type': 'application/json' },
      body: JSON.stringify({ factuurId: f.id }),
    })
    const json = await res.json()
    if (json.error) {
      console.log(`✗ ${json.error}`)
      err++
    } else {
      console.log(`✓ ${json.result?.boekingId ? 'boeking=' + json.result.boekingId.slice(0, 8) : 'ok'}`)
      ok++
    }
  } catch (e) {
    console.log(`✗ ${e.message}`)
    err++
  }
}
console.log(`\n${ok} gepushed, ${err} fouten`)
