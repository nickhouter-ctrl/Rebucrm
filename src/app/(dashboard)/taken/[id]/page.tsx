import { getTaak, getProjecten, getMedewerkers, getRelaties, getOffertes, getTaakNotities, getCurrentMedewerkerId } from '@/lib/actions'
import { TaakForm } from './taak-form'

export default async function TaakDetailPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ relatie_id?: string }> }) {
  const { id } = await params
  const { relatie_id } = await searchParams
  const isNew = id === 'nieuw'
  const [taak, projecten, medewerkers, relaties, offertes, notities, currentMedewerkerId] = await Promise.all([
    isNew ? null : getTaak(id),
    getProjecten(),
    getMedewerkers(),
    getRelaties(),
    getOffertes(),
    isNew ? [] : getTaakNotities(id),
    getCurrentMedewerkerId(),
  ])
  return <TaakForm taak={taak} projecten={projecten} medewerkers={medewerkers} relaties={relaties} offertes={offertes} notities={notities} defaultRelatieId={relatie_id} currentMedewerkerId={currentMedewerkerId} />
}
