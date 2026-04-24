import { NextRequest, NextResponse } from 'next/server'
import { sendEmail } from '@/lib/email'
import { buildRebuEmailHtml } from '@/lib/email-template'

export const maxDuration = 30
export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  const secret = req.headers.get('x-admin-key')
  if (!secret || secret !== process.env.SUPABASE_SERVICE_ROLE_KEY) {
    return NextResponse.json({ error: 'forbidden' }, { status: 403 })
  }
  const to = req.nextUrl.searchParams.get('to') || 'nick@rebukozijnen.nl'
  const started = Date.now()
  try {
    await Promise.race([
      sendEmail({
        to,
        subject: 'Rebu CRM - testmail',
        html: buildRebuEmailHtml('Dit is een testmail voor SMTP debug.'),
        fromName: 'Rebu Kozijnen',
      }),
      new Promise((_, reject) => setTimeout(() => reject(new Error('mail-timeout-15s')), 15000)),
    ])
    return NextResponse.json({
      success: true,
      ms: Date.now() - started,
      smtp_host: process.env.SMTP_HOST || 'smtp.gmail.com',
      smtp_port: process.env.SMTP_PORT || '587',
      smtp_user_set: !!process.env.SMTP_USER,
      smtp_pass_set: !!process.env.SMTP_PASS,
      smtp_from: process.env.SMTP_FROM || '(fallback)',
    })
  } catch (err) {
    return NextResponse.json({
      success: false,
      ms: Date.now() - started,
      error: err instanceof Error ? err.message : String(err),
      smtp_host: process.env.SMTP_HOST || 'smtp.gmail.com',
      smtp_port: process.env.SMTP_PORT || '587',
      smtp_user_set: !!process.env.SMTP_USER,
      smtp_pass_set: !!process.env.SMTP_PASS,
    })
  }
}
