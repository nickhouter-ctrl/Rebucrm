import { getRelatieDetail, getNotities, getKlantAccounts, getTakenByRelatie, getEmailsByRelatie } from '@/lib/actions'
import { RelatieForm } from './relatie-form'
import { RelatieDetail } from './relatie-detail'

export default async function RelatieDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params

  if (id === 'nieuw') {
    return <RelatieForm relatie={null} />
  }

  const [detail, notities, klantAccounts, relatieTaken, relatieEmails] = await Promise.all([
    getRelatieDetail(id),
    getNotities(id),
    getKlantAccounts(id),
    getTakenByRelatie(id),
    getEmailsByRelatie(id),
  ])

  if (!detail.relatie) {
    return <RelatieForm relatie={null} />
  }

  return <RelatieDetail detail={detail} notities={notities} klantAccounts={klantAccounts} relatieTaken={relatieTaken} relatieEmails={relatieEmails} />
}
