import { getInkoopfacturen } from '@/lib/actions'
import { InkoopList } from './inkoop-list'

export default async function InkoopPage() {
  const facturen = await getInkoopfacturen()
  return <InkoopList facturen={facturen} />
}
