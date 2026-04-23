import { getFacturen, getOrdersMetFactuurStatus } from '@/lib/actions'
import { FactuurList } from './factuur-list'

export const revalidate = 15

export default async function FacturatiePage() {
  const [facturen, ordersMetStatus] = await Promise.all([
    getFacturen(),
    getOrdersMetFactuurStatus(),
  ])
  return <FactuurList facturen={facturen} ordersMetStatus={ordersMetStatus} />
}
