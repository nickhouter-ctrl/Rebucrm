import { NextRequest, NextResponse } from 'next/server'
import { generateText } from 'ai'
import { anthropic } from '@ai-sdk/anthropic'

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const {
      vanNaam = '',
      vanEmail = '',
      onderwerp = '',
      origineleTekst = '',
      klantNaam = '',
      medewerkerNaam = 'Rebu Kozijnen',
      extraInstructie = '',
    } = body as Record<string, string>

    if (!process.env.ANTHROPIC_API_KEY) {
      return NextResponse.json({ error: 'ANTHROPIC_API_KEY ontbreekt in de omgeving' }, { status: 500 })
    }

    const systemPrompt = `Je bent een professionele medewerker van Rebu Kozijnen, een bedrijf dat kunststof kozijnen, ramen en deuren levert en plaatst. Je schrijft in correct, beleefd en vriendelijk Nederlands. Houd antwoorden zakelijk maar warm, to-the-point, zonder overdreven formulering. Gebruik de je-vorm tenzij de klant formeel schrijft. Eindig altijd met:
"Met vriendelijke groet,
${medewerkerNaam}
Rebu Kozijnen"
Voeg geen onderwerp toe. Schrijf alleen de body van het e-mailbericht.`

    const userPrompt = `Schrijf een professioneel antwoord op onderstaande e-mail.

Afzender: ${vanNaam || vanEmail}
E-mail: ${vanEmail}
${klantNaam ? `Bekend bij ons als: ${klantNaam}` : ''}
Onderwerp: ${onderwerp}

Ontvangen e-mail:
"""
${origineleTekst.slice(0, 4000)}
"""

${extraInstructie ? `Extra instructies voor het antwoord: ${extraInstructie}\n` : ''}
Schrijf een passend antwoord. Als het een offerte-aanvraag is, bevestig de ontvangst en geef aan dat we zo snel mogelijk een offerte sturen (of vraag om ontbrekende info zoals afmetingen/foto's). Als het om plaatsing/levering gaat, wees concreet over wat de volgende stap is.`

    const result = await generateText({
      model: anthropic('claude-sonnet-4-5'),
      system: systemPrompt,
      prompt: userPrompt,
      maxOutputTokens: 800,
    })

    return NextResponse.json({ tekst: result.text })
  } catch (err) {
    console.error('AI reply error:', err)
    return NextResponse.json({ error: err instanceof Error ? err.message : 'AI genereren mislukt' }, { status: 500 })
  }
}
