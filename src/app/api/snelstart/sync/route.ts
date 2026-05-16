import { NextResponse } from 'next/server'
import { syncSnelstartBetalingen } from '@/lib/actions'
import { createAdminClient } from '@/lib/supabase/admin'

// Gebruikt door de cron én door de handmatige "Sync SnelStart" knop.
export const dynamic = 'force-dynamic'
export const maxDuration = 300

export async function GET(req: Request) {
  // Optionele cron-auth: Vercel cron stuurt x-vercel-cron header (of Authorization Bearer CRON_SECRET).
  const cronSecret = process.env.CRON_SECRET
  const auth = req.headers.get('authorization') || ''
  const isCron = !!req.headers.get('x-vercel-cron') || (cronSecret && auth === `Bearer ${cronSecret}`)

  try {
    // Cron-requests hebben geen user-sessie → administratieId expliciet opzoeken
    // (zelfde patroon als /api/email/sync). Bij handmatige aanroep door een
    // ingelogde gebruiker valt de actie zelf terug op getAdministratieId().
    let adminIdOverride: string | undefined
    if (isCron) {
      const supabase = createAdminClient()
      const { data: administraties } = await supabase
        .from('administraties')
        .select('id')
        .ilike('naam', '%Rebu%')
        .limit(1)
      if (administraties?.length) {
        adminIdOverride = administraties[0].id
      } else {
        return NextResponse.json({ error: 'Geen administratie gevonden voor cron-sync', isCron }, { status: 404 })
      }
    }

    const result = await syncSnelstartBetalingen(adminIdOverride)
    return NextResponse.json({ ...result, isCron })
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : String(err) },
      { status: 500 }
    )
  }
}
