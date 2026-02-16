import { getAdministratie, getNummering, getGebruikers } from '@/lib/actions'
import { BeheerView } from './beheer-view'

export default async function BeheerPage() {
  const [administratie, nummering, gebruikers] = await Promise.all([
    getAdministratie(),
    getNummering(),
    getGebruikers(),
  ])
  return <BeheerView administratie={administratie} nummering={nummering} gebruikers={gebruikers} />
}
