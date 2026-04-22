import { NextRequest, NextResponse } from 'next/server'
import { generateText } from 'ai'
import { anthropic } from '@ai-sdk/anthropic'
import { createAdminClient } from '@/lib/supabase/admin'
import { createClient } from '@/lib/supabase/server'

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

    const systemPrompt = `Je schrijft namens Rebu Kozijnen. Rebu is een LEVERANCIER van kunststof en aluminium kozijnen voor aannemers, bouwbedrijven en timmerbedrijven. Rebu meet NIET in en plaatst NIET zelf — dat doet de klant. Kunststof A-merken: Aluplast, Gealan, Schüco. Aluminium: Reynaers, Cortizo, Aliplast, Aluprof.

Schrijf in correct, zakelijk en vriendelijk Nederlands. To-the-point, geen persoonlijke introductie ('Ik ben ...'). Eindig altijd met:
"Met vriendelijke groet,
Rebu Kozijnen
verkoop@rebukozijnen.nl"
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

    // Haal eerdere handmatige correcties op om van te leren
    let feedbackBlock = ''
    try {
      const supabase = await createClient()
      const { data: { user } } = await supabase.auth.getUser()
      if (user) {
        const supabaseAdmin = createAdminClient()
        const { data: profiel } = await supabaseAdmin.from('profielen').select('administratie_id').eq('id', user.id).single()
        if (profiel?.administratie_id) {
          const { data: eerder } = await supabaseAdmin
            .from('ai_email_feedback')
            .select('ai_origineel, user_verzonden')
            .eq('administratie_id', profiel.administratie_id)
            .eq('context', 'email_reply')
            .order('created_at', { ascending: false })
            .limit(5)
          if (eerder && eerder.length > 0) {
            feedbackBlock = '\n\nEerdere handmatige correcties van deze gebruiker — PAS JE STIJL HIEROP AAN:\n\n' +
              eerder.map((f, i) => `VOORBEELD ${i + 1}:\n--- AI schreef ---\n${f.ai_origineel.slice(0, 800)}\n--- Gebruiker verstuurde uiteindelijk ---\n${f.user_verzonden.slice(0, 800)}`).join('\n\n')
          }
        }
      }
    } catch {}

    const result = await generateText({
      model: anthropic('claude-sonnet-4-5'),
      system: systemPrompt + feedbackBlock,
      prompt: userPrompt,
      maxOutputTokens: 800,
    })

    return NextResponse.json({ tekst: result.text })
  } catch (err) {
    console.error('AI reply error:', err)
    return NextResponse.json({ error: err instanceof Error ? err.message : 'AI genereren mislukt' }, { status: 500 })
  }
}
