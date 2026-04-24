'use server'

import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { sendEmail } from '@/lib/email'
import { buildRebuEmailHtml } from '@/lib/email-template'
import { cookies, headers } from 'next/headers'
import crypto from 'crypto'

const MAX_ATTEMPTS = 5
const ATTEMPT_WINDOW_MS = 15 * 60 * 1000 // 15 min
const TFA_TTL_MS = 5 * 60 * 1000          // 5 min
const TFA_SESSION_DAYS = 3                 // Na X dagen inactiviteit opnieuw 2FA vereisen
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
 * Stap 1 van login: valideer wachtwoord, genereer 6-cijferige code, mail hem
 * naar de user. Zet een tijdelijke cookie met user_id zodat de 2fa-pagina
 * weet voor wie het is.
 */
export async function loginStep1(formData: FormData): Promise<{ error?: string; twofa?: boolean; klant?: boolean }> {
  const email = (formData.get('email') as string || '').trim().toLowerCase()
  const password = formData.get('password') as string || ''
  const ip = await getClientIp()
  const ua = await getUserAgent()
  const supabase = await createClient()
  const admin = createAdminClient()

  // Rate limit: max N mislukte pogingen per IP in window
  const since = new Date(Date.now() - ATTEMPT_WINDOW_MS).toISOString()
  const { count: recentFails } = await admin
    .from('login_audit')
    .select('*', { count: 'exact', head: true })
    .eq('ip', ip)
    .eq('succes', false)
    .gte('created_at', since)
  if ((recentFails ?? 0) >= MAX_ATTEMPTS) {
    await admin.from('login_audit').insert({ email, ip, user_agent: ua, succes: false, reden: 'rate_limited' })
    return { error: 'Te veel mislukte pogingen. Probeer over 15 minuten opnieuw.' }
  }

  const { data, error } = await supabase.auth.signInWithPassword({ email, password })
  if (error || !data.user) {
    await admin.from('login_audit').insert({ email, ip, user_agent: ua, succes: false, reden: error?.message || 'unknown' })
    return { error: 'Onjuiste inloggegevens. Probeer het opnieuw.' }
  }

  // Check rol: klanten hoeven geen 2FA
  const { data: profiel } = await admin.from('profielen').select('rol').eq('id', data.user.id).single()
  if (profiel?.rol === 'klant') {
    await admin.from('login_audit').insert({ email, ip, user_agent: ua, succes: true, reden: 'klant_geen_2fa' })
    return { klant: true }
  }

  // Genereer + sla code op
  const code = generateCode()
  await admin.from('tfa_codes').insert({
    user_id: data.user.id,
    code_hash: hashCode(code),
    expires_at: new Date(Date.now() + TFA_TTL_MS).toISOString(),
  })

  // Mail
  const body = `Beste gebruiker,

Uw inlogcode voor Rebu CRM is:

${code}

Deze code is 5 minuten geldig. Als u deze inlog-poging niet heeft gedaan, negeer deze mail.

Met vriendelijke groet,
Rebu Kozijnen`
  try {
    await sendEmail({
      to: email,
      subject: `Rebu CRM inlogcode: ${code}`,
      html: buildRebuEmailHtml(body),
      fromName: 'Rebu Kozijnen',
    })
  } catch (err) {
    console.error('2FA mail mislukt:', err)
    return { error: 'Kon de inlogcode niet versturen. Controleer je e-mailadres.' }
  }

  await admin.from('login_audit').insert({ email, ip, user_agent: ua, succes: true, reden: 'password_ok_awaiting_2fa' })
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

  // Pak de meest recente nog-niet-gebruikte code van deze user
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

  // Succes → markeer code gebruikt + zet cookies
  await admin.from('tfa_codes').update({ used: true }).eq('id', tfa.id)
  const jar = await cookies()
  const isProd = process.env.NODE_ENV === 'production'
  const sessieOpties = {
    httpOnly: true,
    secure: isProd,
    sameSite: 'lax' as const,
    path: '/',
    maxAge: 60 * 60 * 24 * 30, // 30 dagen opslaan — middleware handhaaft activiteit apart
  }
  jar.set(SESSION_COOKIE, user.id, sessieOpties)
  jar.set(ACTIVITY_COOKIE, String(Date.now()), sessieOpties)
  return { success: true }
}

/** Handmatig uitloggen — wist alle relevante cookies */
export async function logoutAction() {
  const supabase = await createClient()
  await supabase.auth.signOut()
  const jar = await cookies()
  jar.delete(SESSION_COOKIE)
  jar.delete(ACTIVITY_COOKIE)
}

export const TFA_SESSION_DAYS_EXPORT = TFA_SESSION_DAYS
