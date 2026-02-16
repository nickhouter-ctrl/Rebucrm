import { getProject, getRelaties } from '@/lib/actions'
import { ProjectForm } from './project-form'

export default async function ProjectDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const [project, relaties] = await Promise.all([
    id === 'nieuw' ? null : getProject(id),
    getRelaties(),
  ])
  return <ProjectForm project={project} relaties={relaties} />
}
