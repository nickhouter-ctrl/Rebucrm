import { createAdminClient } from '@/lib/supabase/admin'
import { sendEmail } from '@/lib/email'
import { buildRebuEmailHtml } from '@/lib/email-template'

/**
 * Stuurt een betalingsbevestigingsmail naar de klant wanneer een factuur op
 * 'betaald' komt te staan. Is idempotent: slaat `betalingsbevestiging_verzonden_op`
 * op zodat we niet dubbel mailen bij herhaalde Mollie/SnelStart events.
 *
 * Roept op vanuit:
 * - Mollie webhook (bij succesvolle betaling)
 * - SnelStart sync (wanneer factuur daar als betaald binnenkomt)
 * - Handmatige afboeking in CRM (indien geïmplementeerd)
 */
export async function sendBetalingsbevestiging(factuurId: string): Promise<{ verzonden: boolean; reason?: string }> {
  const supabase = createAdminClient()

  const { data: factuur } = await supabase
    .from('facturen')
    .select('id, factuurnummer, totaal, betaald_bedrag, status, onderwerp, datum, administratie_id, relatie_id, betalingsbevestiging_verzonden_op, relatie:relaties(bedrijfsnaam, contactpersoon, email, factuur_email, type)')
    .eq('id', factuurId)
    .single()

  if (!factuur) return { verzonden: false, reason: 'factuur-niet-gevonden' }
  if (factuur.status !== 'betaald') return { verzonden: false, reason: 'niet-betaald' }
  if (factuur.betalingsbevestiging_verzonden_op) return { verzonden: false, reason: 'al-verzonden' }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const rel = factuur.relatie as any
  const ontvanger = rel?.factuur_email || rel?.email
  if (!ontvanger) return { verzonden: false, reason: 'geen-email' }

  const klantNaam = rel?.contactpersoon || rel?.bedrijfsnaam || 'klant'
  const bedrag = Number(factuur.totaal || 0).toFixed(2).replace('.', ',')

  const body = `Beste ${klantNaam},

Bij deze bevestigen wij de ontvangst van uw betaling voor factuur ${factuur.factuurnummer} ter waarde van € ${bedrag}.

Hartelijk dank voor uw tijdige betaling. Mocht u nog vragen hebben, neem dan gerust contact met ons op.

Met vriendelijke groet,
Rebu Kozijnen`

  const emailHtml = buildRebuEmailHtml(body)

  try {
    await sendEmail({
      to: ontvanger,
      subject: `Betalingsbevestiging factuur ${factuur.factuurnummer}`,
      html: emailHtml,
      fromName: 'Rebu Kozijnen',
    })
  } catch (err) {
    console.error('Betalingsbevestiging-mail mislukt:', err)
    return { verzonden: false, reason: 'mail-fout' }
  }

  // Log in email_log en markeer als verzonden
  await supabase.from('email_log').insert({
    administratie_id: factuur.administratie_id,
    factuur_id: factuur.id,
    relatie_id: factuur.relatie_id,
    aan: ontvanger,
    onderwerp: `Betalingsbevestiging factuur ${factuur.factuurnummer}`,
    body_html: emailHtml,
    bijlagen: [],
  })

  await supabase
    .from('facturen')
    .update({ betalingsbevestiging_verzonden_op: new Date().toISOString() })
    .eq('id', factuur.id)

  return { verzonden: true }
}
