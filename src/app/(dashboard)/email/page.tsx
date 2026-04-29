import { getEmails, getEmailSyncStatus, getMedewerkers, getProjecten, getEmailFolders } from '@/lib/actions'
import { EmailView } from './email-view'

export const revalidate = 20

export default async function EmailPage() {
  const [{ emails, total }, syncStatus, medewerkers, projecten, folders] = await Promise.all([
    getEmails(),
    getEmailSyncStatus(),
    getMedewerkers(),
    getProjecten(),
    getEmailFolders(),
  ])

  return <EmailView initialEmails={emails} initialTotal={total} syncStatus={syncStatus} medewerkers={medewerkers} projecten={projecten} folders={folders} />
}
