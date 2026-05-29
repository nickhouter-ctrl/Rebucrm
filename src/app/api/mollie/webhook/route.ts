import { NextRequest, NextResponse } from 'next/server'
import { syncFactuurFromMollie, syncFactuurFromMollieTransactie } from '@/lib/mollie-sync'

export const dynamic = 'force-dynamic'
export const maxDuration = 30

/**
 * Mollie webhook ontvanger. Mollie POST een form-encoded body met `id=<paymentId>`.
 *
 * LET OP: voor Payment Links (waar wij `pl_…` opslaan) stuurt Mollie NIET het
 * link-id, maar het id van de onderliggende betaling (`tr_…`). Die `tr_…` staat
 * dus niet in onze DB. We proberen daarom eerst een directe match (werkt voor
 * `pl_…` en legacy `tr_…`), en vallen anders terug op een resolver die de
 * betaling ophaalt en via het factuurnummer in de omschrijving alsnog de juiste
 * factuur vindt. Mollie verwacht binnen ~15 sec een 2xx response.
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.formData()
    const paymentId = body.get('id') as string | null
    if (!paymentId) {
      return NextResponse.json({ error: 'geen payment-id' }, { status: 400 })
    }
    let result = await syncFactuurFromMollie(paymentId)
    // Geen directe match op een Payment-id? Dan is dit waarschijnlijk een
    // betaling onder een Payment Link — resolve via de omschrijving.
    if (!result.factuurId && paymentId.startsWith('tr_')) {
      result = await syncFactuurFromMollieTransactie(paymentId)
    }
    return NextResponse.json({ success: true, ...result })
  } catch (err) {
    console.error('Mollie webhook error:', err)
    // 200 retourneren zodat Mollie niet eindeloos retryt op een transient bug.
    // De safety-net cron pakt het later alsnog op.
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'webhook processing failed' },
      { status: 200 }
    )
  }
}
