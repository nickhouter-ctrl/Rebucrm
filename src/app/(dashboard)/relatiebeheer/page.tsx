import { getRelaties } from '@/lib/actions'
import { RelatieList } from './relatie-list'

export default async function RelatiesBeheerPage() {
  const relaties = await getRelaties()
  return <RelatieList relaties={relaties} />
}
