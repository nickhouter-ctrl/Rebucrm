import { NextRequest, NextResponse } from 'next/server'
import { pushFactuurToSnelStart } from '@/lib/actions'

export const maxDuration = 60
export const dynamic = 'force-dynamic'

/**
 * Eenmalig een factuur naar SnelStart pushen als de automatische push
 * bij versturen gefaald heeft. Service-role secret required.
 */
export async function POST(req: NextRequest) {
  const secret = req.headers.get('x-admin-key')
  if (!secret || secret !== process.env.SUPABASE_SERVICE_ROLE_KEY) {
    return NextResponse.json({ error: 'forbidden' }, { status: 403 })
  }
  const { factuurId } = await req.json() as { factuurId?: string }
  if (!factuurId) return NextResponse.json({ error: 'factuurId ontbreekt' }, { status: 400 })

  try {
    const result = await pushFactuurToSnelStart(factuurId)
    return NextResponse.json({ success: true, result })
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : String(err) }, { status: 500 })
  }
}
