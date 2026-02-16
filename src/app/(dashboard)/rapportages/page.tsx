import { getFacturen, getInkoopfacturen, getUren } from '@/lib/actions'
import { RapportagesView } from './rapportages-view'

export default async function RapportagesPage() {
  const [facturen, inkoopfacturen, uren] = await Promise.all([
    getFacturen(),
    getInkoopfacturen(),
    getUren(),
  ])
  return <RapportagesView facturen={facturen} inkoopfacturen={inkoopfacturen} uren={uren} />
}
