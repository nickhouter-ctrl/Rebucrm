import { createSupabaseAdmin } from './db.mjs'
const sb = await createSupabaseAdmin()

// Probeer verschillende varianten
for (const nr of ['F-2026-00179', 'F-2026-179', '00179']) {
  const { data } = await sb.from('facturen')
    .select('id, factuurnummer, totaal, betaald_bedrag, status, mollie_payment_id, betaal_link, administratie_id')
    .ilike('factuurnummer', `%${nr}%`).limit(5)
  if (data && data.length > 0) {
    console.log(`Search "${nr}":`)
    for (const f of data) console.log(`  ${f.factuurnummer} | €${f.totaal} | bet €${f.betaald_bedrag} | mollie=${f.mollie_payment_id ? 'JA' : 'NEE'} | link=${f.betaal_link ? 'JA' : 'NEE'}`)
  }
}

// Test Mollie key direct
const apiKey = (process.env.MOLLIE_API_KEY || '').trim().replace(/[^\x20-\x7E]/g, '')
console.log(`\nMOLLIE_API_KEY: aanwezig=${!!apiKey}, lengte=${apiKey.length}`)
if (apiKey) {
  const firstChars = apiKey.slice(0, 5)
  const lastChars = apiKey.slice(-5)
  console.log(`  first 5: ${firstChars} | last 5: ${lastChars}`)
  // Probeer een echte Mollie API call
  const r = await fetch('https://api.mollie.com/v2/profiles/me', {
    headers: { Authorization: `Bearer ${apiKey}` },
  })
  console.log(`  Mollie /profiles/me: ${r.status} ${r.ok ? 'OK' : await r.text()}`)
}
