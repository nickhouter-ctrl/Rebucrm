import { getOfferte, getRelaties, getProducten, getOrderByOfferteId, getOfferteEmailLog } from '@/lib/actions'
import { OfferteForm } from './offerte-form'

export default async function OfferteDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>
  searchParams: Promise<{ relatie_id?: string; wizard?: string }>
}) {
  const { id } = await params
  const { relatie_id, wizard } = await searchParams
  const [offerte, relaties, producten, linkedOrder, emailLog] = await Promise.all([
    id === 'nieuw' ? null : getOfferte(id),
    getRelaties(),
    getProducten(),
    id === 'nieuw' ? null : getOrderByOfferteId(id),
    id === 'nieuw' ? [] : getOfferteEmailLog(id),
  ])

  const relatiesWithDetails = relaties.map((r: Record<string, unknown>) => ({
    id: r.id as string,
    bedrijfsnaam: r.bedrijfsnaam as string,
    contactpersoon: (r.contactpersoon as string) || null,
    email: (r.email as string) || null,
    telefoon: (r.telefoon as string) || null,
    plaats: (r.plaats as string) || null,
    standaard_marge: (r.standaard_marge as number) ?? null,
  }))

  // Look up relatie name if relatie_id is provided
  const initialRelatie = relatie_id
    ? relatiesWithDetails.find(r => r.id === relatie_id) || null
    : null

  return (
    <OfferteForm
      offerte={offerte}
      relaties={relatiesWithDetails}
      producten={producten}
      initialRelatieId={initialRelatie?.id || null}
      initialRelatieName={initialRelatie?.bedrijfsnaam || null}
      wizardMode={wizard === 'concept' ? 'concept' : wizard === 'true' ? true : false}
      linkedOrder={linkedOrder}
      emailLog={emailLog as unknown as EmailLogEntry[]}
    />
  )
}

export type EmailLogEntry = {
  id: string
  aan: string
  onderwerp: string | null
  bijlagen: { filename: string }[] | null
  verstuurd_op: string
}
