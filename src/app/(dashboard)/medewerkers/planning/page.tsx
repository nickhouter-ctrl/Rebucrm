import { getMedewerkers, getMedewerkerPlanning } from '@/lib/actions'
import { PlanningView } from './planning-view'

export default async function PlanningPage() {
  const medewerkers = await getMedewerkers()
  return <PlanningView medewerkers={medewerkers.filter(m => m.actief)} />
}
