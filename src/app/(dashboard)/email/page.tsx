import { getEmails, getEmailSyncStatus, getMedewerkers, getProjecten } from '@/lib/actions'
import { EmailView } from './email-view'

export default async function EmailPage() {
  const [{ emails, total }, syncStatus, medewerkers, projecten] = await Promise.all([
    getEmails(),
    getEmailSyncStatus(),
    getMedewerkers(),
    getProjecten(),
  ])

  return <EmailView initialEmails={emails} initialTotal={total} syncStatus={syncStatus} medewerkers={medewerkers} projecten={projecten} />
}
