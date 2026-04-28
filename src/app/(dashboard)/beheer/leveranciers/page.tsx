import { getLeverancierAiStats } from '@/lib/actions'
import { LeverancierStatsView } from './leverancier-stats-view'

export const revalidate = 60

export default async function LeverancierStatsPage() {
  const stats = await getLeverancierAiStats()
  return <LeverancierStatsView stats={stats} />
}
