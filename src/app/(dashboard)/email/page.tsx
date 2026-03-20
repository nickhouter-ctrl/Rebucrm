import { getEmails, getEmailSyncStatus } from '@/lib/actions'
import { EmailView } from './email-view'

export default async function EmailPage() {
  const [{ emails, total }, syncStatus] = await Promise.all([
    getEmails(),
    getEmailSyncStatus(),
  ])

  return <EmailView initialEmails={emails} initialTotal={total} syncStatus={syncStatus} />
}
