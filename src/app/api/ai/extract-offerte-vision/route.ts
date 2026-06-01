import { NextRequest, NextResponse } from 'next/server'
import { generateObject } from 'ai'
import { z } from 'zod'
import { aiModel, AI_MODELS } from '@/lib/ai-model'
import { rateLimit, getRateLimitKey } from '@/lib/rate-limit'
import { createAdminClient } from '@/lib/supabase/admin'

// Vision-gebaseerde offerte-extractie. In plaats van de PDF plat te slaan tot
// tekst, sturen we de gerenderde pagina-AFBEELDINGEN rechtstreeks naar Claude's
// vision-model. Claude leest dan de tabel én de tekening als een mens: het ziet
// welke prijs bij welk element hoort en mist veel minder elementen dan de
// tekst-route. De regex/tekst-extractie blijft als kruiscontrole bestaan.

export const maxDuration = 120
export const dynamic = 'force-dynamic'

const elementSchema = z.object({
  naam: z.string().describe('Zoals "Element 001", "Deur 008", "Element 009"'),
  hoeveelheid: z.number().describe('Geheel getal, minimaal 1'),
  systeem: z.string().default(''),
  kleur: z.string().default(''),
  afmetingen: z.string().describe('Zoals "1000 mm x 2600 mm"').default(''),
  type: z.string().default(''),
  prijs: z.number().describe('Netto/verkoop prijs per stuk in EUR; 0 als "Prijs op aanvraag"'),
  glasType: z.string().default(''),
  beslag: z.string().default(''),
  uwWaarde: z.string().default(''),
  drapirichting: z.string().default(''),
  dorpel: z.string().default(''),
  sluiting: z.string().default(''),
  scharnieren: z.string().default(''),
  gewicht: z.string().default(''),
  omtrek: z.string().default(''),
  confidence: z.number().min(0).max(1).default(1).describe('Hoe zeker ben je over dit element? 1=zeker, <0.7 = controleer extra'),
  confidence_reden: z.string().default('').describe('Korte uitleg bij lage confidence'),
})

const schema = z.object({
  totaal: z.number().describe('Totaal exclusief BTW in EUR'),
  elementen: z.array(elementSchema),
  opmerkingen: z.string().optional().describe('Issues: ghost-referenties, onleesbare delen, missende data etc.'),
})

