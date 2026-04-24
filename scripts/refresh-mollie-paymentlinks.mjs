import { createSupabaseAdmin } from './db.mjs'
import mollieModule from '@mollie/api-client'
const createMollieClient = mollieModule.default || mollieModule
import { readFileSync } from 'fs'
import { resolve, dirname } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))
try {
  const envPath = resolve(__dirname, '..', '.env.local')
  const content = readFileSync(envPath, 'utf-8')
  for (const line of content.split('\n')) {
    const m = line.match(/^([^#=]+)=(.*)$/)
    if (m && !process.env[m[1].trim()]) process.env[m[1].trim()] = m[2].trim().replace(/^["']|["']$/g, '')
  }
} catch { /* ignore */ }

const apiKey = (process.env.MOLLIE_API_KEY || '').trim().replace(/[\r\n]/g, '')
if (!apiKey) {
  console.error('MOLLIE_API_KEY ontbreekt in omgeving')
  process.exit(1)
}

const mollie = createMollieClient({ apiKey })
const sb = await createSupabaseAdmin()
const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://rebucrm.vercel.app'

// Alle openstaande facturen (niet betaald, niet concept)
const { data: facturen, error } = await sb
  .from('facturen')
  .select('id, factuurnummer, totaal, betaald_bedrag, status, mollie_payment_id, betaal_link, administratie_id')
  .in('status', ['verzonden', 'deels_betaald', 'vervallen'])

if (error) { console.error(error); process.exit(1) }
console.log(`${facturen?.length ?? 0} openstaande facturen gevonden`)

let vernieuwd = 0, overgeslagen = 0, errors = 0

function addDays(n) {
  return new Date(Date.now() + n * 86400000).toISOString().replace(/\.\d{3}Z$/, 'Z')
}

for (const f of (facturen || [])) {
  const openstaand = Number(f.totaal || 0) - Number(f.betaald_bedrag || 0)
  if (openstaand <= 0.01) { overgeslagen++; continue }

  // Check of huidige link een payment link is (pl_) én nog geldig
  let moetVernieuwen = true
  if (f.mollie_payment_id?.startsWith('pl_')) {
    try {
      const link = await mollie.paymentLinks.get(f.mollie_payment_id)
      // Payment link is nog geldig als er geen expiresAt in het verleden is
      const expires = link.expiresAt ? new Date(link.expiresAt) : null
      if (link.paid) { overgeslagen++; continue }
      if (expires && expires > new Date()) { overgeslagen++; continue }
    } catch {
      // link niet gevonden bij Mollie → nieuwe maken
    }
  }

  if (!moetVernieuwen) continue

  try {
    const link = await mollie.paymentLinks.create({
      amount: { currency: 'EUR', value: openstaand.toFixed(2) },
      description: `Factuur ${f.factuurnummer}`,
      redirectUrl: `${appUrl}/betaling/succes`,
      webhookUrl: `${appUrl}/api/mollie/webhook`,
      expiresAt: addDays(30),
    })
    const paymentUrl = typeof link.getPaymentUrl === 'function' ? link.getPaymentUrl() : (link._links?.paymentLink?.href || link.paymentLink?.href)
    await sb
      .from('facturen')
      .update({ mollie_payment_id: link.id, betaal_link: paymentUrl })
      .eq('id', f.id)
    console.log(`  ✓ ${f.factuurnummer} → ${link.id}`)
    vernieuwd++
  } catch (e) {
    console.error(`  ✗ ${f.factuurnummer}:`, e.message)
    errors++
  }
}

console.log(`\nKlaar: ${vernieuwd} vernieuwd, ${overgeslagen} overgeslagen, ${errors} fouten`)
