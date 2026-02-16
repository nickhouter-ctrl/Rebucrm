import { getInkoopfactuur, getRelaties } from '@/lib/actions'
import { InkoopForm } from './inkoop-form'

export default async function InkoopDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const [factuur, relaties] = await Promise.all([
    id === 'nieuw' ? null : getInkoopfactuur(id),
    getRelaties(),
  ])
  return <InkoopForm factuur={factuur} relaties={relaties.filter(r => r.type === 'leverancier' || r.type === 'beide')} />
}
