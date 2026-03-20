import { getLeads } from '@/lib/actions'
import { LeadsView } from './leads-view'

export default async function LeadsPage() {
  const leads = await getLeads()
  return <LeadsView leads={leads} />
}
