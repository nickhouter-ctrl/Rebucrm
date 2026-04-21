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
const h = { Authorization: 'Bearer '+t, 'Ocp-Apim-Subscription-Key': sub, Accept:'application/json' }

const r = await fetch('https://b2bapi.snelstart.nl/v2/verkoopboekingen/f7a0100d-495f-4f1b-bac3-3186af5f06da', { headers: h })
console.log(await r.text())
