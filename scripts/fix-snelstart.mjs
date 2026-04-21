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
const authRes = await fetch('https://auth.snelstart.nl/b2b/token', { method:'POST', headers:{'Ocp-Apim-Subscription-Key':subKey,'Content-Type':'application/x-www-form-urlencoded'}, body: new URLSearchParams({grant_type:'clientkey',clientkey:clientKey}).toString() })
const { access_token: token } = await authRes.json()
const headers = { Authorization: `Bearer ${token}`, 'Ocp-Apim-Subscription-Key': subKey, 'Content-Type':'application/json', Accept:'application/json' }
const supa = await createSupabaseAdmin()

console.log('=== STAP 1: verwijder TEST klant + boeking uit SnelStart ===')
// Scan verkoopboekingen (alleen huidige periode) en verwijder TEST-prefix
const boekRes = await fetch('https://b2bapi.snelstart.nl/v2/verkoopboekingen?$top=50', { headers })
const boekText = await boekRes.text()
console.log('Boeking GET response:', boekText.slice(0, 300))

// De eerder aangemaakte TEST boeking hadden we in test-push-excl.mjs gemaakt — laat die schoonmaken via klanten-ID
// We weten: TEST klant wordt direct verwijderd na aanmaak in test-push-excl.mjs
// Maar de verkoopboeking blijft — deze zou aan een (nu verwijderde) klant gelinkt zijn

// Alle relaties ophalen en TEST-prefix filteren (POST-first, GET faalde eerder)
const allRes = await fetch('https://b2bapi.snelstart.nl/v2/relaties?$top=50', { headers })
const allList = await allRes.json()
const testRelaties = (Array.isArray(allList) ? allList : []).filter(r => /^TEST /i.test(r.naam || ''))
for (const r of testRelaties) {
  const del = await fetch(`https://b2bapi.snelstart.nl/v2/relaties/${r.id}`, { method:'DELETE', headers })
  console.log(`  klant "${r.naam}" (${r.id.slice(0,8)}) → ${del.status}`)
}

console.log('\n=== STAP 2: verwijder foutieve boeking F-2026-00168 (7b001864) ===')
const del168 = await fetch('https://b2bapi.snelstart.nl/v2/verkoopboekingen/7b001864-f1a3-4790-be94-8d8fcfe5bb4d', { method:'DELETE', headers })
console.log('  → ', del168.status, await del168.text())

console.log('\n=== STAP 3: reset sync markers op F-2026-00167 en 00168 ===')
await supa.from('facturen').update({ snelstart_boeking_id: null, snelstart_synced_at: null }).in('factuurnummer', ['F-2026-00167','F-2026-00168'])

console.log('\n=== STAP 4: push beide facturen correct ===')
const { data: facturen } = await supa
  .from('facturen')
  .select('*, relatie:relaties(*), regels:factuur_regels(*)')
  .in('factuurnummer', ['F-2026-00167','F-2026-00168'])
  .order('factuurnummer')

// Grootboeken ophalen
const gb = await (await fetch('https://b2bapi.snelstart.nl/v2/grootboeken?$top=200', { headers })).json()
const g = {
  Hoog: gb.find(x => x.nummer === 8000),
  Laag: gb.find(x => x.nummer === 8110),
  Geen: gb.find(x => x.nummer === 8199),
}

const getSoort = (pct) => pct === 21 ? 'Hoog' : pct === 9 ? 'Laag' : 'Geen'
const getVerkopen = (pct) => pct === 21 ? 'VerkopenHoog' : pct === 9 ? 'VerkopenLaag' : null

for (const f of facturen || []) {
  // Zoek/maak relatie
  let relatieId = f.relatie.snelstart_relatie_id
  if (!relatieId) {
    const em = f.relatie.email
    if (em) {
      const ff = encodeURIComponent(`email eq '${em.replace(/'/g,"''")}'`)
      const rlist = await (await fetch(`https://b2bapi.snelstart.nl/v2/relaties?$filter=${ff}&$top=1`, { headers })).json()
      if (rlist.length > 0) relatieId = rlist[0].id
    }
    if (!relatieId) {
      const body = { relatiesoort:['Klant'], naam: f.relatie.bedrijfsnaam, ...(em ? { email: em } : {}) }
      if (f.relatie.adres || f.relatie.postcode || f.relatie.plaats) {
        body.vestigingsAdres = { contactpersoon: f.relatie.contactpersoon || undefined, straat: f.relatie.adres || undefined, postcode: f.relatie.postcode || undefined, plaats: f.relatie.plaats || undefined, landISOCode:'NL' }
      }
      const created = await (await fetch('https://b2bapi.snelstart.nl/v2/relaties', { method:'POST', headers, body: JSON.stringify(body) })).json()
      relatieId = created.id
    }
    await supa.from('relaties').update({ snelstart_relatie_id: relatieId, snelstart_synced_at: new Date().toISOString() }).eq('id', f.relatie.id)
  }

  // Boekingsregels (EXCL BTW)
  const regels = f.regels.map(r => {
    const excl = Number((Number(r.aantal) * Number(r.prijs)).toFixed(2))
    const soort = getSoort(Number(r.btw_percentage))
    return { omschrijving: r.omschrijving.slice(0,200), bedrag: excl, grootboek: { id: g[soort].id }, btwSoort: soort }
  })

  // BTW array met btwBedrag veld
  const btwMap = {}
  let totaal = 0
  for (const r of f.regels) {
    const excl = Number(r.aantal) * Number(r.prijs)
    const btwBedrag = excl * Number(r.btw_percentage) / 100
    totaal += excl + btwBedrag
    const v = getVerkopen(Number(r.btw_percentage))
    if (v) btwMap[v] = (btwMap[v] || 0) + btwBedrag
  }
  const btw = Object.entries(btwMap).map(([s,b]) => ({ btwSoort: s, btwBedrag: Number(b.toFixed(2)) }))

  const body = {
    factuurNummer: f.factuurnummer,
    factuurDatum: f.datum,
    boekingsDatum: f.datum,
    vervalDatum: f.vervaldatum || f.datum,
    factuurBedrag: Number(totaal.toFixed(2)),
    omschrijving: (f.onderwerp || f.factuurnummer).slice(0,200),
    klant: { id: relatieId },
    boekingsregels: regels,
    btw,
  }

  const res = await fetch('https://b2bapi.snelstart.nl/v2/verkoopboekingen', { method:'POST', headers, body: JSON.stringify(body) })
  const text = await res.text()
  if (res.status === 201) {
    const boeking = JSON.parse(text)
    await supa.from('facturen').update({ snelstart_boeking_id: boeking.id, snelstart_synced_at: new Date().toISOString() }).eq('id', f.id)
    console.log(`  ✓ ${f.factuurnummer} → boeking ${boeking.id}`)
  } else {
    console.error(`  ✗ ${f.factuurnummer}: status ${res.status} — ${text.slice(0, 300)}`)
  }
}

console.log('\n✓ Opgeruimd en correct gepusht')
