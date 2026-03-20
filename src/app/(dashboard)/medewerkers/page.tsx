import { getMedewerkers } from '@/lib/actions'
import { MedewerkerList } from './medewerker-list'

export default async function MedewerkersPage() {
  const medewerkers = await getMedewerkers()
  return <MedewerkerList medewerkers={medewerkers} />
}
