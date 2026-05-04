import { NextRequest, NextResponse } from 'next/server'
import { syncFactuurFromMollie } from '@/lib/mollie-sync'

export const dynamic = 'force-dynamic'
export const maxDuration = 30

/**
 * Mollie webhook ontvanger. Mollie POST een form-encoded body met `id=<paymentId>`
 * (zowel tr_… Payments als pl_… Payment Links). Het ID wordt direct teruggevraagd
 * bij Mollie's API — onbekende IDs leveren een 200 OK met reden op zonder iets
 * te muteren. Mollie verwacht binnen ~15 sec een 2xx response.
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.formData()
    const paymentId = body.get('id') as string | null
    if (!paymentId) {
      return NextResponse.json({ error: 'geen payment-id' }, { status: 400 })
    }
    const result = await syncFactuurFromMollie(paymentId)
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
