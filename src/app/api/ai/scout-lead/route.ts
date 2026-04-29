import { NextRequest, NextResponse } from 'next/server'
import { generateObject } from 'ai'
import { z } from 'zod'
import { aiModel } from '@/lib/ai-model'
import { rateLimit } from '@/lib/rate-limit'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { getAdministratieId } from '@/lib/actions'

// AI Lead-Scout: gebruiker plakt tekst (Marktplaats-listing, Werkspot-aanvraag,
// Facebook-post, e-mail, etc.) en AI extraheert lead-info + scoort relevantie.
// Resultaat wordt opgeslagen in `leads` tabel met bron='ai-scout' zodat het
// op de scout-pagina blijft staan en konverteerbaar is naar relatie.

export const maxDuration = 60
export const dynamic = 'force-dynamic'

const leadSchema = z.object({
  bedrijfsnaam: z.string().describe('Bedrijfsnaam, of naam particulier als geen bedrijf').default(''),
  contactpersoon: z.string().describe('Voornaam achternaam').default(''),
  email: z.string().describe('Geldig e-mailadres of leeg').default(''),
  telefoon: z.string().describe('Telefoonnummer of leeg').default(''),
  postcode: z.string().describe('NL-postcode of leeg').default(''),
  plaats: z.string().default(''),
  type_werk: z.string().describe('Beknopt type kozijnenwerk: bv. "kunststof voordeur", "5x raam vervangen", "schuifpui aanbouw"').default(''),
  budget_indicatie: z.string().describe('Budgetindicatie als genoemd, of leeg').default(''),
  urgentie: z.enum(['hoog', 'middel', 'laag', 'onbekend']).default('onbekend'),
  relevantie_score: z.number().describe('0-10: hoe relevant voor Rebu Kozijnen (kunststof/aluminium kozijnen). 0=irrelevant, 10=perfecte fit').default(5),
  motivatie: z.string().describe('Korte uitleg waarom relevant of niet').default(''),
})

const responseSchema = z.object({
  leads: z.array(leadSchema),
  notitie: z.string().describe('Globale notitie over de input — bv. "geen kozijnen-vraag gevonden"').default(''),
})

export async function POST(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Niet ingelogd' }, { status: 401 })

  const rl = rateLimit(`scout:${user.id}`, 20, 60_000)
  if (!rl.ok) return NextResponse.json({ error: `Te veel verzoeken — wacht ${Math.ceil(rl.resetIn / 1000)}s` }, { status: 429 })

  const adminId = await getAdministratieId()
  if (!adminId) return NextResponse.json({ error: 'Geen administratie' }, { status: 400 })

  const { tekst, opslaan } = (await req.json()) as { tekst: string; opslaan?: boolean }
  if (!tekst || tekst.trim().length < 30) {
    return NextResponse.json({ error: 'Tekst te kort (min 30 chars)' }, { status: 400 })
  }

  try {
    const { object } = await generateObject({
      model: aiModel('anthropic/claude-haiku-4-5-20251001'),
      schema: responseSchema,
      system: `Je bent een lead-scout voor Rebu Kozijnen (Wormerveer, regio Zaanstreek). Rebu levert kunststof + aluminium kozijnen, ramen, deuren en schuifpuien aan particulieren EN aannemers. Je scant gepaste tekst (Marktplaats, Werkspot, Facebook, email) en extraheert mogelijke leads.

Regels:
- Score 0-10 voor relevantie: kunststof/aluminium kozijnen = hoog, hout = laag, irrelevant onderwerp = 0.
- Bewijs op basis van wat de tekst zegt, verzin geen contactgegevens.
- Multi-leads kunnen: als de tekst meerdere aanvragen bevat, geef ze los terug.
- Particulier zonder bedrijf? Zet "particulier" in bedrijfsnaam, naam in contactpersoon.
- Plaats: probeer regio Zaanstreek/Noord-Holland te identificeren (bonus voor lokaal).`,
      messages: [{ role: 'user', content: `Analyseer deze tekst en extraheer lead(s):\n\n${tekst.slice(0, 8000)}` }],
    })

    let opgeslagenIds: string[] = []
    if (opslaan && object.leads.length > 0) {
      const sb = createAdminClient()
      const inserts = object.leads
        .filter(l => l.relevantie_score >= 4)
        .map(l => ({
          administratie_id: adminId,
          bedrijfsnaam: l.bedrijfsnaam || l.contactpersoon || 'Onbekend',
          contactpersoon: l.contactpersoon || null,
          email: l.email || null,
          telefoon: l.telefoon || null,
          postcode: l.postcode || null,
          plaats: l.plaats || null,
          bron: 'ai-scout',
          status: 'nieuw',
          notities: [
            l.type_werk && `Werk: ${l.type_werk}`,
            l.budget_indicatie && `Budget: ${l.budget_indicatie}`,
            l.urgentie !== 'onbekend' && `Urgentie: ${l.urgentie}`,
            `Relevantie ${l.relevantie_score}/10: ${l.motivatie}`,
          ].filter(Boolean).join('\n'),
        }))
      if (inserts.length > 0) {
        const { data } = await sb.from('leads').insert(inserts).select('id')
        opgeslagenIds = (data || []).map(d => d.id)
      }
    }

    return NextResponse.json({ ...object, opgeslagenIds })
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'AI-fout' }, { status: 500 })
  }
}
