import { getProjecten } from '@/lib/actions'
import { ProjectList } from './project-list'

export const revalidate = 15

export default async function ProjectenPage() {
  const projecten = await getProjecten()
  return <ProjectList projecten={projecten} />
}
