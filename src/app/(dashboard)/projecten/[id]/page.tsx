import { getProject, getRelaties, getOffertesByProject } from '@/lib/actions'
import { ProjectDetail } from './project-detail'

export default async function ProjectDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const isNew = id === 'nieuw'

  const [project, relaties, offertes] = await Promise.all([
    isNew ? null : getProject(id),
    getRelaties(),
    isNew ? [] : getOffertesByProject(id),
  ])

  return <ProjectDetail project={project} relaties={relaties} offertes={offertes} isNew={isNew} />
}
