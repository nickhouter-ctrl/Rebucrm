import { getPortaalEmails } from '@/lib/portaal-actions'
import { PageHeader } from '@/components/ui/page-header'
import { Card, CardContent } from '@/components/ui/card'
import { formatDateShort } from '@/lib/utils'
import { Mail, Paperclip } from 'lucide-react'
import { EmailList } from './email-list'

export default async function PortaalEmailsPage() {
  const emails = await getPortaalEmails()

  return (
    <div>
      <PageHeader title="E-mails" description="Bekijk alle e-mails die naar u zijn verstuurd." />

      <Card>
        <CardContent className="p-0">
          {emails.length === 0 ? (
            <div className="px-6 py-12 text-center">
              <Mail className="h-10 w-10 text-gray-300 mx-auto mb-3" />
              <p className="text-sm text-gray-500">Geen e-mails gevonden.</p>
            </div>
          ) : (
            <EmailList emails={emails} />
          )}
        </CardContent>
      </Card>
    </div>
  )
}
