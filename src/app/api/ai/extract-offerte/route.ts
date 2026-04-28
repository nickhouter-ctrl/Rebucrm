import { NextRequest, NextResponse } from 'next/server'
import { generateObject } from 'ai'
import { z } from 'zod'
import { aiModel } from '@/lib/ai-model'
import { rateLimit, getRateLimitKey } from '@/lib/rate-limit'
import { createAdminClient } from '@/lib/supabase/admin'

// AI-driven offerte extractie. Claude scant de volledige leverancier-PDF tekst
// en geeft een gevalideerde element-lijst terug: naam, hoeveelheid, systeem,
// afmetingen, prijs en specs. Fungeert als controle/fallback op de regex-parser
// zodat er geen ghost-elementen, verkeerde prijzen of gemiste Deur/Element
// nummers meer ontstaan.

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
  confidence: z.number().min(0).max(1).default(1).describe('Hoe zeker ben je over de extractie van dit element? 1=zeker, <0.7 = controleer extra'),
  confidence_reden: z.string().default('').describe('Korte uitleg bij lage confidence'),
})

const schema = z.object({
  totaal: z.number().describe('Totaal exclusief BTW in EUR'),
  elementen: z.array(elementSchema),
  opmerkingen: z.string().optional().describe('Issues gevonden: ghost-referenties, missende data etc.'),
})

