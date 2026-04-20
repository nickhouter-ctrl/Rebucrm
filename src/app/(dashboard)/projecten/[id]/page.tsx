import { getProjectTimeline, getRelaties, getEmailsForProject, getProjectDocumenten } from '@/lib/actions'
import { ProjectDetail } from './project-detail'

export default async function ProjectDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const isNew = id === 'nieuw'

  const [timeline, relaties, emails, documenten] = await Promise.all([
    isNew ? null : getProjectTimeline(id),
    getRelaties(),
    isNew ? [] : getEmailsForProject(id),
    isNew ? [] : getProjectDocumenten(id),
  ])

  return <ProjectDetail timeline={timeline} relaties={relaties} isNew={isNew} emails={emails} documenten={documenten} />
}
