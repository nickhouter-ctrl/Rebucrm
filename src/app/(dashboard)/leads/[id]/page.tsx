import { getLead, getLeadTaken } from '@/lib/actions'
import { LeadDetail } from './lead-detail'
import { redirect } from 'next/navigation'

export default async function LeadDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const [lead, taken] = await Promise.all([getLead(id), getLeadTaken(id)])

  if (!lead) {
    redirect('/leads')
  }

  return <LeadDetail lead={lead} taken={taken} />
}
