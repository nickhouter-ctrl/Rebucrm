import fs from 'fs'
for (const line of fs.readFileSync('/Users/houterminiopslag/Documents/projects/Rebu/.env.local', 'utf-8').split('\n')) {
  const m = line.match(/^([^#=]+)=(.*)$/); if (m) process.env[m[1].trim()] = m[2].trim().replace(/^["']|["']$/g, '')
}
import('@supabase/supabase-js').then(async ({ createClient }) => {
  const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY)

  // Auth SnelStart
  const auth = await fetch('https://auth.snelstart.nl/b2b/token', {
    method: 'POST',
    headers: { 'Ocp-Apim-Subscription-Key': process.env.SNELSTART_SUBSCRIPTION_KEY, 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ grant_type: 'clientkey', clientkey: process.env.SNELSTART_CLIENT_KEY }),
  }).then(r => r.json())
  const token = auth.access_token

  const ss = []
  for (let skip = 0; skip < 20000; skip += 100) {
    const r = await fetch(`https://b2bapi.snelstart.nl/v2/verkoopfacturen?$top=100&$skip=${skip}`, {
      headers: { Authorization: `Bearer ${token}`, 'Ocp-Apim-Subscription-Key': process.env.SNELSTART_SUBSCRIPTION_KEY, Accept: 'application/json' }
    })
    const list = await r.json()
    if (!Array.isArray(list) || list.length === 0) break
    ss.push(...list)
    if (list.length < 100) break
  }

  const ssMap = new Map(ss.map(f => [f.factuurnummer, f]))

  const { data: admin } = await sb.from('administraties').select('id').ilike('naam', '%Rebu%').single()
  const crm = []
  let from = 0
  while (true) {
    const { data } = await sb.from('facturen').select('id, factuurnummer, totaal, betaald_bedrag, status, vervaldatum').eq('administratie_id', admin.id).range(from, from + 999)
    if (!data || data.length === 0) break
    crm.push(...data); from += 1000
  }

  const vandaag = new Date().toISOString().slice(0, 10)
  let updated = 0
  for (const f of crm) {
    if (f.status === 'concept' || f.status === 'gecrediteerd') continue
    const s = ssMap.get(f.factuurnummer)
    if (!s) continue
    const totaal = Number(f.totaal || 0)
    const openSS = Math.max(0, Number(s.openstaandSaldo || 0))
    const betaaldSS = Math.max(0, Math.round((totaal - openSS) * 100) / 100)
    let nieuweStatus = f.status
    if (openSS <= 0.01) nieuweStatus = 'betaald'
    else if (betaaldSS > 0.01) nieuweStatus = 'deels_betaald'
    else if (f.vervaldatum && f.vervaldatum < vandaag) nieuweStatus = 'vervallen'
    else if (['vervallen', 'deels_betaald', 'betaald'].includes(f.status)) nieuweStatus = 'verzonden'

    const huidigBetaald = Number(f.betaald_bedrag || 0)
    if (nieuweStatus !== f.status || Math.abs(huidigBetaald - betaaldSS) > 0.01) {
      await sb.from('facturen').update({ betaald_bedrag: betaaldSS, status: nieuweStatus }).eq('id', f.id)
      updated++
    }
  }

  // Nieuwe openstaand totaal
  const { data: nieuw } = await sb.from('facturen').select('totaal, betaald_bedrag, status').eq('administratie_id', admin.id)
  const totaalOpen = (nieuw || []).filter(f => !['betaald', 'gecrediteerd', 'concept', 'geannuleerd'].includes(f.status)).reduce((s, f) => s + (Number(f.totaal) - Number(f.betaald_bedrag || 0)), 0)

  console.log(`Facturen bijgewerkt: ${updated}`)
  console.log(`CRM totaal openstaand na sync: €${totaalOpen.toFixed(2)}`)
})
