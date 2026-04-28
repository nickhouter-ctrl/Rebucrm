'use client'

import Link from 'next/link'
import { useEffect, useState } from 'react'
import { getRelatieTimeline } from '@/lib/actions'
import { formatCurrency, formatDateShort } from '@/lib/utils'
import { Mail, FileText, Receipt, CheckSquare, MessageSquare, Loader2, ArrowDown, ArrowUp } from 'lucide-react'

type TimelineItem = {
  id: string
  type: 'notitie' | 'email' | 'offerte' | 'factuur' | 'taak'
  titel: string
  subtitle?: string
  bedrag?: number
  status?: string
  datum: string
  href?: string
  richting?: string
}

const ICONS = {
  notitie: MessageSquare,
  email: Mail,
  offerte: FileText,
  factuur: Receipt,
  taak: CheckSquare,
}

const COLORS = {
  notitie: 'bg-gray-100 text-gray-600',
  email: 'bg-blue-100 text-blue-600',
  offerte: 'bg-amber-100 text-amber-700',
  factuur: 'bg-green-100 text-green-700',
  taak: 'bg-purple-100 text-purple-700',
}

// Gebundelde tijdlijn van alle contactmomenten met deze klant.
export function RelatieTimeline({ relatieId }: { relatieId: string }) {
  const [items, setItems] = useState<TimelineItem[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    setLoading(true)
    getRelatieTimeline(relatieId, 50)
      .then(setItems)
      .finally(() => setLoading(false))
  }, [relatieId])

  if (loading) {
    return <div className="flex items-center justify-center py-8 text-gray-400 text-sm"><Loader2 className="h-4 w-4 animate-spin mr-2" /> Tijdlijn laden...</div>
  }

  if (items.length === 0) {
    return <div className="text-center py-8 text-gray-400 text-sm">Geen contactmomenten gevonden voor deze klant.</div>
  }

  return (
    <div className="relative pl-6">
      <div className="absolute left-[11px] top-0 bottom-0 w-px bg-gray-200" aria-hidden />
      <div className="space-y-3">
        {items.map(it => {
          const Icon = ICONS[it.type]
          const inner = (
            <div className="bg-white border border-gray-200 rounded-lg p-2.5 hover:border-gray-300 transition-colors">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-wider text-gray-500 mb-0.5">
                    {it.type}
                    {it.type === 'email' && it.richting && (
                      it.richting === 'inkomend'
                        ? <ArrowDown className="h-2.5 w-2.5 text-blue-600" />
                        : <ArrowUp className="h-2.5 w-2.5 text-gray-500" />
                    )}
                    {it.status && (
                      <span className="bg-gray-100 text-gray-700 px-1 rounded text-[10px] normal-case tracking-normal">
                        {it.status}
                      </span>
                    )}
                  </div>
                  <div className="text-sm font-medium text-gray-900 truncate">{it.titel}</div>
                  {it.subtitle && <div className="text-xs text-gray-500 truncate mt-0.5">{it.subtitle}</div>}
                </div>
                <div className="flex flex-col items-end gap-0.5 flex-shrink-0">
                  <span className="text-[10px] text-gray-400">{formatDateShort(it.datum)}</span>
                  {it.bedrag != null && it.bedrag > 0 && (
                    <span className="text-xs font-medium text-gray-900">{formatCurrency(it.bedrag)}</span>
                  )}
                </div>
              </div>
            </div>
          )
          return (
            <div key={`${it.type}-${it.id}`} className="relative">
              <div className={`absolute -left-6 top-2 h-5 w-5 rounded-full flex items-center justify-center ${COLORS[it.type]}`}>
                <Icon className="h-3 w-3" />
              </div>
              {it.href ? <Link href={it.href} className="block">{inner}</Link> : inner}
            </div>
          )
        })}
      </div>
    </div>
  )
}
