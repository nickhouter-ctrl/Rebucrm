import { LeadsTabs } from './leads-tabs'
import { createClient } from '@/lib/supabase/server'
import { getAdministratieId } from '@/lib/actions'

export default async function LeadsPage() {
  const adminId = await getAdministratieId()
  let aiScoutLeads: unknown[] = []
  if (adminId) {
    const sb = await createClient()
    const { data } = await sb.from('leads')
      .select('id, bedrijfsnaam, contactpersoon, email, telefoon, plaats, status, notities, created_at, relatie_id')
      .eq('administratie_id', adminId)
      .eq('bron', 'ai-scout')
      .order('created_at', { ascending: false })
      .limit(100)
    aiScoutLeads = data || []
  }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return <LeadsTabs aiScoutLeads={aiScoutLeads as any} />
}
