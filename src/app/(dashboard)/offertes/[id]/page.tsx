import { getOfferte, getRelaties, getProducten } from '@/lib/actions'
import { OfferteForm } from './offerte-form'

export default async function OfferteDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const [offerte, relaties, producten] = await Promise.all([
    id === 'nieuw' ? null : getOfferte(id),
    getRelaties(),
    getProducten(),
  ])

  const relatiesWithDetails = relaties.map((r: Record<string, unknown>) => ({
    id: r.id as string,
    bedrijfsnaam: r.bedrijfsnaam as string,
    contactpersoon: (r.contactpersoon as string) || null,
    email: (r.email as string) || null,
    telefoon: (r.telefoon as string) || null,
    plaats: (r.plaats as string) || null,
  }))

  return <OfferteForm offerte={offerte} relaties={relatiesWithDetails} producten={producten} />
}
