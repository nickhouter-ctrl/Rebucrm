import fs from 'fs'
for (const line of fs.readFileSync('/Users/houterminiopslag/Documents/projects/Rebu/.env.local', 'utf-8').split('\n')) {
  const m = line.match(/^([^#=]+)=(.*)$/); if (m) process.env[m[1].trim()] = m[2].trim().replace(/^["']|["']$/g, '')
}
const { createClient } = await import('@supabase/supabase-js')
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY)

const auth = await fetch('https://auth.snelstart.nl/b2b/token', {
  method: 'POST',
  headers: { 'Ocp-Apim-Subscription-Key': process.env.SNELSTART_SUBSCRIPTION_KEY, 'Content-Type': 'application/x-www-form-urlencoded' },
  body: new URLSearchParams({ grant_type: 'clientkey', clientkey: process.env.SNELSTART_CLIENT_KEY }),
}).then(r => r.json())
const ssToken = auth.access_token

const ss = []
for (let skip = 0; skip < 20000; skip += 100) {
  const r = await fetch(`https://b2bapi.snelstart.nl/v2/verkoopfacturen?$top=100&$skip=${skip}`, {
    headers: { Authorization: `Bearer ${ssToken}`, 'Ocp-Apim-Subscription-Key': process.env.SNELSTART_SUBSCRIPTION_KEY, Accept: 'application/json' }
  }).then(r => r.json())
  if (!Array.isArray(r) || r.length === 0) break
  ss.push(...r); if (r.length < 100) break
}
const ssNummers = new Set(ss.map(f => f.factuurnummer))

const { data: admin } = await sb.from('administraties').select('id').ilike('naam', '%Rebu%').single()
const { data: crm } = await sb
  .from('facturen')
  .select('id, factuurnummer, totaal, betaald_bedrag, status, datum, snelstart_boeking_id, snelstart_synced_at, relatie:relaties(bedrijfsnaam)')
  .eq('administratie_id', admin.id)
  .not('factuurnummer', 'is', null)
  .not('status', 'in', '(concept,gecrediteerd)')

const orphans = crm.filter(f => !ssNummers.has(f.factuurnummer))
console.log(`CRM facturen NIET in SnelStart: ${orphans.length}`)
console.log('Bedrag openstaand:', orphans.reduce((s, f) => s + (Number(f.totaal) - Number(f.betaald_bedrag || 0)), 0).toFixed(2))
console.log()
for (const f of orphans.sort((a,b) => (b.totaal||0)-(a.totaal||0))) {
  console.log(`  ${f.factuurnummer} | ${f.status} | €${f.totaal} | ${f.relatie?.bedrijfsnaam || '-'} | ss_id=${f.snelstart_boeking_id ? 'ja' : 'nee'} synced=${f.snelstart_synced_at ? 'ja' : 'nee'}`)
}
