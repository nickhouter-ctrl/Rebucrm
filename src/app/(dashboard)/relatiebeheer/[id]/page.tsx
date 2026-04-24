import { getRelatieDetail, getNotities, getKlantAccounts, getTakenByRelatie, getEmailsByRelatie, getContactpersonen, getEmailLogByRelatie } from '@/lib/actions'
import { RelatieForm } from './relatie-form'
import { RelatieDetail } from './relatie-detail'

export default async function RelatieDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params

  if (id === 'nieuw') {
    return <RelatieForm relatie={null} />
  }

  const [detail, notities, klantAccounts, relatieTaken, relatieEmails, contactpersonen, verstuurdeEmails] = await Promise.all([
    getRelatieDetail(id),
    getNotities(id),
    getKlantAccounts(id),
    getTakenByRelatie(id),
    getEmailsByRelatie(id),
    getContactpersonen(id),
    getEmailLogByRelatie(id),
  ])

  if (!detail.relatie) {
    return <RelatieForm relatie={null} />
  }

  return <RelatieDetail detail={detail} notities={notities} klantAccounts={klantAccounts} relatieTaken={relatieTaken} relatieEmails={relatieEmails} contactpersonen={contactpersonen} verstuurdeEmails={verstuurdeEmails as VerstuurdeEmailPassthrough[]} />
}

type VerstuurdeEmailPassthrough = {
  id: string
  aan: string
  onderwerp: string | null
  bijlagen: { filename: string }[] | null
  verstuurd_op: string
  offerte?: { id: string; offertenummer: string } | null
}
