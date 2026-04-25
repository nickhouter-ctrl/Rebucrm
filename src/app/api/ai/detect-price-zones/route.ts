import { NextRequest, NextResponse } from 'next/server'
import { generateObject } from 'ai'
import { anthropic } from '@ai-sdk/anthropic'
import { z } from 'zod'

// Detecteert welke text-items op een leverancier-tekeningpagina leveranciersprijzen
// of prijs-tabel-labels bevatten die verborgen moeten worden.
//
// Input: lijst van { i, str, x, y } — i is originele index, x/y zijn canvas-coords
// Response: { hide: number[] } — lijst van indices die wit gemaakt moeten worden

export const maxDuration = 60

const schema = z.object({
  hide: z.array(z.number()).describe('Indices (veld "i") van items die verborgen moeten worden'),
})

export async function POST(req: NextRequest) {
  if (!process.env.ANTHROPIC_API_KEY) {
    return NextResponse.json({ hide: [], error: 'ANTHROPIC_API_KEY ontbreekt' }, { status: 500 })
  }

  const { items, pageW, pageH, supplier } = (await req.json()) as {
    items: { i: number; str: string; x: number; y: number }[]
    pageW: number
    pageH: number
    supplier?: string
  }

  if (!Array.isArray(items) || items.length === 0) {
    return NextResponse.json({ hide: [] })
  }

  // Alleen items in onderste 60% van pagina kandidaat voor prijs-detectie
  const kandidaten = items.filter(it => it.y > pageH * 0.4)
  if (kandidaten.length === 0) return NextResponse.json({ hide: [] })

  const system = `Je bent een expert in kozijn-leverancier offerte PDFs (Aluplast, Gealan, Schüco, Reynaers, Cortizo, Aliplast, Aluprof, Eko-Okna, Kochs). Jouw taak: uit een lijst van tekst-items op een element-tekening pagina identificeren welke items LEVERANCIERSPRIJZEN of PRIJSLABELS bevatten die we MOETEN verbergen voordat we de tekening aan onze klant laten zien.

VERBERGEN (antwoord met hun index "i"):
- Prijsbedragen in elke valuta (€, EUR, PLN, zł, $)
- Prijs-tabel headers: "Netto", "Bruto", "NETTO", "BRUTO", "BTW", "Preis", "Gesamt", "Cena", "Kosztorys", "Razem", "Suma"
- Label-woorden: "Netto prijs", "Prijs van het element", "Deurprijs", "Totaal excl", "Totaal incl", "Prijs TOT", "Producten", "Artikelen", "Profielen", "Diensten", "Extra kosten", "Raam" (als het onder de tekening in een prijs-tabel staat, NIET bij afmetingen)
- Numerieke bedragen in de prijs-tabel (bv "1.247,20", "5661,19", "2253.56")

NIET VERBERGEN:
- Afmetingen op de tekening (1663 x 1969, 2250 mm, etc)
- Materiaal-namen, kleuren (RAL 9001, Antraciet, etc)
- Profiel-codes (406.0325, 6802 Aanslag, K-Vision, MB-79N)
- Specs zoals Ug-waarde, glas-types (HR++, 4-16-4), beslag
- Element-namen en -nummers (Element 001, Zolder voorzijde, etc)

Context: tekst-items zijn in lees-volgorde, met x/y coordinaten op een canvas van ${pageW}×${pageH} pixels. Y loopt van boven (0) naar onder. De tekening zit meestal in het middelste deel; prijs-info onderaan (y > ${Math.floor(pageH * 0.65)}).

Antwoord alleen met de JSON structuur { "hide": [indices] }.`

  const prompt = `Leverancier: ${supplier || 'onbekend'}
Pagina afmeting: ${pageW}×${pageH}

Items (bovenste 40% weggelaten):
${kandidaten.map(it => `i=${it.i} x=${it.x} y=${it.y} "${it.str}"`).join('\n')}

Welke indices bevatten leveranciersprijs-informatie die we MOETEN verbergen?`

  try {
    const { object } = await generateObject({
      model: anthropic('claude-sonnet-4-5'),
      system,
      prompt,
      schema,
      temperature: 0,
    })
    return NextResponse.json({ hide: object.hide })
  } catch (err) {
    console.error('AI detect-price-zones error:', err)
    return NextResponse.json({ hide: [], error: String(err) })
  }
}
