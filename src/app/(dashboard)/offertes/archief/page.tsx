import { getArchiefOffertes } from '@/lib/actions'
import { ArchiefOfferteList } from './archief-list'

export const revalidate = 30

export default async function OfferteArchiefPage() {
  const offertes = await getArchiefOffertes()
  return <ArchiefOfferteList offertes={offertes} />
}
