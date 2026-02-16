import { getTaken, getProjecten } from '@/lib/actions'
import { TakenView } from './taken-view'

export default async function TakenPage() {
  const [taken, projecten] = await Promise.all([getTaken(), getProjecten()])
  return <TakenView taken={taken} projecten={projecten} />
}
