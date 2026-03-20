import { NextResponse } from 'next/server'
import { syncEmails } from '@/lib/imap'
import { createAdminClient } from '@/lib/supabase/admin'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

export async function POST(request: Request) {
  // Verify cron secret or allow unauthenticated (manual trigger from frontend)
  const authHeader = request.headers.get('authorization')
  const cronSecret = process.env.CRON_SECRET

  if (cronSecret && authHeader && authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const supabase = createAdminClient()

    // Only sync the main admin (Rebu) — single IMAP account
    const { data: administraties } = await supabase
      .from('administraties')
      .select('id')
      .eq('naam', 'Rebu')
      .limit(1)

    // Fallback: if no 'Rebu' found, get the one with most relaties
    let adminId: string
    if (administraties?.length) {
      adminId = administraties[0].id
    } else {
      const { data: allAdmins } = await supabase.from('administraties').select('id').limit(1)
      if (!allAdmins?.length) {
        return NextResponse.json({ message: 'Geen administratie gevonden' })
      }
      adminId = allAdmins[0].id
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
