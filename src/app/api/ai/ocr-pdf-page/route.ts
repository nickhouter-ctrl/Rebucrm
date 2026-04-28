import { NextRequest, NextResponse } from 'next/server'
import { generateText } from 'ai'
import { aiModel } from '@/lib/ai-model'
import { rateLimit, getRateLimitKey } from '@/lib/rate-limit'

// OCR-fallback voor scan-PDFs zonder text-layer.
// Client levert een image (base64) van een PDF-pagina; we vragen Claude Vision
// om alle tekst zo letterlijk mogelijk te lezen — inclusief tabellen, headers,
// element-namen en prijzen. Output gaat door dezelfde leverancier-parser
// als de pdfjs text-extractie, dus de scan-flow lijkt op vector-PDFs.

export const maxDuration = 60
export const dynamic = 'force-dynamic'

export async function POST(req: NextRequest) {
  if (!process.env.AI_GATEWAY_API_KEY && !process.env.ANTHROPIC_API_KEY) {
    return NextResponse.json({ error: 'AI_GATEWAY_API_KEY of ANTHROPIC_API_KEY ontbreekt' }, { status: 500 })
  }
  // OCR is duur — strakke rate-limit
  const rl = rateLimit(getRateLimitKey(req, 'ocr'), 30, 60_000)
  if (!rl.ok) {
    return NextResponse.json({ error: `Te veel verzoeken — probeer over ${Math.ceil(rl.resetIn / 1000)}s opnieuw` }, { status: 429 })
  }

  const { imageBase64 } = (await req.json()) as { imageBase64?: string }
  if (!imageBase64) {
    return NextResponse.json({ error: 'imageBase64 ontbreekt' }, { status: 400 })
  }

  const system = `Je bent een OCR-engine voor leveranciers-offertes. Lees ALLE zichtbare tekst zo letterlijk mogelijk uit de afbeelding.

REGELS:
- Behoud de oorspronkelijke layout zoveel mogelijk: tabellen blijven tabellen, regels blijven gescheiden door newlines.
- Element-namen ('Element 001', 'Deur 008', 'Merk A', 'Positie 003') exact overnemen.
- Prijzen, hoeveelheden en afmetingen letterlijk: '€ 1.234,56', '1500 mm x 1200 mm', 'Hoeveelheid: 1'.
- Specs ('Systeem:', 'Kleur:', 'Glas:', 'Beslag:', 'Vleugel') op aparte regels.
- Als een woord onduidelijk is: schrijf het zo goed mogelijk over (geen [onleesbaar]).
- Geen interpretatie, geen samenvatting — pure transcriptie.

Als de afbeelding GEEN tekst bevat, retourneer 'NO_TEXT'.`

  try {
    const { text } = await generateText({
      model: aiModel('anthropic/claude-sonnet-4-5'),
      system,
      temperature: 0,
      messages: [
        {
          role: 'user',
          content: [
            { type: 'image', image: `data:image/jpeg;base64,${imageBase64}` },
            { type: 'text', text: 'Lees alle zichtbare tekst.' },
          ],
        },
      ],
      providerOptions: {
        anthropic: { cacheControl: { type: 'ephemeral' } },
      },
    })

    if (!text || text.trim() === 'NO_TEXT' || text.trim().length < 20) {
      return NextResponse.json({ text: '', empty: true })
    }
    return NextResponse.json({ text })
  } catch (e) {
    console.error('OCR fout:', e)
    return NextResponse.json({ error: e instanceof Error ? e.message : 'OCR mislukt' }, { status: 500 })
  }
}
