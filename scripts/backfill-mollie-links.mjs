// Backfill Mollie payment-links voor bestaande openstaande facturen die er
// nog geen hebben. Per factuur idempotent: als er al een betaal_link is
// blijft die staan.
//
// Run zonder argument voor preview, met 'fix' om uit te voeren.

import { readFileSync } from 'fs'
import { resolve, dirname } from 'path'
import { fileURLToPath } from 'url'
import { createSupabaseAdmin } from './db.mjs'

const __dirname = dirname(fileURLToPath(import.meta.url))

// Load .env.local voor MOLLIE_API_KEY + NEXT_PUBLIC_APP_URL
try {
  const envPath = resolve(__dirname, '..', '.env.local')
  const content = readFileSync(envPath, 'utf-8')
  for (const line of content.split('\n')) {
    const m = line.match(/^([^#=]+)=(.*)$/)
    if (m) {
      const key = m[1].trim()
      const val = m[2].trim().replace(/^["']|["']$/g, '')
      if (!process.env[key]) process.env[key] = val
    }
  }
} catch { /* ignore */ }

const apiKey = (process.env.MOLLIE_API_KEY || '').trim()
if (!apiKey) {
  console.error('MOLLIE_API_KEY ontbreekt in .env.local')
  process.exit(1)
}

const sb = await createSupabaseAdmin()
const dryRun = process.argv[2] !== 'fix'

const { data: facturen } = await sb.from('facturen')
  .select('id, factuurnummer, datum, status, totaal, betaald_bedrag, mollie_payment_id, betaal_link, relatie:relaties(bedrijfsnaam)')
  .in('status', ['concept', 'verzonden', 'deels_betaald', 'vervallen'])
  .is('betaal_link', null)
  .order('datum', { ascending: false })

const teVerwerken = (facturen || []).filter(f => Number(f.totaal || 0) - Number(f.betaald_bedrag || 0) > 0)
console.log(`Openstaande facturen zonder betaal_link: ${teVerwerken.length}`)

if (teVerwerken.length === 0) {
  console.log('Alle openstaande facturen hebben al een Mollie-link.')
  process.exit(0)
}

console.log('\nVoorbeelden:')
for (const f of teVerwerken.slice(0, 10)) {
  const open = Number(f.totaal || 0) - Number(f.betaald_bedrag || 0)
  console.log(`  ${f.factuurnummer} | ${f.datum} | ${f.status.padEnd(13)} | openstaand €${open.toFixed(2)} | ${f.relatie?.bedrijfsnaam || '-'}`)
}
if (teVerwerken.length > 10) console.log(`  ... +${teVerwerken.length - 10} meer`)

if (dryRun) {
  console.log(`\n[DRY RUN] Run met 'fix' om Mollie-links te genereren voor deze ${teVerwerken.length} facturen.`)
  process.exit(0)
}

// Mollie client via named export
const { createMollieClient } = await import('@mollie/api-client')
const mollie = createMollieClient({ apiKey })
const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://rebucrm.vercel.app'

let success = 0
let fail = 0
for (let i = 0; i < teVerwerken.length; i++) {
  const f = teVerwerken[i]
  const openstaand = Number(f.totaal || 0) - Number(f.betaald_bedrag || 0)
  const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().replace(/\.\d{3}Z$/, 'Z')
  try {
    const link = await mollie.paymentLinks.create({
      amount: { currency: 'EUR', value: openstaand.toFixed(2) },
      description: `Factuur ${f.factuurnummer}`,
      redirectUrl: `${appUrl}/betaling/succes`,
      webhookUrl: `${appUrl}/api/mollie/webhook`,
      expiresAt,
    })
    const url = (typeof link.getPaymentUrl === 'function' ? link.getPaymentUrl() : null)
      || link._links?.paymentLink?.href
      || ''
    await sb.from('facturen').update({ mollie_payment_id: link.id, betaal_link: url }).eq('id', f.id)
    success++
    process.stdout.write(`\r  ${i + 1}/${teVerwerken.length} (${success} OK, ${fail} fouten)`)
  } catch (err) {
    fail++
    console.error(`\n  ${f.factuurnummer}: ${err.message || err}`)
  }
}
console.log(`\n\nKlaar: ${success} Mollie-links aangemaakt, ${fail} fouten.`)
