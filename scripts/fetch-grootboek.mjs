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
const authRes = await fetch('https://auth.snelstart.nl/b2b/token', { method:'POST', headers:{'Ocp-Apim-Subscription-Key':subKey,'Content-Type':'application/x-www-form-urlencoded'}, body: new URLSearchParams({grant_type:'clientkey',clientkey:clientKey}).toString() })
const { access_token: token } = await authRes.json()
const headers = { Authorization: `Bearer ${token}`, 'Ocp-Apim-Subscription-Key': subKey, Accept: 'application/json' }

// Alle omzet grootboeken
const res = await fetch('https://b2bapi.snelstart.nl/v2/grootboeken?$top=200', { headers })
const list = await res.json()
const omzet = list.filter(g => g.nummer >= 8000 && g.nummer < 9000)
console.log('Omzet grootboeken:')
for (const g of omzet) console.log(` - ${g.nummer} ${g.omschrijving} (btwSoort=${g.btwSoort || 'geen'}, id=${g.id.slice(0,8)})`)

// BTW grootboeken zoeken (1500-serie meestal)
const btwGrootboeken = list.filter(g => /btw/i.test(g.omschrijving))
console.log('\nBTW grootboeken:')
for (const g of btwGrootboeken) console.log(` - ${g.nummer} ${g.omschrijving} (btwSoort=${g.btwSoort || 'geen'}, id=${g.id.slice(0,8)})`)

// Debiteuren
const debiteuren = list.filter(g => /debiteur/i.test(g.omschrijving))
console.log('\nDebiteuren:')
for (const g of debiteuren) console.log(` - ${g.nummer} ${g.omschrijving} (id=${g.id.slice(0,8)})`)

// Print een grootboek volledig als voorbeeld
console.log('\nVoorbeeld grootboek 8000:')
console.log(JSON.stringify(list.find(g => g.nummer === 8000), null, 2))
