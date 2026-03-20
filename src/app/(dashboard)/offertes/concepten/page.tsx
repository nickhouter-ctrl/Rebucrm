import { getConceptOffertes, ensureConceptOffertesForAanvragen } from '@/lib/actions'
import { ConceptOffertesList } from './concept-offertes-list'

export default async function ConceptOffertesPage() {
  // Ensure any open aanvragen without concept offerte get one created
  await ensureConceptOffertesForAanvragen()
  const offertes = await getConceptOffertes()
  return <ConceptOffertesList offertes={offertes} />
}
