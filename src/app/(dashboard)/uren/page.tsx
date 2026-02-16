import { getUren, getProjecten } from '@/lib/actions'
import { UrenView } from './uren-view'

export default async function UrenPage() {
  const [uren, projecten] = await Promise.all([getUren(), getProjecten()])
  return <UrenView uren={uren} projecten={projecten} />
}
