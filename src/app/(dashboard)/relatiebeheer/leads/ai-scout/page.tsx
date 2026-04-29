import { AiScout } from './ai-scout'
import { createClient } from '@/lib/supabase/server'
import { getAdministratieId } from '@/lib/actions'

export default async function AiScoutPage() {
  const adminId = await getAdministratieId()
  let bestaande: unknown[] = []
  if (adminId) {
    const sb = await createClient()
    const { data } = await sb.from('leads')
      .select('id, bedrijfsnaam, contactpersoon, email, telefoon, plaats, status, notities, created_at, relatie_id')
      .eq('administratie_id', adminId)
      .eq('bron', 'ai-scout')
      .order('created_at', { ascending: false })
      .limit(100)
    bestaande = data || []
  }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return <AiScout bestaande={bestaande as any} />
}
