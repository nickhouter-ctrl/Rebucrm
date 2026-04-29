import { NextRequest, NextResponse } from 'next/server'
import { generateObject } from 'ai'
import { z } from 'zod'
import { aiModel } from '@/lib/ai-model'
import { rateLimit } from '@/lib/rate-limit'
import { createClient } from '@/lib/supabase/server'

// Verrijkt een zakelijke relatie door de bedrijfswebsite te scannen.
// Input: website URL (en optioneel bedrijfsnaam). AI haalt:
//  - korte sector-omschrijving (1 regel)
//  - kerngegevens (telefoon, e-mailadres als anders dan opgegeven)
//  - hoofd-contactpersoon(en) indien vermeld
//  - eventuele specialisatie/diensten

export const maxDuration = 60
export const dynamic = 'force-dynamic'

const schema = z.object({
  omschrijving: z.string().describe('1-2 zinnen wat dit bedrijf doet').default(''),
  sector: z.string().describe('Branche, bv. "aannemer", "vastgoed", "particulier"').default(''),
  contactpersonen: z.array(z.object({
    naam: z.string(),
    functie: z.string().default(''),
    email: z.string().default(''),
    telefoon: z.string().default(''),
  })).default([]),
  algemeenEmail: z.string().default(''),
  algemeenTelefoon: z.string().default(''),
  diensten: z.array(z.string()).default([]),
  notities: z.string().describe('Overige opvallende info, bv. werkgebied, projectomvang').default(''),
})

export async function POST(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Niet ingelogd' }, { status: 401 })

  const rl = rateLimit(`verrijk:${user.id}`, 20, 60_000)
  if (!rl.ok) return NextResponse.json({ error: `Te veel verzoeken — wacht ${Math.ceil(rl.resetIn / 1000)}s` }, { status: 429 })

  const { website, bedrijfsnaam } = (await req.json()) as { website?: string; bedrijfsnaam?: string }
  if (!website || !/^https?:\/\//.test(website)) {
    return NextResponse.json({ error: 'Geen geldige website-URL' }, { status: 400 })
  }

  // Fetch website HTML — beperk tot 200KB om timeouts/abuse te voorkomen
  let html = ''
  try {
    const ac = new AbortController()
    const timer = setTimeout(() => ac.abort(), 10_000)
    const res = await fetch(website, {
      signal: ac.signal,
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; Rebu-Verrijk/1.0)' },
      redirect: 'follow',
    })
    clearTimeout(timer)
    if (!res.ok) return NextResponse.json({ error: `Website gaf status ${res.status}` }, { status: 502 })
    const buf = await res.arrayBuffer()
    if (buf.byteLength > 200_000) {
      html = new TextDecoder().decode(buf.slice(0, 200_000))
    } else {
      html = new TextDecoder().decode(buf)
    }
  } catch (e) {
    return NextResponse.json({ error: `Kon website niet laden: ${e instanceof Error ? e.message : 'onbekend'}` }, { status: 502 })
  }

  // Strip HTML tags + normaliseer whitespace voor de AI
  const tekst = html
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 30000)

  if (tekst.length < 100) {
    return NextResponse.json({ error: 'Website bevat te weinig leesbare tekst' }, { status: 400 })
  }

  try {
    const { object } = await generateObject({
      model: aiModel('anthropic/claude-haiku-4-5-20251001'),
      schema,
      system: `Je extraheert bedrijfsinfo uit website-tekst. Geef alleen wat je écht in de tekst leest, verzin niets. Nederlandse output. Bij geen info → leeg veld.`,
      messages: [{
        role: 'user',
        content: `Bedrijf${bedrijfsnaam ? `: ${bedrijfsnaam}` : ''}\nWebsite: ${website}\n\n--- WEBSITE TEKST ---\n${tekst}`,
      }],
    })
    return NextResponse.json(object)
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'AI-fout' }, { status: 500 })
  }
}
