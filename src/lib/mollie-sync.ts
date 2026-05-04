import { createAdminClient } from '@/lib/supabase/admin'
import { getMolliePaymentStatus } from '@/lib/mollie'
import { sendBetalingsbevestiging } from '@/lib/betaling-bevestiging'

export interface MollieSyncResult {
  factuurId: string | null
  factuurnummer: string | null
  updated: boolean
  status: string | null
  reden?: string
}

/**
 * Synchroniseert één factuur met Mollie op basis van een Mollie payment-id
 * (zowel `tr_…` Payments als `pl_…` Payment Links). Idempotent — als alles
 * al synchroon is verandert er niks. Gebruikt vanuit de webhook én vanuit
 * de safety-net cron.
 */
export async function syncFactuurFromMollie(molliePaymentId: string): Promise<MollieSyncResult> {
  const sb = createAdminClient()
  const { data: factuur } = await sb
    .from('facturen')
    .select('id, factuurnummer, totaal, betaald_bedrag, status, administratie_id')
    .eq('mollie_payment_id', molliePaymentId)
    .maybeSingle()

  if (!factuur) {
    return { factuurId: null, factuurnummer: null, updated: false, status: null, reden: 'factuur niet gevonden' }
  }

  const payment = await getMolliePaymentStatus(molliePaymentId)
  if (payment.status !== 'paid') {
    return { factuurId: factuur.id, factuurnummer: factuur.factuurnummer, updated: false, status: payment.status, reden: 'nog niet betaald' }
  }

  const huidigBetaald = Number(factuur.betaald_bedrag || 0)
  const mollieBetaald = Number(payment.amount || 0)
  const nieuwBetaaldBedrag = Math.max(huidigBetaald, mollieBetaald)
  const totaal = Number(factuur.totaal || 0)
  const nieuweStatus = nieuwBetaaldBedrag >= totaal - 0.01 ? 'betaald' : 'deels_betaald'

  if (Math.abs(nieuwBetaaldBedrag - huidigBetaald) < 0.01 && nieuweStatus === factuur.status) {
    return { factuurId: factuur.id, factuurnummer: factuur.factuurnummer, updated: false, status: factuur.status, reden: 'al synchroon' }
  }

  const werdBetaald = factuur.status !== 'betaald' && nieuweStatus === 'betaald'
  await sb.from('facturen')
    .update({ betaald_bedrag: nieuwBetaaldBedrag, status: nieuweStatus })
    .eq('id', factuur.id)

  if (werdBetaald) {
    try { await sendBetalingsbevestiging(factuur.id) } catch (e) { console.warn('Bevestigingsmail mislukt:', e) }
    try {
      const { autoArchiveerAfgerondeVerkoopkansen } = await import('@/lib/actions')
      await autoArchiveerAfgerondeVerkoopkansen(factuur.administratie_id)
    } catch { /* ignore */ }
  }

  return { factuurId: factuur.id, factuurnummer: factuur.factuurnummer, updated: true, status: nieuweStatus }
}
