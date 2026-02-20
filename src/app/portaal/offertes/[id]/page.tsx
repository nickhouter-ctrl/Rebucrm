import { getPortaalOfferte } from '@/lib/portaal-actions'
import { notFound } from 'next/navigation'
import { OfferteDetailView } from './offerte-detail-view'

export default async function PortaalOfferteDetailPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const offerte = await getPortaalOfferte(id)

  if (!offerte) {
    notFound()
  }

  return <OfferteDetailView offerte={offerte} />
}
