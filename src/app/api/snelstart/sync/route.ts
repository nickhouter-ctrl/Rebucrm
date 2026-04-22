import { NextResponse } from 'next/server'
import { syncSnelstartBetalingen } from '@/lib/actions'

// Gebruikt door de cron én door de handmatige "Sync SnelStart" knop.
export const dynamic = 'force-dynamic'
export const maxDuration = 300

export async function GET(req: Request) {
  // Optionele cron-auth: Vercel cron stuurt x-vercel-cron header (of Authorization Bearer CRON_SECRET).
  const cronSecret = process.env.CRON_SECRET
  const auth = req.headers.get('authorization') || ''
  const isCron = !!req.headers.get('x-vercel-cron') || (cronSecret && auth === `Bearer ${cronSecret}`)

  try {
    const result = await syncSnelstartBetalingen()
    return NextResponse.json({ ...result, isCron })
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : String(err) },
      { status: 500 }
    )
  }
}
