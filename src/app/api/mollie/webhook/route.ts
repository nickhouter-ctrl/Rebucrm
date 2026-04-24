import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { getMolliePaymentStatus } from '@/lib/mollie'
import { sendBetalingsbevestiging } from '@/lib/betaling-bevestiging'

export async function POST(request: NextRequest) {
  try {
    const body = await request.formData()
    const paymentId = body.get('id') as string

    if (!paymentId) {
      return NextResponse.json({ error: 'Invalid webhook payload' }, { status: 400 })
    }

    const payment = await getMolliePaymentStatus(paymentId)
    const supabase = createAdminClient()

    const { data: factuur } = await supabase
      .from('facturen')
      .select('id, totaal, betaald_bedrag, status, administratie_id')
      .eq('mollie_payment_id', paymentId)
      .single()

    if (!factuur) {
      console.error(`Factuur niet gevonden voor payment ${paymentId}`)
      return NextResponse.json({ error: 'Factuur not found' }, { status: 404 })
    }

    if (payment.status === 'paid') {
      const nieuwBetaaldBedrag = (factuur.betaald_bedrag || 0) + payment.amount
      const totaal = factuur.totaal || 0
      const nieuweStatus = nieuwBetaaldBedrag >= totaal ? 'betaald' : 'deels_betaald'
      const werdBetaald = factuur.status !== 'betaald' && nieuweStatus === 'betaald'

      await supabase
        .from('facturen')
        .update({
          betaald_bedrag: nieuwBetaaldBedrag,
          status: nieuweStatus,
        })
        .eq('id', factuur.id)

      // Verstuur bevestigingsmail als factuur nu op 'betaald' staat (idempotent
      // via betalingsbevestiging_verzonden_op flag).
      if (werdBetaald) {
        try {
          await sendBetalingsbevestiging(factuur.id)
        } catch (err) {
          console.error('Betalingsbevestiging mail vanuit Mollie webhook mislukt:', err)
        }
        try {
          const { autoArchiveerAfgerondeVerkoopkansen } = await import('@/lib/actions')
          await autoArchiveerAfgerondeVerkoopkansen(factuur.administratie_id)
        } catch (err) {
          console.warn('Auto-archivering na Mollie betaling mislukt:', err)
        }
      }
    }

    return NextResponse.json({ success: true })
  } catch (err) {
    console.error('Mollie webhook error:', err)
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Webhook processing failed' },
      { status: 500 }
    )
  }
}
