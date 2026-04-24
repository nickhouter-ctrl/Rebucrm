import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { hermailAlleOpenstaandeFacturen } from '@/lib/actions'

export const maxDuration = 300
export const dynamic = 'force-dynamic'

/**
 * Admin-only bulk hermail: vernieuwt de betaallinks en verstuurt herinneringen
 * naar alle openstaande facturen. Beschermd met service-role key header zodat
 * alleen interne scripts dit kunnen triggeren.
 */
export async function POST(req: NextRequest) {
  const secret = req.headers.get('x-admin-key')
  if (!secret || secret !== process.env.SUPABASE_SERVICE_ROLE_KEY) {
    return NextResponse.json({ error: 'forbidden' }, { status: 403 })
  }

  // Pak de (enige) administratie-id — voor deze deployment is dat er één.
  const sb = createAdminClient()
  const { data: admin } = await sb.from('administraties').select('id').limit(1).single()
  if (!admin) return NextResponse.json({ error: 'geen administratie gevonden' }, { status: 500 })

  const result = await hermailAlleOpenstaandeFacturen(admin.id as string)
  return NextResponse.json(result)
}
