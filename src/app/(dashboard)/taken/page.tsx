import { getTaken } from '@/lib/actions'
import { TakenView } from './taken-view'

export default async function TakenPage() {
  const { taken, rol } = await getTaken()
  const isAdmin = rol === 'admin' || rol === 'gebruiker'
  return <TakenView taken={taken} isAdmin={isAdmin} />
}
