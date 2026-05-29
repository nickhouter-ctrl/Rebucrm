import { createAdminClient } from '@/lib/supabase/admin'
import { getMolliePaymentStatus, getMollieClient } from '@/lib/mollie'
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
    // Bevestigingsmail alleen bij een RECENTE betaling. Zonder deze guard zou
    // een backfill (cron die oude, al lang betaalde facturen alsnog afboekt na
    // een bugfix) klanten bestoken met "bedankt voor uw betaling"-mails voor
    // betalingen van weken geleden. paidAt onbekend → wél mailen (veilig voor
    // verse betalingen waarbij Mollie de timestamp nog niet teruggaf).
    const paidAt = payment.paidAt ? new Date(payment.paidAt) : null
    const recent = !paidAt || (Date.now() - paidAt.getTime()) < 3 * 24 * 60 * 60 * 1000
    if (recent) {
      try { await sendBetalingsbevestiging(factuur.id) } catch (e) { console.warn('Bevestigingsmail mislukt:', e) }
    }
    try {
      const { autoArchiveerAfgerondeVerkoopkansen } = await import('@/lib/actions')
      await autoArchiveerAfgerondeVerkoopkansen(factuur.administratie_id)
    } catch { /* ignore */ }
  }

  return { factuurId: factuur.id, factuurnummer: factuur.factuurnummer, updated: true, status: nieuweStatus }
}

/**
 * Resolver voor een Mollie Payment-id (`tr_…`) dat we niet rechtstreeks in de
 * DB kunnen terugvinden. Dit gebeurt bij Payment Links: wij slaan de link-id
 * (`pl_…`) op, maar Mollie's webhook stuurt de id van de onderliggende betaling
 * (`tr_…`). We halen de betaling op, lezen het factuurnummer uit de
 * omschrijving ("Factuur <nummer>") en synchroniseren via de bij die factuur
 * opgeslagen `pl_…`-id (of de `tr_…` zelf als die wél is opgeslagen).
 */
export async function syncFactuurFromMollieTransactie(transactieId: string): Promise<MollieSyncResult> {
  let payment: { description?: string | null }
  try {
    const mollie = getMollieClient()
    payment = await mollie.payments.get(transactieId)
  } catch (e) {
    return { factuurId: null, factuurnummer: null, updated: false, status: null, reden: `payment ophalen mislukt: ${e instanceof Error ? e.message : 'fout'}` }
  }

  const descr = (payment.description || '').trim()
  const m = descr.match(/Factuur\s+(.+)$/i)
  if (!m) {
    return { factuurId: null, factuurnummer: null, updated: false, status: null, reden: `geen factuurnummer in omschrijving "${descr}"` }
  }
  const factuurnummer = m[1].trim()

  const sb = createAdminClient()
  const { data: factuur } = await sb
    .from('facturen')
    .select('id, mollie_payment_id')
    .eq('factuurnummer', factuurnummer)
    .maybeSingle()

  if (!factuur) {
    return { factuurId: null, factuurnummer, updated: false, status: null, reden: 'factuur niet gevonden via omschrijving' }
  }
  // Sync via de opgeslagen payment-link-id (getMolliePaymentStatus snapt pl_),
  // of via de transactie-id zelf als die toevallig is opgeslagen.
  const syncId = (factuur.mollie_payment_id as string | null) || transactieId
  return syncFactuurFromMollie(syncId)
}
