import { NextResponse } from 'next/server'
import { syncEmails } from '@/lib/imap'
import { createAdminClient } from '@/lib/supabase/admin'

export const dynamic = 'force-dynamic'
export const maxDuration = 300

async function handle(request: Request) {
  // Verify cron secret or allow unauthenticated (manual trigger from frontend)
  const authHeader = request.headers.get('authorization')
  const cronSecret = process.env.CRON_SECRET

  if (cronSecret && authHeader && authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const supabase = createAdminClient()

    // Only sync the main admin (Rebu Kozijnen B.V.)
    const { data: administraties } = await supabase
      .from('administraties')
      .select('id')
      .ilike('naam', '%Rebu%')
      .limit(1)

    let adminId: string
    if (administraties?.length) {
      adminId = administraties[0].id
    } else {
      return NextResponse.json({ message: 'Geen administratie gevonden' })
    }

    const result = await syncEmails(adminId)
    return NextResponse.json(result)
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Sync mislukt' },
      { status: 500 }
    )
  }
}

export const POST = handle
export const GET = handle
