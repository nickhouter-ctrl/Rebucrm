import { getOffertes } from '@/lib/actions'
import { OfferteList } from './offerte-list'

export default async function OffertesPage() {
  const offertes = await getOffertes()
  return <OfferteList offertes={offertes} />
}
