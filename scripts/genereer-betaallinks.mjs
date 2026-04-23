import { createSupabaseAdmin } from './db.mjs'
const sb = await createSupabaseAdmin()
const apiKey = (process.env.MOLLIE_API_KEY || '').trim().replace(/[^\x20-\x7E]/g, '')

const { data: admin } = await sb.from('administraties').select('id').ilike('naam', '%Rebu%').single()
const appUrl = 'https://rebucrm.vercel.app'

const { data: facturen, error: fErr } = await sb.from('facturen')
  .select('id, factuurnummer, totaal, betaald_bedrag, status, betaal_link')
  .eq('administratie_id', admin.id)
  .in('status', ['verzonden', 'deels_betaald', 'vervallen'])
if (fErr) { console.error(fErr.message); process.exit(1) }
const zonder = (facturen || []).filter(f => !f.betaal_link)
console.log(`Facturen zonder betaal_link: ${zonder.length}`)

let gemaakt = 0, failed = 0
for (const f of zonder) {
  const openstaand = Number(f.totaal) - Number(f.betaald_bedrag || 0)
  if (openstaand <= 0) continue
  try {
    const r = await fetch('https://api.mollie.com/v2/payments', {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        amount: { currency: 'EUR', value: openstaand.toFixed(2) },
        description: `Factuur ${f.factuurnummer}`,
        redirectUrl: `${appUrl}/betaling/succes`,
        webhookUrl: `${appUrl}/api/mollie/webhook`,
        metadata: { factuurId: f.id },
      }),
    })
    if (!r.ok) { console.error(`${f.factuurnummer}: ${r.status} ${(await r.text()).slice(0, 120)}`); failed++; continue }
    const payment = await r.json()
    const checkoutUrl = payment._links?.checkout?.href
    if (checkoutUrl) {
      const { error: uErr } = await sb.from('facturen').update({ betaal_link: checkoutUrl }).eq('id', f.id)
      if (uErr) { console.error(`${f.factuurnummer} update: ${uErr.message}`); failed++ }
      else gemaakt++
    }
  } catch (e) { console.error(f.factuurnummer, e.message); failed++ }
}
console.log(`Gemaakt: ${gemaakt}, mislukt: ${failed}`)
