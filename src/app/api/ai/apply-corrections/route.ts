import { NextRequest, NextResponse } from 'next/server'
import { generateObject, gateway } from 'ai'
import { z } from 'zod'

// Correctie-loop endpoint. Krijgt:
// - de huidige concept-state (regels, zichtbaarheid per element, marges)
// - een lijst correcties die de gebruiker via UI heeft aangewezen (verbergen, verwijderen, aanpassen, verplaatsen)
// - optioneel: vrij tekstveld met aanvullende instructies
// - originele PDF-tekst voor context
//
// Geeft terug: aangepaste concept-state met diff-markers per wijziging zodat de UI kan highlighten.

export const maxDuration = 120
export const dynamic = 'force-dynamic'

const correctieInputSchema = z.object({
  type: z.enum(['verbergen', 'verwijderen', 'aanpassen', 'verplaatsen']),
  target: z.string().describe('Welk element/regel/pagina dit betreft (naam of index)'),
  detail: z.string().optional().describe('Bij aanpassen: nieuwe waarde. Bij verplaatsen: nieuwe positie.'),
})

const elementUpdateSchema = z.object({
  naam: z.string(),
  hoeveelheid: z.number().optional(),
  prijs: z.number().optional(),
  marge_percentage: z.number().optional().describe('Override marge voor dit element'),
  verborgen: z.boolean().optional().describe('Element verbergen in concept (niet in output PDF)'),
  verwijderd: z.boolean().optional().describe('Element volledig verwijderen uit concept'),
})

const regelUpdateSchema = z.object({
  index: z.number().int().describe('Index in regels-array; -1 voor toevoegen aan eind'),
  actie: z.enum(['toevoegen', 'aanpassen', 'verwijderen']),
  omschrijving: z.string().optional(),
  aantal: z.number().optional(),
  prijs: z.number().optional(),
  btw_percentage: z.number().optional(),
})

const responseSchema = z.object({
  element_updates: z.array(elementUpdateSchema).default([]),
  regel_updates: z.array(regelUpdateSchema).default([]),
  toelichting: z.string().describe('Korte uitleg per wijziging'),
  warnings: z.array(z.string()).default([]),
})

const requestSchema = z.object({
  conceptState: z.object({
    elementen: z.array(z.object({
      naam: z.string(),
      hoeveelheid: z.number(),
      prijs: z.number(),
      marge: z.number(),
      verborgen: z.boolean().optional(),
    })),
    regels: z.array(z.object({
      omschrijving: z.string(),
      aantal: z.number(),
      prijs: z.number(),
      btw_percentage: z.number(),
    })),
    margePercentage: z.number(),
    onderwerp: z.string().optional(),
  }),
  correcties: z.array(correctieInputSchema).default([]),
  vrijTekst: z.string().optional(),
  leverancier: z.string().optional(),
  pdfTekstSample: z.string().optional().describe('Eerste paar duizend chars van de originele PDF voor context'),
})

export async function POST(req: NextRequest) {
  if (!process.env.AI_GATEWAY_API_KEY && !process.env.ANTHROPIC_API_KEY) {
    return NextResponse.json({ error: 'AI_GATEWAY_API_KEY of ANTHROPIC_API_KEY ontbreekt' }, { status: 500 })
  }

  let parsed
  try {
    parsed = requestSchema.parse(await req.json())
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Ongeldige input' }, { status: 400 })
  }

  if (parsed.correcties.length === 0 && !parsed.vrijTekst?.trim()) {
    return NextResponse.json({ error: 'Geen correcties en geen vrije tekst meegegeven' }, { status: 400 })
  }

  const system = `Je bent een offerte-correctie assistent voor een kozijnenbedrijf.

Je krijgt:
1. De HUIDIGE concept-offerte state (elementen uit leveranciers-PDF + offerte-regels die naar de klant gaan)
2. Een LIJST CORRECTIES die de medewerker via klik-acties heeft aangewezen
3. Eventueel een VRIJ TEKSTVELD met aanvullende instructies
4. Eventueel een SAMPLE van de originele PDF-tekst voor context

Je taak: vertaal de correcties + vrije tekst naar concrete updates op elementen en regels.

KRITIEKE REGELS:
- "verbergen" element → verborgen=true (element blijft in interne state, maar verschijnt niet in offerte naar klant)
- "verwijderen" element → verwijderd=true (volledig weg)
- "aanpassen" element + detail bevat getal → werk prijs of hoeveelheid bij
- "aanpassen" met percentage in detail → werk marge_percentage bij
- Vrije tekst kan zaken zijn als:
  * "voeg algemene voorwaarden toe" → regel_update met actie:toevoegen, index:-1
  * "verberg alle prijzen op pagina N" → mark elements on that page als verborgen
  * "wijzig BTW naar 9%" → btw_percentage update op alle regels
- NOOIT inkoopprijzen blootstellen in regels.omschrijving of regels.prijs
- Bij twijfel: leg het uit in 'toelichting' en zet een warning
- Output ALLEEN updates voor wat daadwerkelijk verandert (laat ongewijzigde elementen/regels weg)
- 'toelichting' is een korte tekst (max 3 zinnen) die de medewerker leest om te zien wat er is gedaan`

  const userPrompt = `=== HUIDIGE CONCEPT-STATE ===
${JSON.stringify(parsed.conceptState, null, 2)}

=== CORRECTIES (door medewerker aangeklikt) ===
${parsed.correcties.length > 0 ? JSON.stringify(parsed.correcties, null, 2) : '(geen)'}

=== VRIJE TEKST INSTRUCTIES ===
${parsed.vrijTekst || '(geen)'}

${parsed.leverancier ? `Leverancier: ${parsed.leverancier}\n` : ''}
${parsed.pdfTekstSample ? `\n=== ORIGINELE PDF (sample) ===\n${parsed.pdfTekstSample.slice(0, 4000)}\n` : ''}

Geef nu de element_updates en regel_updates die nodig zijn om deze correcties toe te passen.`

  try {
    const { object } = await generateObject({
      model: gateway('anthropic/claude-sonnet-4-5'),
      system,
      schema: responseSchema,
      temperature: 0,
      messages: [{ role: 'user', content: userPrompt }],
      providerOptions: {
        anthropic: { cacheControl: { type: 'ephemeral' } },
      },
    })

    return NextResponse.json(object)
  } catch (e) {
    return NextResponse.json({
      error: e instanceof Error ? e.message : 'AI-correctie faalde',
    }, { status: 500 })
  }
}
