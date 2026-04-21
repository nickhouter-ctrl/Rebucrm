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
const headers = { Authorization: `Bearer ${token}`, 'Ocp-Apim-Subscription-Key': subKey, 'Content-Type':'application/json', Accept:'application/json' }

// Test: zelfde bedragen als gebruiker's test (121 + 181.50 incl → 100 + 150 excl + 52.50 btw = 302.50)
// Maak dummy klant
const klantRes = await fetch('https://b2bapi.snelstart.nl/v2/relaties', {
  method: 'POST', headers,
  body: JSON.stringify({ relatiesoort:['Klant'], naam:'TEST Excl BTW Klant', email:'test-excl@example.invalid' }),
})
const klant = await klantRes.json()
console.log('Klant:', klant.id)

// Haal grootboek 8000
const gb = await (await fetch('https://b2bapi.snelstart.nl/v2/grootboeken?$top=200', { headers })).json()
const g8000 = gb.find(g => g.nummer === 8000)

// Test: bedrag EXCL BTW
const body = {
  factuurNummer: 'TEST-EXCL-' + Date.now(),
  factuurDatum: '2026-04-21',
  boekingsDatum: '2026-04-21',
  vervalDatum: '2026-05-21',
  factuurBedrag: 302.50,
  omschrijving: 'Test excl btw',
  klant: { id: klant.id },
  boekingsregels: [
    { omschrijving:'Kunststof kozijnen leveren', bedrag: 100, grootboek:{id:g8000.id}, btwSoort:'Hoog' },
    { omschrijving:'Bezorgkosten', bedrag: 150, grootboek:{id:g8000.id}, btwSoort:'Hoog' },
  ],
  btw: [{ btwSoort:'VerkopenHoog', btwBedrag: 52.50 }],
}
console.log('\nBody:', JSON.stringify(body, null, 2))
const res = await fetch('https://b2bapi.snelstart.nl/v2/verkoopboekingen', { method:'POST', headers, body: JSON.stringify(body) })
console.log('\nStatus:', res.status)
console.log('Response:', (await res.text()).slice(0, 1500))

// Cleanup — verwijder klant
await fetch(`https://b2bapi.snelstart.nl/v2/relaties/${klant.id}`, { method:'DELETE', headers })
