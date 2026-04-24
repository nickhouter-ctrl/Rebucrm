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

  // Pak de Rebu Kozijnen administratie — de DB heeft stub-administraties
  // van andere accounts. We filteren op de administratie met openstaande
  // facturen zodat we zeker het juiste pakken.
  const sb = createAdminClient()
  const { data: factuurRow } = await sb
    .from('facturen')
    .select('administratie_id')
    .not('mollie_payment_id', 'is', null)
    .in('status', ['verzonden', 'deels_betaald', 'vervallen'])
    .limit(1)
    .maybeSingle()
  if (!factuurRow) return NextResponse.json({ verzonden: 0, overgeslagen: 0, fouten: [], note: 'geen openstaande facturen met mollie_payment_id' })

  const result = await hermailAlleOpenstaandeFacturen(factuurRow.administratie_id as string)
  return NextResponse.json(result)
}
