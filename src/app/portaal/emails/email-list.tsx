'use client'

import { useState } from 'react'
import { formatDateShort } from '@/lib/utils'
import { ChevronDown, ChevronRight, Paperclip } from 'lucide-react'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function EmailList({ emails }: { emails: any[] }) {
  const [expandedId, setExpandedId] = useState<string | null>(null)

  function toggle(id: string) {
    setExpandedId(expandedId === id ? null : id)
  }

  return (
    <div className="divide-y divide-gray-100">
      {emails.map((email) => {
        const isExpanded = expandedId === email.id
        const bijlagenCount = email.bijlagen?.length || 0

        return (
          <div key={email.id}>
            <button
              onClick={() => toggle(email.id)}
              className="w-full flex items-center gap-4 px-6 py-3 hover:bg-gray-50 transition-colors text-left"
            >
              <div className="flex-shrink-0 text-gray-400">
                {isExpanded ? (
                  <ChevronDown className="h-4 w-4" />
                ) : (
                  <ChevronRight className="h-4 w-4" />
                )}
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium text-gray-900 truncate">
                  {email.onderwerp || '(Geen onderwerp)'}
                </p>
                <p className="text-xs text-gray-500">
                  {email.verstuurd_op ? formatDateShort(email.verstuurd_op) : '-'}
                </p>
              </div>
              {bijlagenCount > 0 && (
                <div className="flex items-center gap-1 text-xs text-gray-400 flex-shrink-0">
                  <Paperclip className="h-3 w-3" />
                  {bijlagenCount}
                </div>
              )}
            </button>

            {isExpanded && (
              <div className="px-6 pb-4 pl-14">
                {email.body_html ? (
                  <div
                    className="text-sm text-gray-700 prose prose-sm max-w-none border border-gray-100 rounded-md p-4 bg-gray-50"
                    dangerouslySetInnerHTML={{ __html: email.body_html }}
                  />
                ) : (
                  <p className="text-sm text-gray-400 italic">Geen inhoud beschikbaar.</p>
                )}
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}
