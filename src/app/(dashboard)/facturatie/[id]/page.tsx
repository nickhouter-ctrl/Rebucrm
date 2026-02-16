import { getFactuur, getRelaties, getProducten } from '@/lib/actions'
import { FactuurForm } from './factuur-form'

export default async function FactuurDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const [factuur, relaties, producten] = await Promise.all([
    id === 'nieuw' ? null : getFactuur(id),
    getRelaties(),
    getProducten(),
  ])
  return <FactuurForm factuur={factuur} relaties={relaties} producten={producten} />
}
