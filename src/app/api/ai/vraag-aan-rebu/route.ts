import { NextRequest, NextResponse } from 'next/server'
import { generateText, tool } from 'ai'
import { z } from 'zod'
import { aiModel } from '@/lib/ai-model'
import { rateLimit } from '@/lib/rate-limit'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { getAdministratieId } from '@/lib/actions'

// "Vraag aan Rebu" — AI-agent die natuurlijke-taal-vragen over je CRM
// beantwoordt door tools aan te roepen (relaties tellen, offertes opzoeken,
// omzet per maand, etc.). Geen vrije SQL — alle queries gaan via gescopete
// helpers zodat de agent niet buiten de eigen administratie kan kijken.

export const maxDuration = 60
export const dynamic = 'force-dynamic'

export async function POST(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Niet ingelogd' }, { status: 401 })

  const rl = rateLimit(`vraag-rebu:${user.id}`, 30, 60_000)
  if (!rl.ok) return NextResponse.json({ error: `Te veel verzoeken — wacht ${Math.ceil(rl.resetIn / 1000)}s` }, { status: 429 })

  const adminId = await getAdministratieId()
  if (!adminId) return NextResponse.json({ error: 'Geen administratie' }, { status: 400 })

  const { vraag, geschiedenis } = (await req.json()) as {
    vraag: string
    geschiedenis?: { rol: 'user' | 'assistant'; tekst: string }[]
  }
  if (!vraag || vraag.trim().length < 3) {
    return NextResponse.json({ error: 'Vraag te kort' }, { status: 400 })
  }

  const sb = createAdminClient()

  // Tools — elk met scope-by-administratie en redelijke limieten
  const tools = {
    zoekRelaties: tool({
      description: 'Zoek relaties (klanten/leveranciers) op naam/email/plaats. Geeft tot 20 resultaten.',
      inputSchema: z.object({
        zoekterm: z.string().describe('Vrije zoekterm — wordt geprobeerd op bedrijfsnaam, contactpersoon, email, plaats'),
      }),
      execute: async ({ zoekterm }) => {
        const t = zoekterm.trim()
        const { data } = await sb.from('relaties')
          .select('id, bedrijfsnaam, contactpersoon, email, telefoon, plaats, type')
          .eq('administratie_id', adminId)
          .or(`bedrijfsnaam.ilike.%${t}%,contactpersoon.ilike.%${t}%,email.ilike.%${t}%,plaats.ilike.%${t}%`)
          .limit(20)
        return data || []
      },
    }),
    zoekOffertes: tool({
      description: 'Zoek offertes met filters: status, klant-id, bedrag-range, periode. Geeft tot 30 resultaten.',
      inputSchema: z.object({
        status: z.enum(['concept', 'verzonden', 'geaccepteerd', 'afgewezen', 'verlopen']).optional(),
        relatieId: z.string().optional(),
        minBedrag: z.number().optional(),
        maxBedrag: z.number().optional(),
        vanafDatum: z.string().optional().describe('YYYY-MM-DD'),
        totDatum: z.string().optional().describe('YYYY-MM-DD'),
        zoekterm: z.string().optional().describe('Vrije zoekterm op offertenummer of onderwerp'),
      }),
      execute: async (params) => {
        let q = sb.from('offertes')
          .select('id, offertenummer, datum, status, totaal, subtotaal, onderwerp, relatie:relaties(bedrijfsnaam)')
          .eq('administratie_id', adminId)
          .order('datum', { ascending: false })
          .limit(30)
        if (params.status) q = q.eq('status', params.status)
        if (params.relatieId) q = q.eq('relatie_id', params.relatieId)
        if (params.minBedrag != null) q = q.gte('totaal', params.minBedrag)
        if (params.maxBedrag != null) q = q.lte('totaal', params.maxBedrag)
        if (params.vanafDatum) q = q.gte('datum', params.vanafDatum)
        if (params.totDatum) q = q.lte('datum', params.totDatum)
        if (params.zoekterm) q = q.or(`offertenummer.ilike.%${params.zoekterm}%,onderwerp.ilike.%${params.zoekterm}%`)
        const { data } = await q
        return data || []
      },
    }),
    zoekFacturen: tool({
      description: 'Zoek facturen met filters: status, type, klant, openstaand-of-niet, periode. Geeft tot 30 resultaten.',
      inputSchema: z.object({
        status: z.enum(['concept', 'verzonden', 'betaald', 'deels_betaald', 'vervallen', 'gecrediteerd']).optional(),
        type: z.enum(['volledig', 'aanbetaling', 'restbetaling', 'credit']).optional(),
        relatieId: z.string().optional(),
        alleenOpenstaand: z.boolean().optional(),
        vanafDatum: z.string().optional(),
        totDatum: z.string().optional(),
      }),
      execute: async (p) => {
        let q = sb.from('facturen')
          .select('id, factuurnummer, datum, vervaldatum, status, factuur_type, totaal, betaald_bedrag, onderwerp, relatie:relaties(bedrijfsnaam)')
          .eq('administratie_id', adminId)
          .order('datum', { ascending: false })
          .limit(30)
        if (p.status) q = q.eq('status', p.status)
        if (p.type) q = q.eq('factuur_type', p.type)
        if (p.relatieId) q = q.eq('relatie_id', p.relatieId)
        if (p.vanafDatum) q = q.gte('datum', p.vanafDatum)
        if (p.totDatum) q = q.lte('datum', p.totDatum)
        const { data } = await q
        let rows = data || []
        if (p.alleenOpenstaand) rows = rows.filter(f => Number(f.totaal || 0) - Number(f.betaald_bedrag || 0) > 0.01 && f.status !== 'gecrediteerd' && f.status !== 'betaald')
        return rows
      },
    }),
    omzetPerPeriode: tool({
      description: 'Geeft omzet (totaal, geaccepteerd, betaald) per maand binnen een datum-range.',
      inputSchema: z.object({
        vanafDatum: z.string().describe('YYYY-MM-DD'),
        totDatum: z.string().describe('YYYY-MM-DD'),
      }),
      execute: async ({ vanafDatum, totDatum }) => {
        const [{ data: offertes }, { data: facturen }] = await Promise.all([
          sb.from('offertes').select('datum, status, totaal').eq('administratie_id', adminId).gte('datum', vanafDatum).lte('datum', totDatum),
          sb.from('facturen').select('datum, status, totaal, betaald_bedrag').eq('administratie_id', adminId).gte('datum', vanafDatum).lte('datum', totDatum),
        ])
        const buckets: Record<string, { offertes: number; geaccepteerd: number; gefactureerd: number; betaald: number }> = {}
        const get = (d: string) => d.slice(0, 7)
        for (const o of (offertes || [])) {
          const k = get(o.datum); if (!buckets[k]) buckets[k] = { offertes: 0, geaccepteerd: 0, gefactureerd: 0, betaald: 0 }
          buckets[k].offertes += Number(o.totaal || 0)
          if (o.status === 'geaccepteerd') buckets[k].geaccepteerd += Number(o.totaal || 0)
        }
        for (const f of (facturen || [])) {
          const k = get(f.datum); if (!buckets[k]) buckets[k] = { offertes: 0, geaccepteerd: 0, gefactureerd: 0, betaald: 0 }
          buckets[k].gefactureerd += Number(f.totaal || 0)
          buckets[k].betaald += Number(f.betaald_bedrag || 0)
        }
        return Object.entries(buckets).sort(([a], [b]) => a.localeCompare(b)).map(([maand, v]) => ({ maand, ...v }))
      },
    }),
    tellingen: tool({
      description: 'Telt aantallen per entiteit (relaties, offertes, facturen, taken, projecten) optioneel met filter op status.',
      inputSchema: z.object({
        entiteit: z.enum(['relaties', 'offertes', 'facturen', 'taken', 'projecten']),
        status: z.string().optional(),
      }),
      execute: async ({ entiteit, status }) => {
        let q = sb.from(entiteit).select('id', { count: 'exact', head: true }).eq('administratie_id', adminId)
        if (status) q = q.eq('status', status)
        const { count } = await q
        return { entiteit, status: status || 'alle', aantal: count || 0 }
      },
    }),
    openstaandeFacturen: tool({
      description: 'Geeft alle openstaande (verzonden + vervallen + deels_betaald) facturen, gesorteerd op vervaldatum (oudste eerst).',
      inputSchema: z.object({
        minDagenOver: z.number().optional().describe('Alleen vervallen facturen die N dagen of meer geleden vervallen zijn'),
      }),
      execute: async ({ minDagenOver }) => {
        const { data } = await sb.from('facturen')
          .select('id, factuurnummer, datum, vervaldatum, totaal, betaald_bedrag, status, relatie:relaties(bedrijfsnaam)')
          .eq('administratie_id', adminId)
          .in('status', ['verzonden', 'deels_betaald', 'vervallen'])
          .order('vervaldatum', { ascending: true })
          .limit(50)
        let rows = (data || []).filter(f => Number(f.totaal || 0) - Number(f.betaald_bedrag || 0) > 0.01)
        if (minDagenOver != null) {
          const drempel = new Date(); drempel.setDate(drempel.getDate() - minDagenOver)
          rows = rows.filter(f => f.vervaldatum && new Date(f.vervaldatum) <= drempel)
        }
        return rows
      },
    }),
  }

  const systemPrompt = `Je bent "Rebu Assistent" — een hulpzaam medewerkers-tool voor Rebu Kozijnen. Je beantwoordt vragen over de CRM van Rebu door beschikbare tools aan te roepen. Belangrijke regels:

1. ANTWOORD IN HET NEDERLANDS, kort en bondig.
2. Geef CONCRETE getallen + tabellen waar mogelijk. Gebruik markdown.
3. Bedragen in EUR met komma-decimaal: €12.345,67.
4. Als de gebruiker vraagt "open offertes", "openstaande facturen", "klanten met X" — gebruik de juiste tool met passende filters.
5. Als het antwoord niet via tools beantwoordbaar is, zeg dat eerlijk en stel voor hoe de gebruiker het zelf kan vinden.
6. Bij vergelijkingsvragen ("welke maand was beste"): roep omzetPerPeriode aan en bereken zelf.
7. Datums altijd YYYY-MM-DD. Vandaag = ${new Date().toISOString().slice(0, 10)}.`

  // Bouw conversation history
  type Msg = { role: 'user' | 'assistant'; content: string }
  const messages: Msg[] = []
  for (const h of (geschiedenis || []).slice(-6)) {
    messages.push({ role: h.rol, content: h.tekst })
  }
  messages.push({ role: 'user', content: vraag })

  try {
    const result = await generateText({
      model: aiModel('anthropic/claude-sonnet-4-5'),
      system: systemPrompt,
      messages,
      tools,
      stopWhen: ({ steps }) => steps.length >= 8,
    })
    return NextResponse.json({ antwoord: result.text })
  } catch (e) {
    console.error('vraag-aan-rebu fout:', e)
    return NextResponse.json({ error: e instanceof Error ? e.message : 'AI-fout' }, { status: 500 })
  }
}
