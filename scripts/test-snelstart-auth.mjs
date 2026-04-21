import { readFileSync } from 'fs'
import { resolve, dirname } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const envPath = resolve(__dirname, '..', '.env.local')
const content = readFileSync(envPath, 'utf-8')
for (const line of content.split('\n')) {
  const match = line.match(/^([^#=]+)=(.*)$/)
  if (match) {
    const key = match[1].trim()
    const val = match[2].trim().replace(/^["']|["']$/g, '')
    if (!process.env[key]) process.env[key] = val
  }
}

const subscriptionKey = process.env.SNELSTART_SUBSCRIPTION_KEY
const clientKey = process.env.SNELSTART_CLIENT_KEY

console.log('Subscription key:', subscriptionKey ? `${subscriptionKey.slice(0, 8)}...` : 'MISSING')
console.log('Client key:', clientKey ? `${clientKey.slice(0, 20)}... (len ${clientKey.length})` : 'MISSING')

const body = new URLSearchParams({
  grant_type: 'clientkey',
  clientkey: clientKey,
})

console.log('\n→ POST https://auth.snelstart.nl/b2b/token')
const res = await fetch('https://auth.snelstart.nl/b2b/token', {
  method: 'POST',
  headers: {
    'Ocp-Apim-Subscription-Key': subscriptionKey,
    'Content-Type': 'application/x-www-form-urlencoded',
  },
  body: body.toString(),
})

console.log('Status:', res.status, res.statusText)
const text = await res.text()
console.log('Response:', text.slice(0, 500))

if (res.ok) {
  const data = JSON.parse(text)
  console.log('\n✓ Auth succesvol, token ontvangen (expires in', data.expires_in, 'sec)')

  // Probeer relaties op te halen
  console.log('\n→ GET /v2/relaties?$top=1')
  const relatieRes = await fetch('https://b2bapi.snelstart.nl/v2/relaties?$top=1', {
    headers: {
      Authorization: `Bearer ${data.access_token}`,
      'Ocp-Apim-Subscription-Key': subscriptionKey,
    },
  })
  console.log('Status:', relatieRes.status, relatieRes.statusText)
  const relatieText = await relatieRes.text()
  console.log('Response:', relatieText.slice(0, 500))
}
