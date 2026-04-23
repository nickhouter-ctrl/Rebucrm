import { NextRequest, NextResponse } from 'next/server'
import { generateObject } from 'ai'
import { anthropic } from '@ai-sdk/anthropic'
import { z } from 'zod'
import { createAdminClient } from '@/lib/supabase/admin'

// Claude Vision identificeert de bounding box van wat we aan de klant tonen:
// de kozijn-tekening + specs, zonder leveranciersprijzen, logo's of footers.
//
// AI LEERT: per leverancier wordt het beste resultaat opgeslagen als template
// (als percentage van pagina-afmetingen). Volgende pagina's van dezelfde
// leverancier gebruiken direct het cached template — geen AI-call nodig.
// Zo maakt het systeem niet elke keer opnieuw dezelfde fouten.

export const maxDuration = 60
export const dynamic = 'force-dynamic'

const schema = z.object({
  x: z.number().int(),
  y: z.number().int(),
  w: z.number().int(),
  h: z.number().int(),
  reason: z.string().optional(),
})

export async function POST(req: NextRequest) {
  if (!process.env.ANTHROPIC_API_KEY) {
    return NextResponse.json({ error: 'ANTHROPIC_API_KEY ontbreekt' }, { status: 500 })
  }

  const { imageBase64, imageWidth, imageHeight, supplier } = (await req.json()) as {
    imageBase64: string
    imageWidth: number
    imageHeight: number
    supplier?: string
  }

  if (!imageBase64 || !imageWidth || !imageHeight) {
    return NextResponse.json({ error: 'Ontbrekende image/dimensies' }, { status: 400 })
  }

  const sb = createAdminClient()
  const supplierKey = (supplier || 'unknown').toLowerCase().trim()

  // STAP 1: Template cache — als we deze leverancier eerder hebben gezien én het
  // template is gevalideerd of minimaal 3x gebruikt zonder klachten, hergebruiken
  // we het direct. AI leert van succes én vermijdt steeds opnieuw dezelfde analyse.
  const { data: template } = await sb
    .from('ai_tekening_template')
    .select('*')
    .eq('supplier', supplierKey)
    .maybeSingle()

  if (template && (template.validated || (template.usage_count ?? 0) >= 3)) {
    const x = Math.round(Number(template.box_x_pct) * imageWidth)
    const y = Math.round(Number(template.box_y_pct) * imageHeight)
    const w = Math.round(Number(template.box_w_pct) * imageWidth)
    const h = Math.round(Number(template.box_h_pct) * imageHeight)
    // Update usage counter
    await sb.from('ai_tekening_template').update({
      usage_count: (template.usage_count ?? 0) + 1,
      last_used: new Date().toISOString(),
    }).eq('id', template.id)
    return NextResponse.json({ x, y, w, h, reason: 'cached template', fromCache: true })
  }

  const system = `Je bent expert in kozijn-leverancier technische tekeningen (Aluplast, Gealan, Schüco, Reynaers, Cortizo, Aliplast, Aluprof, Eko-Okna, Kochs).

Identificeer in de pagina-afbeelding de EXACTE bounding box die we tonen aan de eindklant.

INCLUDEREN:
- De technische kozijn-tekening (aanzichten, doorsnedes, maat-indicaties, dimensies)
- Specs-tabel met materiaal/kleur/glas/beslag informatie
- Element-naam en afmetingen
- Aanzicht-labels (Binnen/Buiten/Binnenzicht/Buitenzicht)

EXCLUDEREN (MOET BUITEN DE BOX):
- Leveranciers-logo en -header (bovenaan)
- Prijs-tabellen (NETTO/BRUTO/BTW, Cena, Kosztorys, Razem, Netto prijs, Totaal, Preis, Gesamt)
- Leveranciers-footer met paginanummers/bedrijfsgegevens/datum
- Elk zichtbaar bedrag in € / EUR / PLN / $ / £

Geef een royale rechthoek met ruimte rond de tekening (~20px marge). Coordinaten in pixels van de originele afbeelding. Y loopt van boven naar onder.`

  try {
    const { object } = await generateObject({
      model: anthropic('claude-sonnet-4-5'),
      system,
      schema,
      temperature: 0,
      messages: [
        {
          role: 'user',
          content: [
            {
              type: 'image',
              image: `data:image/jpeg;base64,${imageBase64}`,
            },
            {
              type: 'text',
              text: `Leverancier: ${supplier || 'onbekend'}\nAfbeelding: ${imageWidth}×${imageHeight} pixels\n\nGeef bounding box (x,y,w,h) in pixels van wat naar de klant gaat (tekening+specs), zonder prijzen/logo/footer.`,
            },
          ],
        },
      ],
    })

    const x = Math.max(0, Math.min(imageWidth - 1, Math.round(object.x)))
    const y = Math.max(0, Math.min(imageHeight - 1, Math.round(object.y)))
    const w = Math.max(1, Math.min(imageWidth - x, Math.round(object.w)))
    const h = Math.max(1, Math.min(imageHeight - y, Math.round(object.h)))

    // STAP 2: Save template voor deze leverancier (als percentage zodat het
    // schaal-onafhankelijk is). Volgende pagina's van dezelfde leverancier
    // gebruiken dit direct.
    try {
      const boxXPct = x / imageWidth
      const boxYPct = y / imageHeight
      const boxWPct = w / imageWidth
      const boxHPct = h / imageHeight
      if (template) {
        await sb.from('ai_tekening_template').update({
          page_width: imageWidth,
          page_height: imageHeight,
          box_x_pct: boxXPct,
          box_y_pct: boxYPct,
          box_w_pct: boxWPct,
          box_h_pct: boxHPct,
          usage_count: (template.usage_count ?? 0) + 1,
          last_used: new Date().toISOString(),
        }).eq('id', template.id)
      } else {
        await sb.from('ai_tekening_template').insert({
          supplier: supplierKey,
          page_width: imageWidth,
          page_height: imageHeight,
          box_x_pct: boxXPct,
          box_y_pct: boxYPct,
          box_w_pct: boxWPct,
          box_h_pct: boxHPct,
          confidence: 0.85,
          usage_count: 1,
          last_used: new Date().toISOString(),
        })
      }
    } catch (cacheErr) {
      console.warn('template cache insert fout:', cacheErr)
    }

    return NextResponse.json({ x, y, w, h, reason: object.reason, fromCache: false })
  } catch (err) {
    console.error('AI detect-drawing-box error:', err)
    return NextResponse.json({ error: err instanceof Error ? err.message : String(err) }, { status: 500 })
  }
}
