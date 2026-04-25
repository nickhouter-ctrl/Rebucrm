import { NextRequest, NextResponse } from 'next/server'
import { generateObject } from 'ai'
import { z } from 'zod'
import { aiModel } from '@/lib/ai-model'
import { createAdminClient } from '@/lib/supabase/admin'

// Claude Vision identificeert REGIO'S DIE WEG MOETEN op een leverancier-tekening
// pagina: prijs-tabellen, losse prijsbedragen en "Geen garantie"/"No warranty" teksten.
//
// We croppen NIET meer de tekening — die moet altijd volledig zichtbaar blijven.
// We wissen alleen de aangewezen regio's met wit. Zo houd je tekening + specs intact.
//
// AI LEERT: per leverancier wordt de succesvolle regio-set gecached als percentages
// zodat volgende pagina's direct dezelfde wipes krijgen zonder AI-call.

export const maxDuration = 60
export const dynamic = 'force-dynamic'

const regionSchema = z.object({
  x: z.number(),
  y: z.number(),
  w: z.number(),
  h: z.number(),
  reason: z.string().optional(),
})
const schema = z.object({
  regions: z.array(regionSchema).describe('Bounding boxes die wit gemaakt moeten worden'),
})

export async function POST(req: NextRequest) {
  if (!process.env.AI_GATEWAY_API_KEY && !process.env.ANTHROPIC_API_KEY) {
    return NextResponse.json({ error: 'AI_GATEWAY_API_KEY of ANTHROPIC_API_KEY ontbreekt' }, { status: 500 })
  }

  const { imageBase64, imageWidth, imageHeight, supplier, leverancierSlug } = (await req.json()) as {
    imageBase64: string
    imageWidth: number
    imageHeight: number
    supplier?: string
    leverancierSlug?: string
  }

  if (!imageBase64 || !imageWidth || !imageHeight) {
    return NextResponse.json({ error: 'Ontbrekende image/dimensies' }, { status: 400 })
  }

  const sb = createAdminClient()
  // Cache-key: leverancierSlug heeft voorrang (deterministisch, gevalideerd via
  // bekende_leveranciers tabel). Fallback op oude `supplier` string voor
  // backwards-compat met bestaande cache-records.
  const supplierKey = (leverancierSlug || supplier || 'unknown').toLowerCase().trim()

  // Cache: als we deze leverancier eerder succesvol hebben gezien, hergebruik direct
  const { data: template } = await sb
    .from('ai_tekening_template')
    .select('*')
    .eq('supplier', supplierKey)
    .maybeSingle()

  // Template houdt nu regions (array van %'s) vast in box_x_pct enz voor backwards compat
  // maar we slaan ook een jsonb met regions in een extra kolom.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const cachedRegions = (template as any)?.remove_regions_pct as { x: number; y: number; w: number; h: number }[] | null

  // Cache pas vertrouwen als template expliciet gevalideerd is. Usage_count
  // alleen is niet genoeg — een fout gecachte regio blijft anders hangen.
  if (cachedRegions && Array.isArray(cachedRegions) && cachedRegions.length > 0 && template?.validated) {
    const regions = cachedRegions.map(r => ({
      x: Math.round(r.x * imageWidth),
      y: Math.round(r.y * imageHeight),
      w: Math.round(r.w * imageWidth),
      h: Math.round(r.h * imageHeight),
    }))
    await sb.from('ai_tekening_template').update({
      usage_count: (template?.usage_count ?? 0) + 1,
      last_used: new Date().toISOString(),
    }).eq('id', template.id)
    return NextResponse.json({ regions, fromCache: true })
  }

  const system = `Je bent expert in kozijn-leverancier tekeningen (Aluplast, Gealan, Schüco, Reynaers, Cortizo, Aliplast, Aluprof, Eko-Okna, Kochs).

TAAK: geef bounding boxes (x,y,w,h in pixels) van de regio's die we WIT MOETEN MAKEN op deze pagina. Dit zijn ALLEEN:
1. Prijs-tabellen en prijs-kolommen (NETTO/BRUTO/BTW, Cena, Kosztorys, Razem, Netto prijs, Totaal, Totalen, Producten/Artikelen/Profielen/Diensten/Extra kosten, Preis/Gesamt, Prijs TOT, Deurprijs, "Prijs van het element", etc.). De box MOET de complete kolom dekken — tot aan de rechter pagina-rand — anders blijft de helft zichtbaar. Bij twijfel liever 20px te breed dan 5px te smal.
2. Losse prijsbedragen in € / EUR / PLN / zł / $ / £
3. "Geen garantie" / "No warranty" / "Geen Garantie" teksten (exact die woorden) — INCLUSIEF de gekleurde achtergrond-cel (vaak geel of groen) waarin de tekst staat. De box moet de VOLLEDIGE tabel-rij dekken waarin "Geen garantie" staat, van begin-van-de-specs-kolom (meestal rond x=midden-pagina) tot aan de rechter rand. Een smalle box alléén rond de tekst laat de gekleurde cel voor de helft zichtbaar — dat is fout.
4. **STAART van een VORIG element**: als de pagina begint met Toebehoren-, Glazing used- of "Prijs van het element"-tabel BOVEN een nieuwe "Element NNN"/"Deur NNN" header, is die tabel van het vorige element en moet WEG.
5. **BEGIN van een VOLGEND element**: als onder de huidige tekening opnieuw "Element NNN" of "Deur NNN" start, moet alles vanaf die header naar beneden WEG.
6. **"Totalen"-balk onderaan**: als onderaan de pagina een smalle balk/tabel met het label "Totalen" of "Totaal offerte" of "Eind totaal" staat (vaak blauw of grijs), wis die INCLUSIEF de kleine kolommetjes eronder. Beperk tot de breedte van de tabel zelf — nooit full-width als er een tekening links doorheen loopt.

MOET INTACT BLIJVEN (dus NIET in je regions):
- Kozijn-tekeningen (aanzichten, doorsnedes, maten, pijlen)
- Alle specs-tabellen (materiaal/glas/kleur/beslag/afmetingen/BERICHTEN/vullingen/thermische coefficient/gewicht/omtrek)
- Element-naam, afmetingen in mm, RAL codes, profiel-codes
- Kolommen met TECHNISCHE info (BERICHTEN, Afmeting vulling, enz)
- Leveranciers-logo en -header (die cropt de client al zelf)

Maak de boxes krap-genoeg zodat je ALLEEN prijzen/garantie dekt, met wat marge (~5-10px) om zekerheid. Als je twijfelt of iets een prijs is: inclusief opnemen want zichtbare prijzen zijn ONAANVAARDBAAR. Als iets een dimensie of specs is: NIET opnemen.

**KRITIEK — GEEN STREPEN DOOR AANZICHTEN**: box NOOIT een horizontale baan over de volledige pagina-breedte, óók niet onderaan de pagina. Aanzichten (Binnenzicht + Buitenaanzicht boven elkaar) staan vaak aan de linkerkant, terwijl een prijs rechtsbinnen hangt. Een box die over de volledige breedte loopt snijdt de onder-aanzicht tekening kapot. Gebruik daarom een smalle/lokale box (geschat 250-400px breed) rondom alleen de prijs-tabel of het prijs-bedrag zelf. Als je een tabel over hele breedte ziet maar weet dat een tekening er doorheen loopt: beperk de box tot de rechterhelft.

**Complete aanzichten verplicht**: boven-aanzicht EN onder-aanzicht moeten volledig zichtbaar blijven. "Boven: Binnenzicht / Onder: Buitenaanzicht" labels zijn DEEL van het aanzicht en mogen niet worden weggewit.

**Summary-tabellen onderaan**: als er een tabel is met "Totaal elementen", "Totaal offerte/order", "Betaling:", "Eind totaal", "Netto Totaal", "TZ NN%" of "+N stojak", wis die tabel MAAR houd je boxes bij de feitelijke tabel-breedte — nooit full-width als daar een tekening loopt.

Geef MEERDERE boxes als prijzen verspreid staan. Bv. Aluplast heeft vaak links een prijs-kolom EN onderaan een totaaltabel — beide erbij.`

  try {
    const { object } = await generateObject({
      model: aiModel('anthropic/claude-sonnet-4-5'),
      system,
      schema,
      temperature: 0,
      // System prompt is lang en stabiel — perfecte caching candidate
      providerOptions: {
        anthropic: { cacheControl: { type: 'ephemeral' } },
      },
      messages: [
        {
          role: 'user',
          content: [
            { type: 'image', image: `data:image/jpeg;base64,${imageBase64}` },
            {
              type: 'text',
              text: `Leverancier: ${supplier || 'onbekend'}\nAfbeelding: ${imageWidth}×${imageHeight} pixels\n\nGeef alle bounding boxes (x,y,w,h in pixels) van wat wit moet worden: prijzen, prijs-tabellen en "Geen garantie" teksten. NIET de tekening of specs.`,
            },
          ],
        },
      ],
    })

    const regions = object.regions.map(r => {
      const x = Math.max(0, Math.min(imageWidth - 1, Math.round(r.x)))
      const y = Math.max(0, Math.min(imageHeight - 1, Math.round(r.y)))
      const w = Math.max(1, Math.min(imageWidth - x, Math.round(r.w)))
      const h = Math.max(1, Math.min(imageHeight - y, Math.round(r.h)))
      return { x, y, w, h }
    })

    // Cache template per leverancier (percentages → schaal-onafhankelijk)
    try {
      const regionsPct = regions.map(r => ({
        x: r.x / imageWidth,
        y: r.y / imageHeight,
        w: r.w / imageWidth,
        h: r.h / imageHeight,
      }))
      if (template) {
        await sb.from('ai_tekening_template').update({
          page_width: imageWidth,
          page_height: imageHeight,
          remove_regions_pct: regionsPct,
          usage_count: (template.usage_count ?? 0) + 1,
          last_used: new Date().toISOString(),
        }).eq('id', template.id)
      } else {
        await sb.from('ai_tekening_template').insert({
          supplier: supplierKey,
          page_width: imageWidth,
          page_height: imageHeight,
          box_x_pct: 0,
          box_y_pct: 0,
          box_w_pct: 1,
          box_h_pct: 1,
          remove_regions_pct: regionsPct,
          confidence: 0.85,
          usage_count: 1,
          last_used: new Date().toISOString(),
        })
      }
    } catch (cacheErr) {
      console.warn('template cache fout:', cacheErr)
    }

    return NextResponse.json({ regions, fromCache: false })
  } catch (err) {
    console.error('AI detect-remove-regions error:', err)
    return NextResponse.json({ error: err instanceof Error ? err.message : String(err), regions: [] }, { status: 500 })
  }
}
