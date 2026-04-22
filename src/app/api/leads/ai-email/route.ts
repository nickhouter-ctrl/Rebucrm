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

    const systemPrompt = `Je schrijft een zakelijke, vriendelijke e-mail namens Rebu Kozijnen, een bedrijf dat hoogwaardige kunststof kozijnen, schuifpuien, deuren en aluminium kozijnen levert en plaatst. Schrijf in correct Nederlands, to-the-point, niet te formeel.

Gebruik de placeholder {{naam}} voor de voornaam/contactpersoon van de ontvanger en {{bedrijfsnaam}} voor het bedrijf.

Vaste onderdelen die je mee mag nemen afhankelijk van context:
- A-merken: Aluplast, Schüco, K-Vision, Gealan
- Aluminium merken: Reynaers, Cortizo, Aliplast, Aluprof
- Alles in eigen beheer: inmeten, tekenen, produceren, leveren
- Tot 20% prijsvoordeel t.o.v. standaard leveranciers
- Offertes en tekeningen binnen 24 uur
- Levertijden gemiddeld 4 à 5 weken
- Betrouwbare nazorg
- Showroom/locatie: Samsonweg 26F, 1521 RM Wormerveer

Brochure-links (opnemen waar passend):
${BROCHURES}

Handtekening altijd:
"Met vriendelijke groet,
${medewerkerNaam}
verkoop@rebukozijnen.nl
www.rebukozijnen.nl
+31 6 2384 9067
Samsonweg 26F, 1521 RM Wormerveer"

Geef als antwoord ALLEEN de body van de mail, geen onderwerp erboven.`

    const userPrompt = template === 'na_bellen'
      ? `Schrijf een e-mail voor ná een telefonisch contact. Bedank voor het gesprek, verwijs naar de toegezegde brochures (neem beide Drive-links letterlijk op in de tekst), geef een korte samenvatting van wat Rebu onderscheidend maakt (kwaliteit A-merken, 24u offerte, eigen productie, prijsvoordeel, nazorg), nodig uit voor persoonlijk contact op de showroom in Wormerveer. Eindig met uitnodiging om vrijblijvend een scherpe prijsopgave te maken als ze afmetingen of tekeningen aanleveren. ${extraInstructie}`
      : `Schrijf een kennismakings-/introductie-e-mail voor een bedrijf dat we NIET eerder hebben gesproken. Stel Rebu Kozijnen kort voor, geef aan wat we onderscheidend aanbieden (A-merken, alles in eigen beheer, 24u offerte, prijsvoordeel), en nodig uit om samen te werken voor projecten met kunststof/aluminium kozijnen. Neem beide brochure-links op. Sluit af met vraag of we contact kunnen opnemen voor een kennismakingsgesprek. ${extraInstructie}`

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
