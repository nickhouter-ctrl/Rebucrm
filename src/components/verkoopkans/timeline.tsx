'use client'

import { useState } from 'react'
import Link from 'next/link'
import { cn, formatCurrency, formatDateShort } from '@/lib/utils'
import { Badge } from '@/components/ui/badge'
import {
  FileText,
  Mail,
  Receipt,
  CheckSquare,
  MessageSquare,
  Package,
  FolderKanban,
  Calendar,
} from 'lucide-react'
import type { TimelineItem } from '@/lib/actions'

interface TimelineProps {
  items: TimelineItem[]
}

type FilterTab = 'alles' | 'offertes' | 'emails' | 'facturen' | 'taken'

const filterConfig: { key: FilterTab; label: string; types: string[] }[] = [
  { key: 'alles', label: 'Alles', types: [] },
  { key: 'offertes', label: 'Offertes', types: ['offerte_aangemaakt', 'offerte_verzonden', 'offerte_geaccepteerd', 'offerte_afgewezen'] },
  { key: 'emails', label: 'E-mails', types: ['email_verstuurd'] },
  { key: 'facturen', label: 'Facturen', types: ['factuur_aangemaakt', 'factuur_verzonden', 'factuur_betaald'] },
  { key: 'taken', label: 'Taken', types: ['taak', 'afspraak'] },
]

const iconConfig: Record<string, { icon: typeof FileText; color: string }> = {
  offerte_aangemaakt: { icon: FileText, color: 'bg-blue-100 text-blue-600' },
  offerte_verzonden: { icon: FileText, color: 'bg-blue-100 text-blue-600' },
  offerte_geaccepteerd: { icon: FileText, color: 'bg-green-100 text-green-600' },
  offerte_afgewezen: { icon: FileText, color: 'bg-red-100 text-red-600' },
  order_aangemaakt: { icon: Package, color: 'bg-orange-100 text-orange-600' },
  factuur_aangemaakt: { icon: Receipt, color: 'bg-purple-100 text-purple-600' },
  factuur_verzonden: { icon: Receipt, color: 'bg-purple-100 text-purple-600' },
  factuur_betaald: { icon: Receipt, color: 'bg-green-100 text-green-600' },
  email_verstuurd: { icon: Mail, color: 'bg-sky-100 text-sky-600' },
  bericht: { icon: MessageSquare, color: 'bg-gray-100 text-gray-600' },
  taak: { icon: CheckSquare, color: 'bg-yellow-100 text-yellow-600' },
  afspraak: { icon: Calendar, color: 'bg-teal-100 text-teal-600' },
  project_aangemaakt: { icon: FolderKanban, color: 'bg-primary/10 text-primary' },
}

const typeLabels: Record<string, string> = {
  offerte_aangemaakt: 'OFFERTE',
  offerte_verzonden: 'OFFERTE',
  offerte_geaccepteerd: 'OFFERTE',
  offerte_afgewezen: 'OFFERTE',
  order_aangemaakt: 'ORDER',
  factuur_aangemaakt: 'FACTUUR',
  factuur_verzonden: 'FACTUUR',
  factuur_betaald: 'FACTUUR',
  email_verstuurd: 'E-MAIL',
  bericht: 'BERICHT',
  taak: 'TAAK',
  afspraak: 'AFSPRAAK',
  project_aangemaakt: 'PROJECT',
}

export function Timeline({ items }: TimelineProps) {
  const [activeTab, setActiveTab] = useState<FilterTab>('alles')

  const filteredItems = activeTab === 'alles'
    ? items
    : items.filter(item => {
        const config = filterConfig.find(f => f.key === activeTab)
        return config?.types.includes(item.type)
      })

  const counts = filterConfig.reduce<Record<string, number>>((acc, f) => {
    acc[f.key] = f.key === 'alles'
      ? items.length
      : items.filter(item => f.types.includes(item.type)).length
    return acc
  }, {})

  return (
    <div>
      {/* Filter tabs */}
      <div className="flex gap-1 mb-6 flex-wrap">
        {filterConfig.map(f => (
          <button
            key={f.key}
            onClick={() => setActiveTab(f.key)}
            className={cn(
              'px-3 py-1.5 rounded-full text-xs font-medium transition-colors',
              activeTab === f.key
                ? 'bg-primary text-white'
                : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
            )}
          >
            {f.label}
            <span className={cn(
              'ml-1.5 px-1.5 py-0.5 rounded-full text-[10px]',
              activeTab === f.key ? 'bg-white/20' : 'bg-gray-200'
            )}>
              {counts[f.key]}
            </span>
          </button>
        ))}
      </div>

      {/* Timeline */}
      {filteredItems.length === 0 ? (
        <p className="text-sm text-gray-500 text-center py-8">Geen activiteiten gevonden</p>
      ) : (
        <div className="relative">
          {/* Vertical line */}
          <div className="absolute left-5 top-0 bottom-0 w-px bg-gray-200" />

          <div className="space-y-4">
            {filteredItems.map(item => {
              const config = iconConfig[item.type] || iconConfig.project_aangemaakt
              const Icon = config.icon

              const content = (
                <div className="flex items-start gap-3 group">
                  {/* Icon node */}
                  <div className={cn('w-10 h-10 rounded-full flex items-center justify-center shrink-0 relative z-10', config.color)}>
                    <Icon className="h-4 w-4" />
                  </div>

                  {/* Card */}
                  <div className={cn(
                    'flex-1 bg-white border border-gray-200 rounded-lg px-4 py-3 min-w-0',
                    item.link && 'hover:border-gray-300 hover:shadow-sm transition-all cursor-pointer'
                  )}>
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-[10px] font-semibold tracking-wider text-gray-400">
                            {typeLabels[item.type]}
                          </span>
                          {item.status && <Badge status={item.status} />}
                        </div>
                        <p className="text-sm font-medium text-gray-900 mt-0.5 truncate">{item.titel}</p>
                        {item.ondertitel && (
                          <p className="text-xs text-gray-500 mt-0.5 truncate">{item.ondertitel}</p>
                        )}
                      </div>
                      <div className="flex flex-col items-end shrink-0">
                        <span className="text-xs text-gray-400">{formatDateShort(item.datum)}</span>
                        {item.bedrag != null && item.bedrag > 0 && (
                          <span className="text-sm font-medium text-gray-900 mt-0.5">{formatCurrency(item.bedrag)}</span>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              )

              return item.link ? (
                <Link key={item.id} href={item.link} className="block">
                  {content}
                </Link>
              ) : (
                <div key={item.id}>{content}</div>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}
