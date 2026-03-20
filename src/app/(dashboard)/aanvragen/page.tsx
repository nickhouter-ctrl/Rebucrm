import { getAanvragen } from '@/lib/actions'
import { AanvragenView } from './aanvragen-view'

export default async function AanvragenPage() {
  const aanvragen = await getAanvragen()
  return <AanvragenView aanvragen={aanvragen} />
}
