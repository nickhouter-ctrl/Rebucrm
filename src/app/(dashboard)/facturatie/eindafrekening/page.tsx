import { getEindafrekeningen } from '@/lib/actions'
import { EindafrekeningView } from './eindafrekening-view'

export const revalidate = 30

export default async function EindafrekeningPage() {
  const aanbetalings = await getEindafrekeningen()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return <EindafrekeningView aanbetalings={aanbetalings as any} />
}
