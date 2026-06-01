import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { sendEmail } from '@/lib/email'

// Maandelijks overzicht van goedgekeurde vrije uren per medewerker naar de
// boekhouding (Joost van Kooten). Draait op de 1e van de maand en rapporteert
// de ZOJUIST afgelopen maand.
//
// Ontvanger: env VRIJE_UREN_RAPPORT_EMAIL (zodat het adres niet hardgecodeerd
// in de code staat). Ontbreekt die → de cron slaat over en logt dat.
//
// Schedule: '0 7 1 * *' (1e van de maand, 07:00).

export const dynamic = 'force-dynamic'
export const maxDuration = 60

function maandNaam(m: number): string {
  return ['januari', 'februari', 'maart', 'april', 'mei', 'juni', 'juli', 'augustus', 'september', 'oktober', 'november', 'december'][m]
}

export async function GET(req: NextRequest) {
  const auth = req.headers.get('authorization')
  if (process.env.CRON_SECRET && auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const ontvanger = process.env.VRIJE_UREN_RAPPORT_EMAIL
  if (!ontvanger) {
    return NextResponse.json({ skipped: true, reden: 'VRIJE_UREN_RAPPORT_EMAIL niet ingesteld' })
  }

  // Afgelopen maand bepalen
  const nu = new Date()
  const jaar = nu.getMonth() === 0 ? nu.getFullYear() - 1 : nu.getFullYear()
  const maand = nu.getMonth() === 0 ? 11 : nu.getMonth() - 1 // 0-based vorige maand
  const periodeStart = `${jaar}-${String(maand + 1).padStart(2, '0')}-01`
  const eindeDt = new Date(jaar, maand + 1, 0) // laatste dag van de maand
  const periodeEind = `${jaar}-${String(maand + 1).padStart(2, '0')}-${String(eindeDt.getDate()).padStart(2, '0')}`

  const sb = createAdminClient()
  // Goedgekeurde vrije dagen die (deels) in de afgelopen maand vallen.
  const { data: rows } = await sb
    .from('vrije_dagen')
    .select('start_datum, eind_datum, aantal_uren, type, medewerker:medewerkers(naam)')
    .eq('status', 'goedgekeurd')
    .lte('start_datum', periodeEind)
    .gte('eind_datum', periodeStart)

  // Per medewerker totaliseren
  const perMedewerker = new Map<string, { uren: number; dagen: number }>()
  for (const r of rows || []) {
    const naam = (Array.isArray(r.medewerker) ? r.medewerker[0] : r.medewerker)?.naam || 'Onbekend'
    // Dagen binnen de maand-periode (overlap)
    const s = new Date(r.start_datum < periodeStart ? periodeStart : r.start_datum)
    const e = new Date(r.eind_datum > periodeEind ? periodeEind : r.eind_datum)
    const dagen = Math.max(1, Math.round((e.getTime() - s.getTime()) / 86400000) + 1)
    const entry = perMedewerker.get(naam) || { uren: 0, dagen: 0 }
    entry.dagen += dagen
    entry.uren += Number(r.aantal_uren || 0)
    perMedewerker.set(naam, entry)
  }

  const regels = [...perMedewerker.entries()].sort((a, b) => a[0].localeCompare(b[0]))
  const rijenHtml = regels.length === 0
    ? '<tr><td colspan="3" style="padding:8px;color:#888">Geen vrije dagen in deze maand.</td></tr>'
    : regels.map(([naam, v]) =>
        `<tr><td style="padding:6px 12px;border-bottom:1px solid #eee">${naam}</td>` +
        `<td style="padding:6px 12px;border-bottom:1px solid #eee;text-align:right">${v.dagen}</td>` +
        `<td style="padding:6px 12px;border-bottom:1px solid #eee;text-align:right">${v.uren > 0 ? v.uren : '—'}</td></tr>`,
      ).join('')

  const html = `<p>Hallo Joost,</p>
<p>Hierbij het overzicht van de opgenomen vrije dagen over <strong>${maandNaam(maand)} ${jaar}</strong>:</p>
<table style="border-collapse:collapse;width:100%;max-width:480px">
  <thead><tr>
    <th style="padding:6px 12px;text-align:left;border-bottom:2px solid #ddd">Medewerker</th>
    <th style="padding:6px 12px;text-align:right;border-bottom:2px solid #ddd">Dagen</th>
    <th style="padding:6px 12px;text-align:right;border-bottom:2px solid #ddd">Uren</th>
  </tr></thead>
  <tbody>${rijenHtml}</tbody>
</table>
<p style="color:#888;font-size:12px">Automatisch gegenereerd door het Rebu CRM.</p>`

  try {
    await sendEmail({
      to: ontvanger,
      subject: `Vrije uren ${maandNaam(maand)} ${jaar} — Rebu Kozijnen`,
      html,
    })
  } catch (err) {
    return NextResponse.json({ error: 'Mail versturen mislukt: ' + (err instanceof Error ? err.message : String(err)) }, { status: 500 })
  }

  return NextResponse.json({ success: true, maand: `${maandNaam(maand)} ${jaar}`, medewerkers: regels.length })
}
