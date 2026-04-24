import { NextRequest, NextResponse } from 'next/server'

export const maxDuration = 60

export async function POST(req: NextRequest) {
  const secret = req.headers.get('x-admin-key')
  if (!secret || secret !== process.env.SUPABASE_SERVICE_ROLE_KEY) {
    return NextResponse.json({ error: 'forbidden' }, { status: 403 })
  }
  const { snelstartRelatieId } = await req.json() as { snelstartRelatieId?: string }
  if (!snelstartRelatieId) return NextResponse.json({ error: 'snelstartRelatieId ontbreekt' }, { status: 400 })

  try {
    const { ensureRelatieIsKlant } = await import('@/lib/snelstart')
    await ensureRelatieIsKlant(snelstartRelatieId)
    return NextResponse.json({ success: true })
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : String(err), stack: err instanceof Error ? err.stack : undefined }, { status: 500 })
  }
}
