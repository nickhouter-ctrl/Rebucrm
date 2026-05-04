import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { sendEmail } from '@/lib/email'
import { buildRebuEmailHtml } from '@/lib/email-template'
import { ensureFactuurBetaalLink } from '@/lib/mollie'
import { getAppUrl } from '@/lib/utils'

// Auto-herinneringen voor openstaande facturen op:
//  - 7 dagen na vervaldatum  → vriendelijke herinnering
//  - 14 dagen na vervaldatum → 2e herinnering, iets steviger
//  - 30 dagen na vervaldatum → 3e herinnering met aankondiging incasso
//
// Idempotent via email_log: per factuur + per fase max 1 herinnering. We
// markeren met onderwerp-prefix 'Herinnering 1/2/3 — F-...' zodat we kunnen
// detecteren wat al verstuurd is.
//
// Schedule: '0 10 * * *' (dagelijks 10:00).

export const dynamic = 'force-dynamic'
export const maxDuration = 60

const FASES = [
  { stap: 1, dagen: 7, prefix: 'Herinnering 1', toon: 'vriendelijk' },
  { stap: 2, dagen: 14, prefix: 'Herinnering 2', toon: 'dringend' },
  { stap: 3, dagen: 30, prefix: 'Herinnering 3', toon: 'laatste' },
] as const

type Fase = typeof FASES[number]

function buildBody(fase: Fase, klantNaam: string, factuurnummer: string, openstaand: number, vervaldatum: string) {
  const bedrag = new Intl.NumberFormat('nl-NL', { style: 'currency', currency: 'EUR' }).format(openstaand)
  if (fase.toon === 'vriendelijk') {
    return `Beste ${klantNaam},

Wij willen u er vriendelijk op wijzen dat factuur ${factuurnummer} ten bedrage van ${bedrag} sinds ${vervaldatum} openstaat.

Mogelijk is het uw aandacht ontschoten — u kunt eenvoudig betalen via de groene knop hieronder.

Mocht u de factuur al voldaan hebben, dan kunt u deze e-mail als niet verzonden beschouwen.

Met vriendelijke groet,
Rebu Kozijnen`
  }
  if (fase.toon === 'dringend') {
    return `Beste ${klantNaam},

Ondanks onze eerdere herinnering hebben wij voor factuur ${factuurnummer} (${bedrag}, vervaldatum ${vervaldatum}) nog geen betaling mogen ontvangen.

Wij verzoeken u dit bedrag binnen 7 dagen over te maken via de groene knop hieronder. Heeft u vragen of bezwaren? Neem dan zo spoedig mogelijk contact met ons op.

Met vriendelijke groet,
Rebu Kozijnen`
  }
  return `Beste ${klantNaam},

Voor factuur ${factuurnummer} (${bedrag}, vervaldatum ${vervaldatum}) hebben wij ondanks meerdere herinneringen nog geen betaling ontvangen.

Wij verzoeken u dringend binnen 7 dagen alsnog te betalen via de groene knop hieronder. Indien wij hierna geen betaling of reactie ontvangen zullen wij genoodzaakt zijn de vordering uit handen te geven aan ons incassobureau, met bijkomende kosten voor uw rekening.

Met vriendelijke groet,
Rebu Kozijnen`
}

