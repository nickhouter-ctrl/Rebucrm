import { getArchiefOffertes, getArchiefFacturen } from '@/lib/actions'
import { ArchiefView } from './archief-view'

export const revalidate = 30

export default async function ArchiefPage() {
  const [offertes, facturen] = await Promise.all([
    getArchiefOffertes(),
    getArchiefFacturen(),
  ])
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return <ArchiefView offertes={offertes as any} facturen={facturen as any} />
}
