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
const headers = { Authorization: `Bearer ${token}`, 'Ocp-Apim-Subscription-Key': subKey, Accept: 'application/json', 'Content-Type': 'application/json' }

const supa = await createSupabaseAdmin()

// 1. Zoek test factuur FAC-0001
const { data: factuur } = await supa
  .from('facturen')
  .select('id, factuurnummer, snelstart_boeking_id, relatie_id, administratie_id')
  .eq('factuurnummer', 'FAC-0001')
  .maybeSingle()

if (!factuur) {
  console.log('Geen test factuur FAC-0001 gevonden')
} else {
  console.log('Found factuur:', factuur.id, 'snelstart:', factuur.snelstart_boeking_id)

  // 2. Verwijder uit SnelStart
  if (factuur.snelstart_boeking_id) {
    const del = await fetch(`https://b2bapi.snelstart.nl/v2/verkoopboekingen/${factuur.snelstart_boeking_id}`, { method:'DELETE', headers })
    console.log('SnelStart delete:', del.status, await del.text())
  }

  // 3. Verwijder factuur_regels
  await supa.from('factuur_regels').delete().eq('factuur_id', factuur.id)
  // 4. Verwijder factuur
  const { error } = await supa.from('facturen').delete().eq('id', factuur.id)
  if (error) console.error('Delete factuur error:', error); else console.log('✓ Factuur verwijderd uit CRM')

  // 5. Haal test-relatie (Houter Mini Opslag) uit SnelStart (alleen in SnelStart, niet CRM)
  const { data: relatie } = await supa
    .from('relaties')
    .select('id, bedrijfsnaam, snelstart_relatie_id')
    .eq('id', factuur.relatie_id)
    .maybeSingle()
  if (relatie?.snelstart_relatie_id) {
    const delR = await fetch(`https://b2bapi.snelstart.nl/v2/relaties/${relatie.snelstart_relatie_id}`, { method:'DELETE', headers })
    console.log('SnelStart relatie delete:', delR.status, await delR.text())
    await supa.from('relaties').update({ snelstart_relatie_id: null, snelstart_synced_at: null }).eq('id', relatie.id)
  }
}

// 6. Zet factuurnummering op F-2026-00167 (volgend nummer = 167)
const { data: admins } = await supa.from('administraties').select('id')
for (const a of admins || []) {
  const { error } = await supa
    .from('nummering')
    .upsert({
      administratie_id: a.id,
      type: 'factuur',
      prefix: 'F-2026-',
      volgend_nummer: 167,
      padding: 5,
    }, { onConflict: 'administratie_id,type' })
  if (error) console.error('Nummering update error:', error)
  else console.log(`✓ Nummering gezet voor admin ${a.id} → volgend: F-2026-00167`)
}
