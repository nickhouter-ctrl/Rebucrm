import { getFacturen } from '@/lib/actions'
import { FactuurList } from './factuur-list'

export default async function FacturatiePage() {
  const facturen = await getFacturen()
  return <FactuurList facturen={facturen} />
}
