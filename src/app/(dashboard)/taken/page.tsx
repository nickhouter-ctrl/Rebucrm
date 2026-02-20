import { getTaken, getProjecten, getAgendaLeveringen } from '@/lib/actions'
import { TakenView } from './taken-view'

export default async function TakenPage() {
  const [taken, projecten, leveringen] = await Promise.all([getTaken(), getProjecten(), getAgendaLeveringen()])
  return <TakenView taken={taken} projecten={projecten} leveringen={leveringen} />
}
