import { getTaak, getProjecten, getMedewerkers, getRelaties, getOffertes } from '@/lib/actions'
import { TaakForm } from './taak-form'

export default async function TaakDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const [taak, projecten, medewerkers, relaties, offertes] = await Promise.all([
    id === 'nieuw' ? null : getTaak(id),
    getProjecten(),
    getMedewerkers(),
    getRelaties(),
    getOffertes(),
  ])
  return <TaakForm taak={taak} projecten={projecten} medewerkers={medewerkers} relaties={relaties} offertes={offertes} />
}
