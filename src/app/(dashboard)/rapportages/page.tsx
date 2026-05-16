import { getFacturen, getInkoopfacturen, getUren, getConversieFunnelDashboard } from '@/lib/actions'
import { RapportagesView } from './rapportages-view'

export default async function RapportagesPage() {
  const [facturen, inkoopfacturen, uren, funnel] = await Promise.all([
    getFacturen(),
    getInkoopfacturen(),
    getUren(),
    getConversieFunnelDashboard(),
  ])
  return <RapportagesView facturen={facturen} inkoopfacturen={inkoopfacturen} uren={uren} funnel={funnel} />
}
