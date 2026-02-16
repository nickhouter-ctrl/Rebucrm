import { getOrders } from '@/lib/actions'
import { OrderList } from './order-list'

export default async function OrdersPage() {
  const orders = await getOrders()
  return <OrderList orders={orders} />
}
