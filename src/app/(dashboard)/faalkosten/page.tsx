import { getFaalkosten } from '@/lib/actions'
import { FaalkostenView } from './faalkosten-view'

export default async function FaalkostenPage() {
  const faalkosten = await getFaalkosten()
  return <FaalkostenView faalkosten={faalkosten} />
}
