import { Suspense } from 'react'
import { getTaken } from '@/lib/actions'
import { TakenView } from './taken-view'

export default async function TakenPage() {
  const { taken, rol } = await getTaken()
  const isAdmin = rol === 'admin' || rol === 'gebruiker'
  return (
    <Suspense>
      <TakenView taken={taken} isAdmin={isAdmin} />
    </Suspense>
  )
}
