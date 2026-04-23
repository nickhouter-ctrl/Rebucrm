import { getOffertes } from '@/lib/actions'
import { OfferteList } from './offerte-list'

export const revalidate = 20

export default async function OffertesPage() {
  const offertes = await getOffertes()
  return <OfferteList offertes={offertes} />
}
