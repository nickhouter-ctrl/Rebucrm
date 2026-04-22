import { createSupabaseAdmin } from './db.mjs'
const sb = await createSupabaseAdmin()
const { data: admin } = await sb.from('administraties').select('id').ilike('naam', '%Rebu%').single()

const auth = await fetch('https://auth.snelstart.nl/b2b/token', {
  method: 'POST',
  headers: { 'Ocp-Apim-Subscription-Key': process.env.SNELSTART_SUBSCRIPTION_KEY, 'Content-Type': 'application/x-www-form-urlencoded' },
  body: new URLSearchParams({ grant_type: 'clientkey', clientkey: process.env.SNELSTART_CLIENT_KEY }),
}).then(r => r.json())
const token = auth.access_token

const ss = []
for (let skip = 0; skip < 20000; skip += 100) {
  const r = await fetch(`https://b2bapi.snelstart.nl/v2/verkoopfacturen?$top=100&$skip=${skip}`, {
    headers: { Authorization: `Bearer ${token}`, 'Ocp-Apim-Subscription-Key': process.env.SNELSTART_SUBSCRIPTION_KEY }
  }).then(r => r.json())
  if (!Array.isArray(r) || r.length === 0) break
  ss.push(...r); if (r.length < 100) break
}
const ssMap = new Map(ss.map(f => [f.factuurnummer, f]))

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
  if (['concept', 'geannuleerd'].includes(f.status)) continue
  const s = ssMap.get(f.factuurnummer)
  const openSS = s ? Number(s.openstaandSaldo || 0) : null
  const totaal = Number(f.totaal || 0)
  let betaaldSS = openSS !== null ? Math.round((totaal - openSS) * 100) / 100 : Number(f.betaald_bedrag || 0)
  let nieuweStatus = f.status
  if (openSS === null) {
    // niet in SS — status houden
  } else if (openSS < -0.01) nieuweStatus = 'gecrediteerd'
  else if (openSS <= 0.01) nieuweStatus = 'betaald'
  else if (betaaldSS > 0.01) nieuweStatus = 'deels_betaald'
  else if (f.vervaldatum && f.vervaldatum < vandaag) nieuweStatus = 'vervallen'
  else if (['vervallen', 'deels_betaald', 'betaald'].includes(f.status)) nieuweStatus = 'verzonden'

  const upd = {}
  if (openSS !== null) {
    upd.betaald_bedrag = betaaldSS
    upd.snelstart_openstaand = openSS
  }
  if (nieuweStatus !== f.status) upd.status = nieuweStatus
  if (Object.keys(upd).length > 0) {
    await sb.from('facturen').update(upd).eq('id', f.id)
    updated++
  }
}
console.log(`Bijgewerkt: ${updated}`)

// Verify
const { data: check } = await sb.from('facturen').select('snelstart_openstaand, vervaldatum').eq('administratie_id', admin.id)
const open = check.reduce((s, f) => f.snelstart_openstaand != null ? s + Number(f.snelstart_openstaand) : s, 0)
const verv = check.reduce((s, f) => {
  const o = f.snelstart_openstaand
  if (o == null || Number(o) <= 0) return s
  if (!f.vervaldatum || f.vervaldatum >= vandaag) return s
  return s + Number(o)
}, 0)
console.log(`CRM openstaand: €${open.toFixed(2)}`)
console.log(`CRM vervallen:  €${verv.toFixed(2)}`)
