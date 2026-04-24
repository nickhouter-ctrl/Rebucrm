import { getProjectTimeline, getRelaties, getEmailsForProject, getProjectDocumenten, getEmailLogByProject } from '@/lib/actions'
import { ProjectDetail } from './project-detail'

export default async function ProjectDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const isNew = id === 'nieuw'

  const [timeline, relaties, emails, documenten, verstuurdeEmails] = await Promise.all([
    isNew ? null : getProjectTimeline(id),
    getRelaties(),
    isNew ? [] : getEmailsForProject(id),
    isNew ? [] : getProjectDocumenten(id),
    isNew ? [] : getEmailLogByProject(id),
  ])

  return <ProjectDetail timeline={timeline} relaties={relaties} isNew={isNew} emails={emails} documenten={documenten} verstuurdeEmails={verstuurdeEmails as VerstuurdeEmailPassthrough[]} />
}

type VerstuurdeEmailPassthrough = {
  id: string
  aan: string
  onderwerp: string | null
  bijlagen: { filename: string }[] | null
  verstuurd_op: string
  offertenummer?: string | null
}
