import { getVerkoopkansenPipeline } from '@/lib/actions'
import { PipelineKanban } from './pipeline-kanban'

export const revalidate = 30

export default async function VerkoopkansenKanbanPage() {
  const items = await getVerkoopkansenPipeline()
  return <PipelineKanban items={items} />
}