export async function GET(req: NextRequest) {
  const auth = req.headers.get('authorization')
  if (process.env.CRON_SECRET && auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  }

  const sb = createAdminClient()
  const today = new Date(); today.setHours(0, 0, 0, 0)

  const { data: facturen } = await sb
    .from('facturen')
    .select('id, factuurnummer, vervaldatum, totaal, betaald_bedrag, status, onderwerp, administratie_id, betaal_link, publiek_token, aanmaning_stap, relatie:relaties(id, contactpersoon, bedrijfsnaam, email, factuur_email)')
    .in('status', ['verzonden', 'deels_betaald', 'vervallen'])
    .not('vervaldatum', 'is', null)

  if (!facturen || facturen.length === 0) {
    return NextResponse.json({ checked: 0, sent: 0 })
  }

  let sent = 0
  const errors: string[] = []
  const baseUrl = getAppUrl()

  for (const f of facturen) {
    const openstaand = Number(f.totaal || 0) - Number(f.betaald_bedrag || 0)
    if (openstaand <= 0.01) continue
    const vervalDate = new Date(f.vervaldatum as string)
    const dagenOver = Math.floor((today.getTime() - vervalDate.getTime()) / (1000 * 60 * 60 * 24))

    // Bepaal de fase: kies de hoogste fase waarvoor dagenOver >= fase.dagen.
    // Door deze sortering (descending) krijgt een 31-daagse factuur direct
    // fase 3 als fase 1/2 om wat voor reden dan ook gemist zijn.
    let fase: Fase | null = null
    for (const f2 of [...FASES].reverse()) {
      if (dagenOver >= f2.dagen) { fase = f2; break }
    }
    if (!fase) continue

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const relatie = (f as any).relatie as { contactpersoon?: string | null; bedrijfsnaam?: string | null; email?: string | null; factuur_email?: string | null } | null
    const email = (relatie?.factuur_email || '').trim() || (relatie?.email || '').trim()
    if (!email) continue

    // Idempotency: kolom aanmaning_stap is leidend, val terug op email_log
    // voor facturen waar dat veld nog niet gevuld is (legacy).
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const huidigeStap = Number((f as any).aanmaning_stap || 0)
    if (huidigeStap >= fase.stap) continue
    if (huidigeStap === 0) {
      const { data: bestaande } = await sb
        .from('email_log')
        .select('id')
        .eq('aan', email)
        .ilike('onderwerp', `${fase.prefix} — ${f.factuurnummer}%`)
        .limit(1)
      if (bestaande && bestaande.length > 0) continue
    }

    // Zorg voor een Mollie betaal-link
    let link = (f.betaal_link as string | null) || null
    if (!link) {
      try {
        const r = await ensureFactuurBetaalLink(f.id)
        link = r.link
      } catch { /* ignore */ }
    }
    const ctaLink = link && f.publiek_token
      ? `${baseUrl}/api/factuur/${f.publiek_token}/betaal`
      : (link || undefined)
    const ctaLabel = `Betaal direct €${openstaand.toFixed(2).replace('.', ',')}`

    const klantNaam = relatie?.contactpersoon || relatie?.bedrijfsnaam || ''
    const vervalNL = vervalDate.toLocaleDateString('nl-NL')
    const subject = `${fase.prefix} — ${f.factuurnummer}`
    const body = buildBody(fase, klantNaam, f.factuurnummer, openstaand, vervalNL)
    const html = buildRebuEmailHtml(body, ctaLink, ctaLabel)

    try {
      await sendEmail({ to: email, subject, html, fromName: 'Rebu Kozijnen' })
      await sb.from('email_log').insert({
        administratie_id: f.administratie_id,
        aan: email,
        onderwerp: subject,
        body_html: html,
        relatie_id: relatie?.id || null,
        factuur_id: f.id,
      })
      await sb.from('facturen')
        .update({ aanmaning_stap: fase.stap, aanmaning_verstuurd_op: new Date().toISOString() })
        .eq('id', f.id)

      // Bij laatste aanmaning ook interne taak aanmaken voor opvolging incasso
      if (fase.stap === 3) {
        try {
          const { data: nummer } = await sb.rpc('volgende_nummer', {
            p_administratie_id: f.administratie_id,
            p_type: 'taak',
          })
          await sb.from('taken').insert({
            administratie_id: f.administratie_id,
            taaknummer: nummer || '',
            titel: `Incasso overwegen — ${f.factuurnummer}`,
            omschrijving: `Factuur ${f.factuurnummer} (${new Intl.NumberFormat('nl-NL', { style: 'currency', currency: 'EUR' }).format(openstaand)}) staat 30+ dagen open. Klant heeft 3 herinneringen ontvangen.`,
            prioriteit: 'hoog',
            status: 'open',
            relatie_id: relatie?.id || null,
          })
        } catch (e) {
          console.warn('Incasso-taak aanmaken mislukt:', e)
        }
      }

      sent++
    } catch (e) {
      errors.push(`${f.factuurnummer}: ${e instanceof Error ? e.message : 'fout'}`)
    }
  }

  return NextResponse.json({
    checked: facturen.length,
    sent,
    errors: errors.length ? errors : undefined,
  })
}
