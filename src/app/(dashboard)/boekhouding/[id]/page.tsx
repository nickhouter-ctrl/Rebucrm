import { getBoeking, getGrootboekrekeningen } from '@/lib/actions'
import { BoekingForm } from './boeking-form'

export default async function BoekingDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const [boeking, rekeningen] = await Promise.all([
    id === 'nieuw' ? null : getBoeking(id),
    getGrootboekrekeningen(),
  ])
  return <BoekingForm boeking={boeking} rekeningen={rekeningen} />
}
