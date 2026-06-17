import { Suspense } from 'react'
import { getTaken, getMedewerkers } from '@/lib/actions'
import { TakenView } from './taken-view'

export const revalidate = 15

export default async function TakenPage() {
  const [{ taken, rol, currentUserId }, medewerkers] = await Promise.all([getTaken(), getMedewerkers()])
  const isAdmin = rol === 'admin' || rol === 'gebruiker'
  // Alleen actieve medewerkers zijn toewijsbaar; alleen wat de inline-dropdown nodig heeft.
  const alleMedewerkers = medewerkers
    .filter((m: { actief?: boolean }) => m.actief)
    .map((m: { id: string; naam: string; profiel_id: string | null }) => ({ id: m.id, naam: m.naam, profiel_id: m.profiel_id }))
  return (
    <Suspense>
      <TakenView taken={taken} isAdmin={isAdmin} currentUserId={currentUserId} alleMedewerkers={alleMedewerkers} />
    </Suspense>
  )
}
