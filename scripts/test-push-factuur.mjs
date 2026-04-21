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

const subKey = process.env.SNELSTART_SUBSCRIPTION_KEY
const clientKey = process.env.SNELSTART_CLIENT_KEY

// Auth
const authRes = await fetch('https://auth.snelstart.nl/b2b/token', {
  method: 'POST',
  headers: { 'Ocp-Apim-Subscription-Key': subKey, 'Content-Type': 'application/x-www-form-urlencoded' },
  body: new URLSearchParams({ grant_type: 'clientkey', clientkey: clientKey }).toString(),
})
const { access_token: token } = await authRes.json()
const headers = { Authorization: `Bearer ${token}`, 'Ocp-Apim-Subscription-Key': subKey, 'Content-Type': 'application/json', Accept: 'application/json' }
console.log('✓ Auth OK')

// Fetch factuur
const supa = await createSupabaseAdmin()
const { data: facturen } = await supa
  .from('facturen')
  .select('*, relatie:relaties(*), regels:factuur_regels(*)')
  .is('snelstart_boeking_id', null)
  .is('snelstart_synced_at', null)
  .order('created_at', { ascending: false })
  .limit(1)

const factuur = facturen?.[0]
if (!factuur) { console.log('Geen factuur zonder sync gevonden'); process.exit(0) }

console.log('Factuur:', factuur.factuurnummer, 'relatie:', factuur.relatie.bedrijfsnaam)

// Fetch grootboeken
const gbRes = await fetch('https://b2bapi.snelstart.nl/v2/grootboeken?$top=200', { headers })
const grootboeken = await gbRes.json()
const omzet = grootboeken.find(g => g.nummer >= 8000 && g.nummer < 9000)
console.log('Omzet grootboek:', omzet?.nummer, omzet?.omschrijving, omzet?.id)

// Fetch btw tarieven
const btwRes = await fetch('https://b2bapi.snelstart.nl/v2/btwtarieven', { headers })
const btwTarieven = await btwRes.json()
console.log('BTW tarieven raw:', JSON.stringify(btwTarieven).slice(0,1000))

// Boekingsregels gebruiken simple soort (Hoog/Laag/Geen); btw-array gebruikt Verkopen-prefix
const getBtwSoort = (pct) => {
  if (pct === 0) return 'Geen'
  if (pct === 21) return 'Hoog'
  if (pct === 9) return 'Laag'
  return 'Geen'
}
const getBtwSoortVerkopen = (pct) => {
  if (pct === 21) return 'VerkopenHoog'
  if (pct === 9) return 'VerkopenLaag'
  return null
}
console.log('BTW soort mapping: 21% →', getBtwSoort(21))

// Ook beter omzet-grootboek vinden (8000 reeks, niet 8199 vrijgestelde)
const omzetVoorkeur = grootboeken.find(g => g.nummer === 8000) || grootboeken.find(g => g.nummer >= 8000 && g.nummer < 8100)
if (omzetVoorkeur) {
  console.log('Gebruik alternatief omzet grootboek:', omzetVoorkeur.nummer, omzetVoorkeur.omschrijving)
  omzet.id = omzetVoorkeur.id
  omzet.nummer = omzetVoorkeur.nummer
  omzet.omschrijving = omzetVoorkeur.omschrijving
}

// Find or create relatie
const email = factuur.relatie.email
let relatieId = null
if (email) {
  const filter = encodeURIComponent(`email eq '${email.replace(/'/g, "''")}'`)
  const r = await fetch(`https://b2bapi.snelstart.nl/v2/relaties?$filter=${filter}&$top=1`, { headers })
  const list = await r.json()
  if (list.length > 0) {
    relatieId = list[0].id
    console.log('✓ Bestaande relatie gevonden:', list[0].naam, relatieId.slice(0,8))
  }
}
if (!relatieId) {
  const createBody = {
    relatiesoort: ['Klant'],
    naam: factuur.relatie.bedrijfsnaam,
    ...(email ? { email } : {}),
  }
  if (factuur.relatie.adres || factuur.relatie.postcode || factuur.relatie.plaats || factuur.relatie.contactpersoon) {
    createBody.vestigingsAdres = {
      contactpersoon: factuur.relatie.contactpersoon || undefined,
      straat: factuur.relatie.adres || undefined,
      postcode: factuur.relatie.postcode || undefined,
      plaats: factuur.relatie.plaats || undefined,
      landISOCode: 'NL',
    }
  }
  const cr = await fetch('https://b2bapi.snelstart.nl/v2/relaties', { method: 'POST', headers, body: JSON.stringify(createBody) })
  const crText = await cr.text()
  if (!cr.ok) { console.error('Relatie aanmaken faalde:', cr.status, crText); process.exit(1) }
  const created = JSON.parse(crText)
  relatieId = created.id
  console.log('✓ Relatie aangemaakt:', created.naam, relatieId.slice(0,8))
}

// Build verkoopboeking
const boekingsregels = factuur.regels.map(r => {
  const excl = Number((Number(r.aantal) * Number(r.prijs)).toFixed(2))
  const pct = Number(r.btw_percentage)
  return {
    omschrijving: r.omschrijving.slice(0, 200),
    bedrag: excl,
    grootboek: { id: omzet.id },
    btwSoort: getBtwSoort(pct),
  }
})

// Aggregeer BTW per soort (gebruik VerkopenHoog/Laag/etc)
const btwPerSoort = {}
for (const r of factuur.regels) {
  const pct = Number(r.btw_percentage)
  const soort = getBtwSoortVerkopen(pct)
  if (!soort) continue
  const excl = Number(r.aantal) * Number(r.prijs)
  const btwBedrag = excl * pct / 100
  btwPerSoort[soort] = (btwPerSoort[soort] || 0) + btwBedrag
}
const btw = Object.entries(btwPerSoort).map(([soort, bedrag]) => ({ btwSoort: soort, btwBedrag: Number(bedrag.toFixed(2)) }))

const factuurBedragIncl = Number(factuur.totaal)
const body = {
  factuurNummer: factuur.factuurnummer,
  factuurDatum: factuur.datum,
  boekingsDatum: factuur.datum,
  vervalDatum: factuur.vervaldatum || factuur.datum,
  factuurBedrag: factuurBedragIncl,
  omschrijving: (factuur.onderwerp || factuur.factuurnummer).slice(0, 200),
  klant: { id: relatieId },
  boekingsregels,
  btw,
}

console.log('\nVerkoopboeking body:', JSON.stringify(body, null, 2))

const vbRes = await fetch('https://b2bapi.snelstart.nl/v2/verkoopboekingen', { method: 'POST', headers, body: JSON.stringify(body) })
const vbText = await vbRes.text()
console.log('\nResponse status:', vbRes.status)
console.log('Response body:', vbText.slice(0, 2000))

if (vbRes.ok) {
  const boeking = JSON.parse(vbText)
  await supa.from('facturen').update({ snelstart_boeking_id: boeking.id, snelstart_synced_at: new Date().toISOString() }).eq('id', factuur.id)
  await supa.from('relaties').update({ snelstart_relatie_id: relatieId, snelstart_synced_at: new Date().toISOString() }).eq('id', factuur.relatie.id)
  console.log('\n✓ Factuur succesvol gepusht naar SnelStart')
}
