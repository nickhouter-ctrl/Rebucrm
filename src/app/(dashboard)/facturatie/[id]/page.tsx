import { getFactuur, getRelaties, getProducten, getVolgendeNummerPreview } from '@/lib/actions'
import { FactuurForm } from './factuur-form'

export default async function FactuurDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const isNew = id === 'nieuw'
  const [factuur, relaties, producten, nummerPreview] = await Promise.all([
    isNew ? null : getFactuur(id),
    getRelaties(),
    getProducten(),
    isNew ? getVolgendeNummerPreview('factuur') : Promise.resolve(''),
  ])
  return <FactuurForm factuur={factuur} relaties={relaties} producten={producten} nummerPreview={nummerPreview} />
}
