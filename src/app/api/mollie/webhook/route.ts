import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { getMolliePaymentStatus } from '@/lib/mollie'

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
      .select('id, totaal, betaald_bedrag')
      .eq('mollie_payment_id', paymentId)
      .single()

    if (!factuur) {
      console.error(`Factuur niet gevonden voor payment ${paymentId}`)
      return NextResponse.json({ error: 'Factuur not found' }, { status: 404 })
    }

    if (payment.status === 'paid') {
      const nieuwBetaaldBedrag = (factuur.betaald_bedrag || 0) + payment.amount
      const totaal = factuur.totaal || 0

      await supabase
        .from('facturen')
        .update({
          betaald_bedrag: nieuwBetaaldBedrag,
          status: nieuwBetaaldBedrag >= totaal ? 'betaald' : 'deels_betaald',
        })
        .eq('id', factuur.id)
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
