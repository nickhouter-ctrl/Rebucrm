'use client'

import { useEffect, useState } from 'react'
import { getAuditLog } from '@/lib/actions'
import { Loader2, History } from 'lucide-react'

type AuditEntry = {
  id: string
  actie: string
  user_email: string | null
  details: Record<string, unknown> | null
  created_at: string
}

const ACTIE_LABELS: Record<string, string> = {
  'factuur.email_verzonden': 'Factuur per e-mail verstuurd',
  'factuur.eindafrekening_aanmaken': 'Eindafrekening aangemaakt',
  'offerte.delete': 'Offerte verwijderd',
  'offerte.status_changed': 'Status gewijzigd',
}

function formatDetails(actie: string, details: Record<string, unknown> | null): string {
  if (!details) return ''
  if (actie === 'factuur.email_verzonden') {
    const aan = details.aan as string | undefined
    const totaal = details.totaal as number | undefined
    return [aan && `naar ${aan}`, totaal != null && `€${Number(totaal).toFixed(2)}`].filter(Boolean).join(' · ')
  }
  if (actie === 'factuur.eindafrekening_aanmaken') {
    const t = details.restTotaal as number | undefined
    const offerte = details.offertenummer as string | undefined
    return [offerte && `offerte ${offerte}`, t != null && `rest €${Number(t).toFixed(2)}`].filter(Boolean).join(' · ')
  }
  if (actie === 'offerte.delete') {
    const num = details.offertenummer as string | undefined
    const totaal = details.totaal as number | undefined
    return [num, totaal != null && `€${Number(totaal).toFixed(2)}`].filter(Boolean).join(' · ')
  }
  return ''
}

export function AuditLogTab({ entiteitType, entiteitId }: { entiteitType: string; entiteitId: string }) {
  const [entries, setEntries] = useState<AuditEntry[] | null>(null)

  useEffect(() => {
    let active = true
    getAuditLog(entiteitType, entiteitId).then(data => {
      if (active) setEntries(data as AuditEntry[])
    })
    return () => { active = false }
  }, [entiteitType, entiteitId])

  if (entries === null) {
    return (
      <div className="flex items-center justify-center py-8 text-gray-400 text-sm">
        <Loader2 className="h-4 w-4 animate-spin mr-2" /> Laden…
      </div>
    )
  }
  if (entries.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-10 text-gray-400">
        <History className="h-8 w-8 mb-2" />
        <p className="text-sm">Nog geen wijzigingen geregistreerd.</p>
      </div>
    )
  }

  return (
    <div className="divide-y divide-gray-100 border border-gray-200 rounded-lg overflow-hidden">
      {entries.map(e => {
        const datum = new Date(e.created_at)
        const datumStr = datum.toLocaleDateString('nl-NL', { day: '2-digit', month: 'short', year: 'numeric' })
        const tijdStr = datum.toLocaleTimeString('nl-NL', { hour: '2-digit', minute: '2-digit' })
        return (
          <div key={e.id} className="p-3 flex items-start gap-3 text-sm">
            <div className="w-2 h-2 rounded-full bg-[#00a66e] mt-1.5 flex-shrink-0" />
            <div className="flex-1 min-w-0">
              <div className="flex items-baseline justify-between gap-2 flex-wrap">
                <span className="font-medium text-gray-900">{ACTIE_LABELS[e.actie] || e.actie}</span>
                <span className="text-xs text-gray-400">{datumStr} · {tijdStr}</span>
              </div>
              <div className="text-xs text-gray-500 mt-0.5">
                {e.user_email && <span>{e.user_email}</span>}
                {e.user_email && formatDetails(e.actie, e.details) && <span className="mx-1.5">·</span>}
                {formatDetails(e.actie, e.details)}
              </div>
            </div>
          </div>
        )
      })}
    </div>
  )
}
