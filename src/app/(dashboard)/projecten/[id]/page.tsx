import { getProjectTimeline, getRelaties, getEmailsForProject } from '@/lib/actions'
import { ProjectDetail } from './project-detail'

export default async function ProjectDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const isNew = id === 'nieuw'

  const [timeline, relaties, emails] = await Promise.all([
    isNew ? null : getProjectTimeline(id),
    getRelaties(),
    isNew ? [] : getEmailsForProject(id),
  ])

  return <ProjectDetail timeline={timeline} relaties={relaties} isNew={isNew} emails={emails} />
}
