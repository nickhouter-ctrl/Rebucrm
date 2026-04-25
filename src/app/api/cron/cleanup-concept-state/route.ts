import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'

// Cleanup-cron: verwijdert offerte_concept_state records die approved zijn
// en ouder dan 30 dagen, plus afgekeurde concepten ouder dan 90 dagen.
// Wordt dagelijks aangeroepen door Vercel cron (zie vercel.json).

export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  // Vercel cron stuurt automatisch een Authorization header met CRON_SECRET
  const auth = req.headers.get('authorization')
  if (process.env.CRON_SECRET && auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  }

  const sb = createAdminClient()
  const dertigDagenGeleden = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString()
  const negentigDagenGeleden = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString()

  // Approved (klaar) → 30 dagen bewaren voor audit
  const { data: deletedApproved, error: e1 } = await sb
    .from('offerte_concept_state')
    .delete()
    .eq('approved', true)
    .lt('updated_at', dertigDagenGeleden)
    .select('id')

  // Onafgemaakt (geen approve) → 90 dagen
  const { data: deletedAbandoned, error: e2 } = await sb
    .from('offerte_concept_state')
    .delete()
    .eq('approved', false)
    .lt('updated_at', negentigDagenGeleden)
    .select('id')

  if (e1 || e2) {
    return NextResponse.json({
      error: e1?.message || e2?.message,
      approved_deleted: deletedApproved?.length || 0,
      abandoned_deleted: deletedAbandoned?.length || 0,
    }, { status: 500 })
  }

  return NextResponse.json({
    approved_deleted: deletedApproved?.length || 0,
    abandoned_deleted: deletedAbandoned?.length || 0,
  })
}
