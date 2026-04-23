import { getRelaties } from '@/lib/actions'
import { RelatieList } from './relatie-list'

export const revalidate = 30

export default async function RelatiesBeheerPage() {
  const relaties = await getRelaties()
  return <RelatieList relaties={relaties} />
}
