import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { syncFactuurFromMollie } from '@/lib/mollie-sync'

// Safety-net: webhook van Mollie kan missen (Mollie endpoint down, Vercel cold
// start error, network issue). Mollie retryt zelf tot 3 dagen, dus echt missen
// is zeldzaam. Deze cron draait elke 2 uur en synchroniseert openstaande
// facturen — idempotent. Als de webhook al gelopen is verandert er niks.
//
// Vercel cron schedule: '0 */2 * * *' (elke 2 uur).

export const dynamic = 'force-dynamic'
export const maxDuration = 60

export async function GET(req: NextRequest) {
  const auth = req.headers.get('authorization')
  if (process.env.CRON_SECRET && auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  }

  const sb = createAdminClient()
  const { data: facturen } = await sb
    .from('facturen')
    .select('id, factuurnummer, mollie_payment_id')
    .not('mollie_payment_id', 'is', null)
    .in('status', ['verzonden', 'deels_betaald', 'vervallen', 'concept'])

  if (!facturen || facturen.length === 0) {
    return NextResponse.json({ checked: 0, updated: 0 })
  }

  let updated = 0
  const errors: string[] = []

  for (const f of facturen) {
    try {
      const result = await syncFactuurFromMollie(f.mollie_payment_id as string)
      if (result.updated) updated++
    } catch (e) {
      errors.push(`${f.factuurnummer}: ${e instanceof Error ? e.message : 'fout'}`)
    }
  }

  return NextResponse.json({
    checked: facturen.length,
    updated,
    errors: errors.length ? errors : undefined,
  })
}
