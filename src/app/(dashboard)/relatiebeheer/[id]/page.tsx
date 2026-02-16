import { getRelatieDetail, getNotities } from '@/lib/actions'
import { RelatieForm } from './relatie-form'
import { RelatieDetail } from './relatie-detail'

export default async function RelatieDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params

  if (id === 'nieuw') {
    return <RelatieForm relatie={null} />
  }

  const [detail, notities] = await Promise.all([
    getRelatieDetail(id),
    getNotities(id),
  ])

  if (!detail.relatie) {
    return <RelatieForm relatie={null} />
  }

  return <RelatieDetail detail={detail} notities={notities} />
}
