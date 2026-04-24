import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { createMolliePayment } from '@/lib/mollie'

/**
 * Permanente betaal-URL voor facturen. De e-mail bevat deze Rebu-URL in
 * plaats van de rauwe Mollie-URL. Als de onderliggende Mollie Payment Link
 * verlopen is, genereren we hier on-the-fly een nieuwe en slaan we die op,
 * waarna de klant alsnog naar de betaalpagina wordt geredirect.
 */
export async function GET(req: NextRequest, context: { params: Promise<{ token: string }> }) {
  const { token } = await context.params
  const sb = createAdminClient()

  const { data: factuur } = await sb
    .from('facturen')
    .select('id, factuurnummer, status, totaal, betaald_bedrag, betaal_link, mollie_payment_id')
    .eq('publiek_token', token)
    .maybeSingle()

  if (!factuur) {
    return NextResponse.json({ error: 'Factuur niet gevonden' }, { status: 404 })
  }

  const openstaand = Number(factuur.totaal || 0) - Number(factuur.betaald_bedrag || 0)
  if (factuur.status === 'betaald' || openstaand <= 0.01) {
    const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://rebucrm.vercel.app'
    return NextResponse.redirect(`${appUrl}/betaling/succes?factuur=${factuur.factuurnummer}`)
  }

  let betaalLink = factuur.betaal_link

  // Verifieer dat de opgeslagen Mollie-link nog werkt. Als hij verlopen is
  // of het ID is van het oude Payments-type (tr_…) — maak een nieuwe.
  const needsNew = await (async () => {
    if (!betaalLink || !factuur.mollie_payment_id) return true
    if (!factuur.mollie_payment_id.startsWith('pl_')) return true
    try {
      const { getMolliePaymentStatus } = await import('@/lib/mollie')
      const status = await getMolliePaymentStatus(factuur.mollie_payment_id)
      return status.status !== 'open' && status.status !== 'paid'
    } catch {
      return true
    }
  })()

  if (needsNew && process.env.MOLLIE_API_KEY) {
    try {
      const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://rebucrm.vercel.app'
      const nieuwe = await createMolliePayment({
        amount: openstaand,
        description: `Factuur ${factuur.factuurnummer}`,
        redirectUrl: `${appUrl}/betaling/succes`,
        webhookUrl: `${appUrl}/api/mollie/webhook`,
      })
      await sb
        .from('facturen')
        .update({ mollie_payment_id: nieuwe.id, betaal_link: nieuwe.checkoutUrl })
        .eq('id', factuur.id)
      betaalLink = nieuwe.checkoutUrl
    } catch (err) {
      console.error('Herstellen betaallink mislukt:', err)
      return NextResponse.json({ error: 'Betaallink niet beschikbaar — neem contact op met Rebu' }, { status: 500 })
    }
  }

  if (!betaalLink) {
    return NextResponse.json({ error: 'Geen betaallink beschikbaar' }, { status: 500 })
  }

  return NextResponse.redirect(betaalLink)
}
