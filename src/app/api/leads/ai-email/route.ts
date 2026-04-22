import { NextRequest, NextResponse } from 'next/server'
import { generateText } from 'ai'
import { anthropic } from '@ai-sdk/anthropic'

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { template = 'eerste_contact', extraInstructie = '', medewerkerNaam = 'Jordy' } = body as Record<string, string>

    if (!process.env.ANTHROPIC_API_KEY) {
      return NextResponse.json({ error: 'ANTHROPIC_API_KEY ontbreekt' }, { status: 500 })
    }

    const BROCHURES = `- Brochure Rebu Kozijnen: https://drive.google.com/file/d/1eA1RR1Vn8M4UvYE5avS9IecRxfJ2Ucb_/view\n- Brochure Voordeuren: https://drive.google.com/file/d/1KArp4I9gKdUqQrGCehtrcYk-NUI89w85/view`

    const systemPrompt = `Je schrijft een zakelijke, vriendelijke e-mail namens Rebu Kozijnen. Rebu is een LEVERANCIER van hoogwaardige kunststof en aluminium kozijnen. Wij richten ons uitsluitend op aannemers, bouwbedrijven en timmerbedrijven die zelf inmeten en plaatsen — Rebu doet dat NIET zelf. Dat houdt onze prijzen scherp.

Schrijf in correct Nederlands, to-the-point, niet te formeel. Stel jezelf NIET persoonlijk voor ('Ik ben ...'). Schrijf namens 'Rebu Kozijnen'.

Gebruik de placeholder {{naam}} voor de voornaam/contactpersoon van de ontvanger en {{bedrijfsnaam}} voor het bedrijf.

Vaste feiten om in te zetten waar relevant:
- Kunststof A-merken: Aluplast, Gealan, Schüco
- Aluminium merken: Reynaers, Cortizo, Aliplast, Aluprof
- Wij LEVEREN alleen — inmeten, tekenen en plaatsen doet de klant zelf
- Scherpe prijzen t.o.v. standaard leveranciers doordat wij geen plaatsingskosten maken
- Offertes en tekeningen binnen 24 uur
- Levertijden gemiddeld 4 à 5 weken
- Betrouwbare nazorg
- Adres: Samsonweg 26F, 1521 RM Wormerveer

Brochure-links (opnemen waar passend):
${BROCHURES}

Handtekening altijd (zonder voornaam in de intro):
"Met vriendelijke groet,
Rebu Kozijnen
verkoop@rebukozijnen.nl
www.rebukozijnen.nl
+31 6 2384 9067
Samsonweg 26F, 1521 RM Wormerveer"

Geef als antwoord ALLEEN de body van de mail, geen onderwerp erboven.`

    const userPrompt = template === 'na_bellen'
      ? `Schrijf een e-mail voor ná een telefonisch contact met een aannemer/bouwbedrijf/timmerbedrijf. Bedank voor het gesprek, verwijs naar de toegezegde brochures (neem beide Drive-links letterlijk op in de tekst), geef een korte samenvatting van wat Rebu onderscheidend maakt (leverancier-only = scherpe prijzen, A-merken Aluplast/Gealan/Schüco, aluminium Reynaers/Cortizo/Aliplast/Aluprof, offerte+tekening binnen 24u, nazorg). Eindig met uitnodiging om vrijblijvend een scherpe prijsopgave te maken als ze afmetingen of tekeningen aanleveren. ${extraInstructie}`
      : `Schrijf een kennismakings-/introductie-e-mail aan een aannemer, bouwbedrijf of timmerbedrijf dat we NIET eerder hebben gesproken. Positioneer Rebu als scherp geprijsde LEVERANCIER van kunststof én aluminium kozijnen voor bouwpartners die zelf inmeten en plaatsen. Benoem de voordelen (A-merken, 24u offerte, levertijd 4-5 weken, nazorg, geen plaatsingskosten). Neem beide brochure-links op. Sluit af met uitnodiging om een vrijblijvende prijsopgave te maken op een lopend of aankomend project. ${extraInstructie}`

    const onderwerp = template === 'na_bellen'
      ? 'Als besproken - brochures en informatie Rebu Kozijnen'
      : 'Kennismaking Rebu Kozijnen - kunststof en aluminium kozijnen'

    const result = await generateText({
      model: anthropic('claude-sonnet-4-5'),
      system: systemPrompt,
      prompt: userPrompt,
      maxOutputTokens: 1200,
    })

    return NextResponse.json({ onderwerp, bericht: result.text })
  } catch (err) {
    console.error('AI leads email error:', err)
    return NextResponse.json({ error: err instanceof Error ? err.message : 'AI mislukt' }, { status: 500 })
  }
}
