import { getOrder, getRelaties, getProducten } from '@/lib/actions'
import { OrderForm } from './order-form'

export default async function OrderDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const [order, relaties, producten] = await Promise.all([
    id === 'nieuw' ? null : getOrder(id),
    getRelaties(),
    getProducten(),
  ])
  return <OrderForm order={order} relaties={relaties} producten={producten} />
}
