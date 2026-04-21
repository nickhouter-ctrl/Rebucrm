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

// Scan alle verkoopfacturen en zoek F-2026-00167/00168
let found = []
for (let skip = 0; skip < 2000; skip += 100) {
  const vf = await fetch(`https://b2bapi.snelstart.nl/v2/verkoopfacturen?$top=100&$skip=${skip}`, { headers: h })
  const list = await vf.json()
  if (!Array.isArray(list) || list.length === 0) break
  const hits = list.filter(v => ['F-2026-00167','F-2026-00168'].includes(v.factuurnummer))
  found.push(...hits)
  if (list.length < 100) break
}
console.log(`Verkoopfacturen met F-2026-00167/168: ${found.length}`)
for (const v of found) {
  console.log(` - ${v.factuurnummer} bedrag=${v.factuurBedrag} boekingId=${v.verkoopBoeking?.id}`)
  // Haal boeking op voor BTW details
  const b = await fetch(`https://b2bapi.snelstart.nl/v2/verkoopboekingen/${v.verkoopBoeking.id}`, { headers: h })
  const bj = await b.json()
  console.log(`   regels:`, bj.boekingsregels?.map(r => ({ bedrag: r.bedrag, btwSoort: r.btwSoort })))
  console.log(`   btw:`, bj.btw)
}
