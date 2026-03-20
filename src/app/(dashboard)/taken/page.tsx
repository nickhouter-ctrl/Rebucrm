import { getTaken } from '@/lib/actions'
import { TakenView } from './taken-view'

export default async function TakenPage() {
  const taken = await getTaken()
  return <TakenView taken={taken} />
}
