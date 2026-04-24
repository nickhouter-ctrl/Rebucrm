'use server'

import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { sendEmail } from '@/lib/email'
import { buildRebuEmailHtml } from '@/lib/email-template'
import { cookies, headers } from 'next/headers'
import crypto from 'crypto'

// waitUntil: laat Vercel een async taak afmaken nádat de response al naar
// de client is gestuurd. Zonder dit wordt 'void sendEmail(...)' direct
// gekilled door de serverless runtime en komt de mail nooit binnen.
import { waitUntil } from '@vercel/functions'

const MAX_ATTEMPTS = 5
const TFA_TTL_MS = 5 * 60 * 1000
const SESSION_COOKIE = 'tfa_verified'
const ACTIVITY_COOKIE = 'last_activity'

function hashCode(code: string): string {
  return crypto.createHash('sha256').update(code).digest('hex')
}
function generateCode(): string {
  return String(Math.floor(100000 + Math.random() * 900000))
}
async function getClientIp(): Promise<string> {
  const h = await headers()
  return h.get('x-forwarded-for')?.split(',')[0].trim() || h.get('x-real-ip') || 'unknown'
}
async function getUserAgent(): Promise<string> {
  const h = await headers()
  return h.get('user-agent') || ''
}

/**
 * Stap 1: wachtwoord check + code genereren. Mail gaat in de achtergrond
 * (fire-and-forget) zodat de server action direct terugkomt en de 2FA-pagina
 * binnen 1-2 seconden verschijnt. De mail arriveert meestal binnen 3-5s.
 */
export async function loginStep1(formData: FormData): Promise<{ error?: string; twofa?: boolean; klant?: boolean; success?: boolean }> {
  const email = (formData.get('email') as string || '').trim().toLowerCase()
  const password = formData.get('password') as string || ''
  const supabase = await createClient()
  const admin = createAdminClient()

  const { data, error } = await supabase.auth.signInWithPassword({ email, password })
  if (error || !data.user) {
    const ip = await getClientIp(); const ua = await getUserAgent()
    void admin.from('login_audit').insert({ email, ip, user_agent: ua, succes: false, reden: error?.message || 'unknown' })
    return { error: 'Onjuiste inloggegevens. Probeer het opnieuw.' }
  }

  // Klant? Geen 2FA, direct inloggen
  const { data: profiel } = await admin.from('profielen').select('rol').eq('id', data.user.id).single()
  if (profiel?.rol === 'klant') {
    return { klant: true }
  }

  // Alleen medewerkers: 2FA via mail. Code opslaan, mail fire-and-forget.
  const code = generateCode()
  await admin.from('tfa_codes').insert({
    user_id: data.user.id,
    code_hash: hashCode(code),
    expires_at: new Date(Date.now() + TFA_TTL_MS).toISOString(),
  })

  const body = `Beste gebruiker,

Uw inlogcode voor Rebu CRM is:

${code}

Deze code is 5 minuten geldig.

Met vriendelijke groet,
Rebu Kozijnen`

  // Gebruik waitUntil: response wordt direct naar de client gestuurd,
  // Vercel houdt de function levend tot de mail écht verzonden is.
  // Vereist @vercel/functions ≥ 1.5; fallback wordt gewoon await.
  const mailPromise = sendEmail({
    to: email,
    subject: `Rebu CRM inlogcode: ${code}`,
    html: buildRebuEmailHtml(body),
    fromName: 'Rebu Kozijnen',
  })
  try {
    // Max 6s wachten — als de mail daarvoor klaar is, weet de user zeker
    // dat hij binnenkomt. Daarna delegeren aan waitUntil zodat de function
    // niet geforced afkapt.
    await Promise.race([
      mailPromise,
      new Promise(r => setTimeout(r, 6000)),
    ])
  } finally {
    waitUntil(mailPromise.catch(err => console.error('2FA mail async fail:', err)))
  }

  return { twofa: true }
}

/** Stap 2: code valideren, cookies zetten. */
export async function loginStep2(formData: FormData): Promise<{ error?: string; success?: boolean }> {
  const code = (formData.get('code') as string || '').trim()
  if (!/^\d{6}$/.test(code)) return { error: 'Ongeldige code' }

  const supabase = await createClient()
  const admin = createAdminClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Sessie verlopen. Log opnieuw in.' }

  const { data: tfa } = await admin
    .from('tfa_codes')
    .select('*')
    .eq('user_id', user.id)
    .eq('used', false)
    .gt('expires_at', new Date().toISOString())
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (!tfa) return { error: 'Geen geldige code gevonden. Vraag een nieuwe aan.' }
  if ((tfa.pogingen ?? 0) >= MAX_ATTEMPTS) {
    await admin.from('tfa_codes').update({ used: true }).eq('id', tfa.id)
    return { error: 'Te veel pogingen voor deze code. Vraag een nieuwe aan.' }
  }
  if (tfa.code_hash !== hashCode(code)) {
    await admin.from('tfa_codes').update({ pogingen: (tfa.pogingen ?? 0) + 1 }).eq('id', tfa.id)
    return { error: 'Onjuiste code.' }
  }

  await admin.from('tfa_codes').update({ used: true }).eq('id', tfa.id)
  const jar = await cookies()
  const isProd = process.env.NODE_ENV === 'production'
  const sessieOpties = {
    httpOnly: true,
    secure: isProd,
    sameSite: 'lax' as const,
    path: '/',
    maxAge: 60 * 60 * 24 * 30,
  }
  jar.set(SESSION_COOKIE, user.id, sessieOpties)
  jar.set(ACTIVITY_COOKIE, String(Date.now()), sessieOpties)
  return { success: true }
}

export async function logoutAction() {
  const supabase = await createClient()
  await supabase.auth.signOut()
  const jar = await cookies()
  jar.delete(SESSION_COOKIE)
  jar.delete(ACTIVITY_COOKIE)
}
