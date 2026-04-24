import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

export const maxDuration = 30

export async function POST(req: NextRequest) {
  const secret = req.headers.get('x-admin-key')
  if (!secret || secret !== process.env.SUPABASE_SERVICE_ROLE_KEY) {
    return NextResponse.json({ error: 'forbidden' }, { status: 403 })
  }
  const { email, password } = await req.json()
  const log: Array<{ step: string; ms: number; ok: boolean; detail?: string }> = []
  const start = Date.now()
  let t = Date.now()
  function log_step(step: string, ok: boolean, detail?: string) {
    const now = Date.now()
    log.push({ step, ms: now - t, ok, detail })
    t = now
  }

  try {
    const supabase = await createClient(); log_step('createClient', true)
    const admin = createAdminClient(); log_step('createAdminClient', true)

    const since = new Date(Date.now() - 15 * 60 * 1000).toISOString()
    const { count: recentFails } = await admin.from('login_audit').select('*', { count: 'exact', head: true }).eq('ip', 'debug').eq('succes', false).gte('created_at', since)
    log_step('rate_check', true, `fails=${recentFails ?? 0}`)

    const t1 = Date.now()
    const { data, error } = await supabase.auth.signInWithPassword({ email, password })
    log_step('signInWithPassword', !error, error?.message || `user=${data?.user?.id?.slice(0, 8)}`)

    if (error || !data.user) {
      return NextResponse.json({ ok: false, totalMs: Date.now() - start, log, t1 })
    }

    const { data: profiel } = await admin.from('profielen').select('rol').eq('id', data.user.id).single()
    log_step('profiel_lookup', true, `rol=${profiel?.rol}`)

    await admin.from('tfa_codes').insert({
      user_id: data.user.id,
      code_hash: 'debug',
      expires_at: new Date(Date.now() + 60000).toISOString(),
    })
    log_step('tfa_insert', true)

    return NextResponse.json({ ok: true, totalMs: Date.now() - start, log })
  } catch (err) {
    log_step('ERROR', false, err instanceof Error ? err.message : String(err))
    return NextResponse.json({ ok: false, totalMs: Date.now() - start, log, error: err instanceof Error ? err.message : String(err) })
  }
}
