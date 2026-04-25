import { NextRequest, NextResponse } from 'next/server'
import { generateObject } from 'ai'
import { z } from 'zod'
import { aiModel } from '@/lib/ai-model'
import { createAdminClient } from '@/lib/supabase/admin'
import { detectLeverancierFromText } from '@/lib/pdf-parser'

// Snel + goedkoop classification-endpoint: Haiku 4.5 leest de eerste paar
// pagina's PDF-tekst en zegt welke leverancier het is. Het resultaat wordt
// gecombineerd met een regex-second-opinion zodat we een confidence kunnen geven.
//
// Bij confidence >= 0.7 → frontend gaat door zonder vragen.
// Bij confidence < 0.7  → frontend toont modal met dropdown + "nieuwe leverancier".

export const maxDuration = 30
export const dynamic = 'force-dynamic'

const schema = z.object({
  leverancier_slug: z.string().describe('Slug uit de bekende-leveranciers-lijst, of "onbekend" als je het niet kunt bepalen'),
  display_naam: z.string().describe('Hoe de leverancier zichzelf noemt in de PDF (bv. "Schüco", "Eko-Okna")'),
  profiel: z.string().describe('Het profielsysteem (bv. "Aluprof", "Aluplast", "K-Vision", "Schüco Slide"), leeg als onbekend').default(''),
  confidence: z.number().min(0).max(1).describe('Hoe zeker ben je? 0-1'),
  reden: z.string().describe('Korte uitleg waarom — welke woorden/patronen in de PDF wezen hierop'),
})

