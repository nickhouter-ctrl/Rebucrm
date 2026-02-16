import { getDocumenten } from '@/lib/actions'
import { DocumentenView } from './documenten-view'

export default async function DocumentenPage() {
  const documenten = await getDocumenten()
  return <DocumentenView documenten={documenten} />
}
