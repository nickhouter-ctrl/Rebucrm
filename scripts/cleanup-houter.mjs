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
const sub = process.env.SNELSTART_SUBSCRIPTION_KEY
const ck = process.env.SNELSTART_CLIENT_KEY
const a = await fetch('https://auth.snelstart.nl/b2b/token', { method:'POST', headers:{'Ocp-Apim-Subscription-Key':sub,'Content-Type':'application/x-www-form-urlencoded'}, body: new URLSearchParams({grant_type:'clientkey',clientkey:ck}).toString() })
const { access_token: t } = await a.json()
const h = { Authorization: 'Bearer '+t, 'Ocp-Apim-Subscription-Key': sub, Accept:'application/json' }

const supa = await createSupabaseAdmin()

// Zoek relatie "Houter Mini Opslag"
const { data: relaties } = await supa
  .from('relaties')
  .select('id, bedrijfsnaam, snelstart_relatie_id')
  .ilike('bedrijfsnaam', 'Houter Mini Opslag')

console.log('Relaties gevonden:', relaties)

if (!relaties || relaties.length === 0) {
  console.log('Geen relatie gevonden')
  process.exit(0)
}

for (const relatie of relaties) {
  // Zoek alle verkoopkansen (projecten) van deze relatie
  const { data: projecten } = await supa
    .from('projecten')
    .select('id, naam, status')
    .eq('relatie_id', relatie.id)
  console.log(`\nProjecten voor ${relatie.bedrijfsnaam}:`, projecten)

  for (const project of projecten || []) {
    console.log(`\n→ Cleanup project ${project.naam} (${project.id})`)

    // Offertes
    const { data: offertes } = await supa
      .from('offertes')
      .select('id, offertenummer')
      .eq('project_id', project.id)
    for (const o of offertes || []) {
      // Taken gekoppeld aan offerte
      await supa.from('taken').delete().eq('offerte_id', o.id)
      // Berichten gekoppeld aan offerte (ignore error)
      try { await supa.from('berichten').delete().eq('offerte_id', o.id) } catch {}
      // Offerte regels
      await supa.from('offerte_regels').delete().eq('offerte_id', o.id)
      console.log(`  Offerte ${o.offertenummer} gereed voor delete`)
    }

    // Orders + order_medewerkers
    const { data: orders } = await supa.from('orders').select('id, ordernummer').eq('project_id', project.id)
    for (const ord of orders || []) {
      await supa.from('order_medewerkers').delete().eq('order_id', ord.id)
      console.log(`  Order ${ord.ordernummer} gereed voor delete`)
    }

    // Facturen gekoppeld aan project (via offerte_id of order_id)
    const offerteIds = (offertes || []).map(o => o.id)
    const orderIds = (orders || []).map(o => o.id)
    let { data: facturen } = await supa
      .from('facturen')
      .select('id, factuurnummer, snelstart_boeking_id')
      .or([
        offerteIds.length ? `offerte_id.in.(${offerteIds.join(',')})` : '',
        orderIds.length ? `order_id.in.(${orderIds.join(',')})` : '',
      ].filter(Boolean).join(','))
    facturen = facturen || []

    for (const f of facturen) {
      // SnelStart boeking verwijderen
      if (f.snelstart_boeking_id) {
        const del = await fetch(`https://b2bapi.snelstart.nl/v2/verkoopboekingen/${f.snelstart_boeking_id}`, { method:'DELETE', headers: h })
        console.log(`  SnelStart boeking ${f.snelstart_boeking_id.slice(0,8)} (${f.factuurnummer}) → ${del.status}`)
      } else {
        // Fallback: zoek op factuurnummer
        for (let skip = 0; skip < 2000; skip += 100) {
          const vf = await fetch(`https://b2bapi.snelstart.nl/v2/verkoopfacturen?$top=100&$skip=${skip}`, { headers: h })
          const list = await vf.json()
          if (!Array.isArray(list) || list.length === 0) break
          const hit = list.find(v => v.factuurnummer === f.factuurnummer)
          if (hit?.verkoopBoeking?.id) {
            const del = await fetch(`https://b2bapi.snelstart.nl/v2/verkoopboekingen/${hit.verkoopBoeking.id}`, { method:'DELETE', headers: h })
            console.log(`  SnelStart boeking fallback (${f.factuurnummer}) → ${del.status}`)
            break
          }
          if (list.length < 100) break
        }
      }
      await supa.from('factuur_regels').delete().eq('factuur_id', f.id)
      await supa.from('facturen').delete().eq('id', f.id)
      console.log(`  Factuur ${f.factuurnummer} verwijderd`)
    }

    // Nu orders + offertes verwijderen
    for (const ord of orders || []) await supa.from('orders').delete().eq('id', ord.id)
    for (const o of offertes || []) await supa.from('offertes').delete().eq('id', o.id)

    // Taken direct aan project gekoppeld
    await supa.from('taken').delete().eq('project_id', project.id)

    // Emails project_id ontkoppelen
    await supa.from('emails').update({ project_id: null }).eq('project_id', project.id)

    // Project zelf
    const { error } = await supa.from('projecten').delete().eq('id', project.id)
    console.log(`  Project ${project.naam} delete:`, error ? error.message : 'ok')
  }
}

console.log('\n✓ Klaar')
