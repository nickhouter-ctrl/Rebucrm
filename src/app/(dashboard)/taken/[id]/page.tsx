import { getTaak, getProjecten, getMedewerkers, getRelaties, getOffertes, getTaakNotities, getCurrentMedewerkerId, getOfferteEmailLog } from '@/lib/actions'
import { createClient } from '@/lib/supabase/server'
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

  // Als de taak aan een offerte hangt: haal offerte-status + verzonden mails op
  // zodat de medewerker direct ziet of de offerte verstuurd is en wat de
  // klant precies heeft ontvangen (incl. bijlagen).
  let offerteStatus: { status: string; offertenummer: string; datum: string | null; totaal: number | null } | null = null
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let offerteEmails: any[] = []
  const offerteId = (taak as Record<string, unknown> | null)?.offerte_id as string | undefined
  if (offerteId) {
    const sb = await createClient()
    const { data: off } = await sb.from('offertes')
      .select('offertenummer, status, datum, totaal')
      .eq('id', offerteId)
      .maybeSingle()
    if (off) offerteStatus = off
    offerteEmails = await getOfferteEmailLog(offerteId)
  }

  return <TaakForm taak={taak} projecten={projecten} medewerkers={medewerkers} relaties={relaties} offertes={offertes} notities={notities} defaultRelatieId={relatie_id} currentMedewerkerId={currentMedewerkerId} offerteStatus={offerteStatus} offerteEmails={offerteEmails} />
}
