import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { getMolliePaymentStatus } from '@/lib/mollie'
import { sendBetalingsbevestiging } from '@/lib/betaling-bevestiging'

// Safety-net: webhook van Mollie kan missen (Mollie endpoint down, Vercel cold
// start error, network issue). Deze cron haalt elk uur de status op van alle
// openstaande facturen met een mollie_payment_id en synchroniseert betaald_bedrag
// + status. Idempotent — als de webhook al gelopen is verandert er niks.
//
// Vercel cron schedule: '0 * * * *' (elk heel uur).

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
    .select('id, factuurnummer, totaal, betaald_bedrag, mollie_payment_id, status, administratie_id')
    .not('mollie_payment_id', 'is', null)
    .in('status', ['verzonden', 'deels_betaald', 'vervallen', 'concept'])

  if (!facturen || facturen.length === 0) {
    return NextResponse.json({ checked: 0, updated: 0 })
  }

  let updated = 0
  const errors: string[] = []

  for (const f of facturen) {
    try {
      const payment = await getMolliePaymentStatus(f.mollie_payment_id as string)
      if (payment.status !== 'paid') continue

      const huidigBetaald = Number(f.betaald_bedrag || 0)
      const mollieBetaald = Number(payment.amount || 0)
      const nieuwBetaaldBedrag = Math.max(huidigBetaald, mollieBetaald)
      const totaal = Number(f.totaal || 0)
      const nieuweStatus = nieuwBetaaldBedrag >= totaal - 0.01 ? 'betaald' : 'deels_betaald'

      // Niets te doen als al synchroon
      if (Math.abs(nieuwBetaaldBedrag - huidigBetaald) < 0.01 && nieuweStatus === f.status) continue

      const werdBetaald = f.status !== 'betaald' && nieuweStatus === 'betaald'
      await sb.from('facturen')
        .update({ betaald_bedrag: nieuwBetaaldBedrag, status: nieuweStatus })
        .eq('id', f.id)
      updated++

      if (werdBetaald) {
        try { await sendBetalingsbevestiging(f.id) } catch (e) { console.warn('Bevestigingsmail mislukt:', e) }
        try {
          const { autoArchiveerAfgerondeVerkoopkansen } = await import('@/lib/actions')
          await autoArchiveerAfgerondeVerkoopkansen(f.administratie_id)
        } catch { /* ignore */ }
      }
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
