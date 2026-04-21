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

const subKey = process.env.SNELSTART_SUBSCRIPTION_KEY
const clientKey = process.env.SNELSTART_CLIENT_KEY

const authRes = await fetch('https://auth.snelstart.nl/b2b/token', {
  method: 'POST',
  headers: { 'Ocp-Apim-Subscription-Key': subKey, 'Content-Type': 'application/x-www-form-urlencoded' },
  body: new URLSearchParams({ grant_type: 'clientkey', clientkey: clientKey }).toString(),
})
const { access_token: token } = await authRes.json()
const headers = { Authorization: `Bearer ${token}`, 'Ocp-Apim-Subscription-Key': subKey, Accept: 'application/json' }

// Haal bestaande verkoopboekingen op — probeer verschillende paths
for (const path of ['/verkoopboekingen', '/verkoopFacturen', '/boekingen/verkoop', '/facturen', '/inkoopboekingen']) {
  const res = await fetch(`https://b2bapi.snelstart.nl/v2${path}?$top=1`, { headers })
  const txt = await res.text()
  console.log(`\n=== ${path} (${res.status}) ===`)
  console.log(txt.slice(0, 400))
}
