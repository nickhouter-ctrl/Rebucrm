import { getBoekingen, getGrootboekrekeningen } from '@/lib/actions'
import { BoekhoudingView } from './boekhouding-view'

export default async function BoekhoudingPage() {
  const [boekingen, rekeningen] = await Promise.all([
    getBoekingen(),
    getGrootboekrekeningen(),
  ])
  return <BoekhoudingView boekingen={boekingen} rekeningen={rekeningen} />
}
