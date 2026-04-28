import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { sendEmail } from '@/lib/email'
import { buildRebuEmailHtml } from '@/lib/email-template'

// Auto-follow-up cron voor verzonden offertes:
// - Voor verzonden offertes met klantadres
// - Verstuurd 7-30 dagen geleden
// - Geen reactie ontvangen (geen status-wijziging in die periode)
// - Geen eerdere reminder verstuurd
// → Stuur 1 vriendelijke reminder, log in email_log met type 'reminder'
//
// Draait dagelijks via Vercel cron (vercel.json schedule '0 9 * * *' = 09:00).

export const dynamic = 'force-dynamic'
export const maxDuration = 60

export async function GET(req: NextRequest) {
  const auth = req.headers.get('authorization')
  if (process.env.CRON_SECRET && auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  }

  const sb = createAdminClient()
  const now = Date.now()
  const zevenDagenGeleden = new Date(now - 7 * 24 * 60 * 60 * 1000).toISOString()
  const dertigDagenGeleden = new Date(now - 30 * 24 * 60 * 60 * 1000).toISOString()

  // Verzonden offertes binnen het venster — exclusief offertes die we al
  // gerappelleerd hebben (track via email_log met onderwerp prefix 'Reminder:').
  const { data: offertes } = await sb
    .from('offertes')
    .select('id, offertenummer, onderwerp, totaal, datum, updated_at, administratie_id, relatie:relaties(id, contactpersoon, bedrijfsnaam, email), project:projecten(naam)')
    .eq('status', 'verzonden')
    .gte('updated_at', dertigDagenGeleden)
    .lte('updated_at', zevenDagenGeleden)

  if (!offertes || offertes.length === 0) {
    return NextResponse.json({ checked: 0, reminders_sent: 0 })
  }

  let remindersSent = 0
  const errors: string[] = []

  for (const offerte of offertes) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const relatie = (offerte as any).relatie
    if (!relatie?.email) continue

    // Skip wanneer er al een reminder is verstuurd
    const { data: prevReminders } = await sb
      .from('email_log')
      .select('id')
      .eq('aan', relatie.email)
      .ilike('onderwerp', `Herinnering offerte ${offerte.offertenummer}%`)
      .limit(1)
    if (prevReminders && prevReminders.length > 0) continue

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const project = (offerte as any).project
    const projectNaam = project?.naam || offerte.onderwerp || ''
    const subject = `Herinnering offerte ${offerte.offertenummer}${projectNaam ? ` — ${projectNaam}` : ''}`

    const body = `Beste ${relatie.contactpersoon || relatie.bedrijfsnaam || ''},

Onlangs hebben wij u onze offerte ${offerte.offertenummer}${projectNaam ? ` voor ${projectNaam}` : ''} toegestuurd.
Wij zijn benieuwd of u de offerte heeft kunnen bekijken en of u nog vragen heeft.

Mocht u akkoord zijn, dan kunt u eenvoudig digitaal akkoord geven via de link in onze eerdere e-mail.
Heeft u aanvullingen of wijzigingen? Laat het gerust weten — wij helpen u graag verder.

Met vriendelijke groet,
Rebu Kozijnen`

    try {
      await sendEmail({
        to: relatie.email,
        subject,
        html: buildRebuEmailHtml(body),
        fromName: 'Rebu Kozijnen',
      })
      // Log
      await sb.from('email_log').insert({
        administratie_id: offerte.administratie_id,
        aan: relatie.email,
        onderwerp: subject,
        body_html: buildRebuEmailHtml(body),
        offerte_id: offerte.id,
        relatie_id: relatie.id,
      })
      remindersSent++
    } catch (e) {
      errors.push(`${offerte.offertenummer}: ${e instanceof Error ? e.message : 'fout'}`)
    }
  }

  return NextResponse.json({
    checked: offertes.length,
    reminders_sent: remindersSent,
    errors: errors.length ? errors : undefined,
  })
}