export async function POST(req: NextRequest) {
  if (!process.env.AI_GATEWAY_API_KEY && !process.env.ANTHROPIC_API_KEY) {
    return NextResponse.json({ error: 'AI_GATEWAY_API_KEY of ANTHROPIC_API_KEY ontbreekt' }, { status: 500 })
  }

  const rl = rateLimit(getRateLimitKey(req, 'extract-vision'), 12, 60_000)
  if (!rl.ok) {
    return NextResponse.json({ error: `Te veel verzoeken — probeer over ${Math.ceil(rl.resetIn / 1000)}s opnieuw` }, { status: 429 })
  }

  const { images, regexResult, leverancier, profiel } = (await req.json()) as {
    images: string[]
    regexResult?: { totaal: number; elementen: Array<{ naam: string; prijs: number; hoeveelheid: number }> }
    leverancier?: string
    profiel?: string
  }

  if (!Array.isArray(images) || images.length === 0) {
    return NextResponse.json({ error: 'Geen pagina-afbeeldingen ontvangen' }, { status: 400 })
  }
  // Begrens het aantal pagina's dat we sturen (kosten/latency); de eerste
  // pagina's bevatten doorgaans de prijs-tabel en de meeste elementen.
  const teVerwerken = images.slice(0, 12)

  const leverancierHint = leverancier
    ? `\nDeze offerte komt van: **${leverancier}**${profiel ? ` (profiel: ${profiel})` : ''}. Gebruik dit voor naam-formatting en waar de prijs typisch staat.\n`
    : ''

  // Historische prijs-correcties als hint (zelfde bron als de tekst-route).
  let correctiesHint = ''
  if (leverancier) {
    try {
      const sb = createAdminClient()
      const slug = leverancier.toLowerCase().replace(/\s+/g, '-')
      const { data: correcties } = await sb
        .from('leverancier_prijs_correctie')
        .select('element_naam, ai_prijs, handmatige_prijs')
        .eq('leverancier_slug', slug)
        .order('created_at', { ascending: false })
        .limit(12)
      if (correcties && correcties.length > 0) {
        const samples = correcties.slice(0, 8).map(c => `- ${c.element_naam}: AI €${c.ai_prijs} → correct €${c.handmatige_prijs}`).join('\n')
        correctiesHint = `\nHISTORISCHE CORRECTIES voor ${leverancier} (leer hiervan):\n${samples}\n`
      }
    } catch (e) {
      console.warn('Kon historische correcties niet laden:', e)
    }
  }

  const system = `Je bent een expert in kozijn-leveranciers offertes (Aluplast, Gealan, Aluprof, Eko-Okna, Kochs, Schüco, Reynaers, Cortizo).${leverancierHint}${correctiesHint}

Je krijgt de PAGINA-AFBEELDINGEN van een leverancier-offerte. Lees ze als een mens: gebruik de visuele layout (tabellen, kaders, tekeningen) om elk ECHT element met zijn specs en prijs te bepalen.

KRITIEKE REGELS:
1. **Alleen ECHTE elementen** — een element heeft een eigen kader/sectie met een naam ("Element NNN", "Deur NNN", "Positie NNN", "Merk XX") en velden als afmetingen, systeem, hoeveelheid.
2. **GEEN GHOST-ELEMENTEN** — een nummer dat losjes in een spec-tekst voorkomt ("element 838") is geen element.
3. **Deuren tellen mee** — "Deur 008" is een element met naam "Deur 008".
4. **Prijs per stuk, excl. BTW.** Kies de NETTO prijs. "Prijs op aanvraag" → 0. Koppel visueel de juiste prijs aan het juiste element (welke rij/kader hoort bij welke tekening).
5. **Hoeveelheid** bij "Hoev./Aantal: N". Default 1.
6. **Volgorde** = volgorde in de PDF.
7. **Naam-formatting** exact: "Element 001", "Deur 008", "Positie 001", "Merk 2A".
8. **Totaal** = som(prijs × hoeveelheid); als er een "Totaal excl. BTW" zichtbaar is dat matcht, gebruik die.
9. **Confidence per element** (0-1): laag bij onleesbare/dubbelzinnige delen; vul confidence_reden bij < 0.9.

Als een afbeelding onscherp of onleesbaar is, vermeld dat in "opmerkingen" i.p.v. te gokken.`

  const crossCheck = regexResult
    ? `Onze tekst-parser vond deze elementen (controleer tegen de afbeeldingen — voeg gemiste toe, verwijder ghosts, corrigeer prijzen):\n${JSON.stringify(regexResult.elementen.slice(0, 60), null, 2)}\nTekst-parser-totaal: €${regexResult.totaal.toFixed(2)}\n\n`
    : ''

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const content: any[] = [
    { type: 'text', text: `${crossCheck}Hieronder ${teVerwerken.length} pagina-afbeelding(en) van de offerte. Extraheer alle echte elementen volgens de regels.` },
    ...teVerwerken.map(b64 => ({
      type: 'image' as const,
      image: b64.startsWith('data:') ? b64 : `data:image/jpeg;base64,${b64}`,
    })),
  ]

  try {
    const { object } = await generateObject({
      model: aiModel(AI_MODELS.vision),
      system,
      schema,
      temperature: 0,
      messages: [{ role: 'user', content }],
      providerOptions: { anthropic: { cacheControl: { type: 'ephemeral' } } },
    })
    return NextResponse.json({ ...object, fromVision: true })
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Vision-extractie faalde' }, { status: 500 })
  }
}
