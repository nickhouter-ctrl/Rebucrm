import { getOrder, getRelaties, getProducten, getMedewerkers, getOrderMedewerkers, getOrderFacturen } from '@/lib/actions'
import { OrderForm } from './order-form'

export default async function OrderDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const isNew = id === 'nieuw'
  const [order, relaties, producten, medewerkers, orderMedewerkers, orderFacturen] = await Promise.all([
    isNew ? null : getOrder(id),
    getRelaties(),
    getProducten(),
    getMedewerkers(),
    isNew ? [] : getOrderMedewerkers(id),
    isNew ? [] : getOrderFacturen(id),
  ])
  return <OrderForm order={order} relaties={relaties} producten={producten} medewerkers={medewerkers} orderMedewerkers={orderMedewerkers} orderFacturen={orderFacturen} />
}