export async function POST(req: NextRequest) {
  // AI Gateway gebruikt AI_GATEWAY_API_KEY (Vercel) of valt terug op
  // ANTHROPIC_API_KEY voor lokale dev als provider-credentials.
  if (!process.env.AI_GATEWAY_API_KEY && !process.env.ANTHROPIC_API_KEY) {
    return NextResponse.json({ error: 'AI_GATEWAY_API_KEY of ANTHROPIC_API_KEY ontbreekt' }, { status: 500 })
  }

  const { text, offerteId } = (await req.json()) as { text: string; offerteId?: string }

  if (!text || text.length < 50) {
    return NextResponse.json({ error: 'PDF-tekst te kort' }, { status: 400 })
  }

  // Haal bekende leveranciers op uit de database — die geven we mee als
  // ground-truth zodat de AI niet hallucineert maar uit een vaste lijst kiest
  // of expliciet 'onbekend' teruggeeft.
  const sb = createAdminClient()
  const { data: bekendeLeveranciers } = await sb
    .from('bekende_leveranciers')
    .select('naam, display_naam, aliases, profielen, parser_key')
    .order('validated_count', { ascending: false })

  const lijst = (bekendeLeveranciers || []).map(l => {
    const aliases = (l.aliases as string[] | null)?.length ? ` (ook bekend als: ${(l.aliases as string[]).join(', ')})` : ''
    const profielen = (l.profielen as string[] | null)?.length ? ` — profielen: ${(l.profielen as string[]).join(', ')}` : ''
    return `- ${l.naam}: "${l.display_naam}"${aliases}${profielen}`
  }).join('\n')

  // Regex second opinion — geeft hint waarover AI zekerder kan zijn
  const regexHint = detectLeverancierFromText(text)

  const system = `Je bent een classifier voor kozijn-leveranciers offertes. Je krijgt de eerste paar pagina's tekst van een PDF en moet bepalen welke leverancier deze offerte heeft uitgebracht.

KEUZE-LIJST (gebruik exact deze slugs in 'leverancier_slug'):
${lijst || '- onbekend'}

Als de PDF een leverancier toont die NIET in de lijst staat (nieuwe leverancier), geef dan:
- leverancier_slug: "onbekend"
- display_naam: de naam zoals die in de PDF staat
- confidence: hoe zeker je bent dat het écht een nieuwe leverancier is

REGELS:
1. Kijk naar logo-tekst, header, footer, "Offerte van:", merknaam profielsysteem
2. Encoded Schüco-PDF's hebben patronen als "1IVO" (= "Merk"), "&VYXSTV" (= "Brutopr"), "Sch¿co". Als je dat ziet → schuco met confidence ≥ 0.95
3. Eko-Okna gebruikt "Hoev.: N" en levert profielen van Aluprof/Aluplast — herken aan profielnaam Aluprof/Aluplast in combinatie met Eko-Okna footer
4. Gealan vs Gealan-NL: oude variant heeft "Merk A Aantal: N", nieuwe NL-variant heeft "Productie maten" + locatie-namen. Beide → slug "gealan"
5. Kochs heeft "K-Vision", "Primus MD", "Premidoor"
6. Confidence ≥ 0.85 alleen als je echt zeker bent
7. Bij twijfel: lagere confidence (0.4-0.6), niet gokken op hoge zekerheid`

  const userPrompt = `Hieronder de eerste pagina's van een leveranciers-offerte. Welke leverancier?

${regexHint ? `(Onze regex-detectie suggereert: "${regexHint}" — gebruik dit als hint maar overschrijf als je iets anders ziet)\n\n` : ''}
--- PDF TEKST (eerste 5000 chars) ---
${text.slice(0, 5000)}
--- EINDE ---`

  try {
    const { object } = await generateObject({
      model: aiModel('anthropic/claude-haiku-4-5'),
      system,
      schema,
      temperature: 0,
      messages: [{ role: 'user', content: userPrompt }],
      // System prompt cachen — register-lijst is identiek tussen calls
      providerOptions: {
        anthropic: { cacheControl: { type: 'ephemeral' } },
      },
    })

    // Combineer AI met regex: als beide hetzelfde zeggen → confidence boost
    // Als AI 'onbekend' zegt maar regex iets vond → leg conflict uit
    let finalConfidence = object.confidence
    if (regexHint && regexHint === object.leverancier_slug) {
      finalConfidence = Math.min(0.99, finalConfidence + 0.1)
    } else if (regexHint && object.leverancier_slug === 'onbekend') {
      finalConfidence = Math.max(finalConfidence, 0.6)
    }

    // Log het resultaat voor analyse
    if (offerteId) {
      try {
        await sb.from('leverancier_detectie_log').insert({
          offerte_id: offerteId,
          detected_leverancier: object.leverancier_slug,
          detected_profiel: object.profiel,
          ai_confidence: finalConfidence,
          ai_model: 'claude-haiku-4-5',
          regex_match: regexHint,
          pdf_text_sample: text.slice(0, 500),
        })
      } catch (logErr) {
        console.warn('detectie-log insert mislukt:', logErr)
      }
    }

    // Bump detect_count voor bekende leveranciers
    if (object.leverancier_slug !== 'onbekend') {
      try {
        await sb.rpc('increment_leverancier_detect', { lev_naam: object.leverancier_slug })
      } catch {
        // RPC bestaat misschien nog niet — fallback: directe update
        const { data: lev } = await sb.from('bekende_leveranciers').select('id, detect_count').eq('naam', object.leverancier_slug).maybeSingle()
        if (lev) {
          await sb.from('bekende_leveranciers').update({ detect_count: (lev.detect_count || 0) + 1, updated_at: new Date().toISOString() }).eq('id', lev.id)
        }
      }
    }

    return NextResponse.json({
      leverancier: object.leverancier_slug,
      display_naam: object.display_naam,
      profiel: object.profiel,
      confidence: finalConfidence,
      reden: object.reden,
      regex_hint: regexHint,
    })
  } catch (e) {
    return NextResponse.json({
      error: e instanceof Error ? e.message : 'AI detectie faalde',
      regex_hint: regexHint,
    }, { status: 500 })
  }
}
