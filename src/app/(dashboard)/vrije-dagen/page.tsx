import { getVrijeDagen, getMedewerkers } from '@/lib/actions'
import { VrijeDagenView } from './vrije-dagen-view'

export const revalidate = 20

export default async function VrijeDagenPage() {
  const [data, medewerkers] = await Promise.all([getVrijeDagen(), getMedewerkers()])
  return (
    <VrijeDagenView
      items={data.items as never[]}
      rol={data.rol}
      medewerkers={medewerkers.map(m => ({ id: m.id as string, naam: (m.naam as string) || 'Onbekend' }))}
    />
  )
}