export async function POST(req: NextRequest) {
  if (!process.env.AI_GATEWAY_API_KEY && !process.env.ANTHROPIC_API_KEY) {
    return NextResponse.json({ error: 'AI_GATEWAY_API_KEY of ANTHROPIC_API_KEY ontbreekt' }, { status: 500 })
  }

  // Rate-limit: 20 requests per minuut per IP — voorkomt spam/loops
  const rl = rateLimit(getRateLimitKey(req, 'extract'), 20, 60_000)
  if (!rl.ok) {
    return NextResponse.json({ error: `Te veel verzoeken — probeer over ${Math.ceil(rl.resetIn / 1000)}s opnieuw` }, { status: 429 })
  }

  const { text, regexResult, leverancier, profiel } = (await req.json()) as {
    text: string
    regexResult?: { totaal: number; elementen: Array<{ naam: string; prijs: number; hoeveelheid: number }> }
    leverancier?: string
    profiel?: string
  }

  if (!text || text.length < 100) {
    return NextResponse.json({ error: 'PDF-tekst te kort of leeg' }, { status: 400 })
  }

  const leverancierHint = leverancier
    ? `\nDeze offerte komt vast en zeker van: **${leverancier}**${profiel ? ` (profiel: ${profiel})` : ''}. Gebruik dit als ground-truth voor naam-formatting en prijs-locatie.\n`
    : ''

  // Lees historische correcties voor deze leverancier — laat AI de patronen
  // zien zodat dezelfde fout niet 2x gemaakt wordt. Bv. als bij Schüco de
  // AI vaak prijs=0 zette terwijl gebruiker handmatig €450 invulde, vertellen
  // we Claude waar in de PDF die prijs typisch staat.
  let correctiesHint = ''
  if (leverancier) {
    try {
      const sb = createAdminClient()
      const slug = leverancier.toLowerCase().replace(/\s+/g, '-')
      const { data: correcties } = await sb
        .from('leverancier_prijs_correctie')
        .select('element_naam, ai_prijs, handmatige_prijs, pdf_text_sample, created_at')
        .eq('leverancier_slug', slug)
        .order('created_at', { ascending: false })
        .limit(20)
      if (correcties && correcties.length > 0) {
        const samples = correcties.slice(0, 8).map(c => {
          const sample = (c.pdf_text_sample || '').slice(0, 200).replace(/\s+/g, ' ').trim()
          return `- ${c.element_naam}: AI-extractie €${c.ai_prijs} → correct €${c.handmatige_prijs}${sample ? `\n  Context: "${sample}"` : ''}`
        }).join('\n')
        correctiesHint = `\nHISTORISCHE CORRECTIES voor ${leverancier} (gebruiker corrigeerde eerder, leer hiervan):\n${samples}\n`
      }
    } catch (e) {
      console.warn('Kon historische correcties niet laden:', e)
    }
  }

  const system = `Je bent een expert in het analyseren van kozijn-leveranciers offertes (Aluplast, Gealan, Aluprof, Eko-Okna, Kochs, Schüco, Reynaers).${leverancierHint}${correctiesHint}

Je taak: scan de PDF-tekst en geef EXACT de lijst van echte offerte-elementen met hun specs en prijzen.

KRITIEKE REGELS (op basis van fouten die eerder zijn gemaakt):

1. **Alleen ECHTE elementen.** Headers hebben het patroon "Element NNN", "Deur NNN", "Positie NNN", "Merk XX" of "Gekoppeld element NNN" AAN HET BEGIN VAN EEN NIEUWE SECTIE. Elk echt element heeft velden zoals Buitenkader, Hoev./Hoeveelheid, Systeem, Afmetingen in de sectie die erop volgt.

2. **GEEN GHOST ELEMENTEN.** Tekst-referenties zoals "element 838" of "element 589" midden in een spec-tekst zijn GEEN elementen. Negeer ze.

3. **Deuren zijn ook elementen.** Als er "Deur 008" of "Deur 010" staat, dat IS een element en moet worden opgenomen met naam "Deur 008" of "Deur 010".

4. **Prijs per stuk** (excl. BTW). Bij "Prijs op aanvraag" zet je prijs = 0. Als er meerdere prijzen staan (netto, bruto, totaal, etc.), gebruik de NETTO / exclusief BTW prijs.

5. **Hoeveelheid** staat bij "Hoev.: N" of "Hoeveelheid: N" of "Aantal:N". Default = 1.

6. **Volgorde blijft gelijk** aan de originele PDF. Element 001, 002, 003 ... 012 komen in die volgorde terug.

7. **Naam-formatting**: gebruik exact "Element 001" (hoofdletter E, drie-cijferig nummer), "Deur 008" (hoofdletter D), "Positie 001", "Merk 2A".

8. **Totaal** = som van (prijs × hoeveelheid) voor alle elementen met prijs > 0. Als er een "Totaal excl. BTW" in de PDF staat dat matcht, gebruik die waarde.

9. **Confidence per element**: geef per element een score 0-1.
   - 1.0 = element-naam, prijs, hoeveelheid en systeem allemaal duidelijk extraheerbaar
   - 0.7-0.9 = klein twijfelpunt (bv. afmetingen onduidelijk, encoded text)
   - < 0.7 = serieuze twijfel (bv. "Prijs op aanvraag", verschillende prijzen, ghost-referentie risico)
   Vul confidence_reden in zodra de score < 0.9.

Wees grondig. Als iets twijfelachtig is, leg het uit in "opmerkingen".`

  const userPrompt = `Hieronder de volledige tekst van een kozijn-offerte PDF. Extraheer alle echte elementen volgens de regels.

${regexResult ? `Onze regex-parser vond deze elementen (controleer of dit klopt, voeg toe/corrigeer/verwijder waar nodig):\n${JSON.stringify(regexResult.elementen.map(e => ({ naam: e.naam, prijs: e.prijs, hoeveelheid: e.hoeveelheid })), null, 2)}\nRegex-totaal: €${regexResult.totaal.toFixed(2)}\n\n` : ''}
--- PDF TEKST ---
${text.slice(0, 80000)}
--- EINDE TEKST ---`

  try {
    const { object } = await generateObject({
      model: aiModel('anthropic/claude-sonnet-4-5'),
      system,
      schema,
      temperature: 0,
      messages: [{ role: 'user', content: userPrompt }],
      providerOptions: {
        anthropic: { cacheControl: { type: 'ephemeral' } },
      },
    })

    return NextResponse.json({ ...object, fromAi: true })
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'AI-extractie faalde' }, { status: 500 })
  }
}
