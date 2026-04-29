import { getLeads, getAdministratieId } from '@/lib/actions'
import { createClient } from '@/lib/supabase/server'
import { LeadsView } from './leads-view'

export default async function LeadsPage() {
  const [leads, adminId] = await Promise.all([
    getLeads(),
    getAdministratieId(),
  ])
  let aiScoutLeads: unknown[] = []
  if (adminId) {
    const sb = await createClient()
    const { data } = await sb.from('leads')
      .select('id, bedrijfsnaam, contactpersoon, email, telefoon, plaats, status, notities, created_at, relatie_id')
      .eq('administratie_id', adminId)
      .eq('bron', 'ai-scout')
      .order('created_at', { ascending: false })
      .limit(50)
    aiScoutLeads = data || []
  }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return <LeadsView leads={leads} aiScoutLeads={aiScoutLeads as any} />
}
