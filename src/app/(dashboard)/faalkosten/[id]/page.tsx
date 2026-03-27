import { getFaalkost, getProjecten } from '@/lib/actions'
import { FaalkostForm } from './faalkost-form'
import { notFound } from 'next/navigation'

export default async function FaalkostDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const isNew = id === 'nieuw'

  const [faalkost, projecten] = await Promise.all([
    isNew ? null : getFaalkost(id),
    getProjecten(),
  ])

  if (!isNew && !faalkost) notFound()

  return <FaalkostForm faalkost={faalkost} projecten={projecten} isNew={isNew} />
}
