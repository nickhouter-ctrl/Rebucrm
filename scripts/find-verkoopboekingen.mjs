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
const h = { Authorization: 'Bearer '+t, 'Ocp-Apim-Subscription-Key': sub, Accept:'application/json', 'Content-Type':'application/json' }

// Probeer verschillende endpoints
for (const p of ['/verkoopboekingen', '/verkopen', '/verkoopfacturen', '/boekingen/verkopen', '/openstaandeDebiteuren', '/openstaandeVerkoopboekingen']) {
  const res = await fetch(`https://b2bapi.snelstart.nl/v2${p}?$top=10`, { headers: h })
  console.log(`${p}: ${res.status}`)
}

// Via klant
const klantId = 'ef1c122c-5c45-42da-b40f-a9548f09063f'
const r = await fetch(`https://b2bapi.snelstart.nl/v2/relaties/${klantId}`, { headers: h })
console.log('\nKlant detail:', (await r.text()).slice(0, 500))

// Haal recent verkoopfacturen op (gesorteerd op datum)
// Zoek specifiek F-2026-00167/168
let found = []
for (let skip = 0; skip < 1000; skip += 100) {
  const vf = await fetch(`https://b2bapi.snelstart.nl/v2/verkoopfacturen?$top=100&$skip=${skip}`, { headers: h })
  const list = await vf.json()
  if (!Array.isArray(list) || list.length === 0) break
  const hits = list.filter(v => ['F-2026-00167','F-2026-00168'].includes(v.factuurnummer))
  found.push(...hits)
  if (list.length < 100) break
}
console.log(`\nGevonden F-2026-00167/168: ${found.length}`)
for (const v of found) {
  console.log(JSON.stringify(v, null, 2))
}
