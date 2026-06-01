import { getAanvragen, getGebruikers } from '@/lib/actions'
import { AanvragenView } from './aanvragen-view'

export default async function AanvragenPage() {
  const [aanvragen, gebruikers] = await Promise.all([getAanvragen(), getGebruikers()])
  return (
    <AanvragenView
      aanvragen={aanvragen}
      gebruikers={gebruikers.map(g => ({ id: g.id as string, naam: (g.naam as string) || 'Onbekend' }))}
    />
  )
}
