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
  Pencil,
  Trash2,
  Check,
  X,
} from 'lucide-react'
import type { TimelineItem } from '@/lib/actions'

interface TimelineProps {
  items: TimelineItem[]
  onEmailClick?: (emailLogId: string) => void
  onEdit?: (item: TimelineItem) => void
  onDelete?: (item: TimelineItem) => void
  // Voor inline-rename: alleen voor items waarvoor dit zinvol is (offertes)
  onInlineRename?: (item: TimelineItem, nieuweTitel: string) => Promise<{ error?: string }>
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

export function Timeline({ items, onEmailClick, onEdit, onDelete, onInlineRename }: TimelineProps) {
  const [activeTab, setActiveTab] = useState<FilterTab>('alles')
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editingTitel, setEditingTitel] = useState('')
  const [editSaving, setEditSaving] = useState(false)

  function startInlineEdit(item: TimelineItem) {
    setEditingId(item.id)
    setEditingTitel(item.titel)
  }
  function cancelInlineEdit() {
    setEditingId(null)
    setEditingTitel('')
  }
  async function saveInlineEdit(item: TimelineItem) {
    if (!onInlineRename) return
    setEditSaving(true)
    const result = await onInlineRename(item, editingTitel)
    setEditSaving(false)
    if (!result.error) cancelInlineEdit()
  }

  // Types die edit/delete krijgen (niet project_aangemaakt, dat is het
  // verkoopkans-item zelf).
  const SUPPORTS_ACTIONS = new Set([
    'offerte_aangemaakt', 'offerte_verzonden', 'offerte_geaccepteerd', 'offerte_afgewezen',
    'factuur_aangemaakt', 'factuur_verzonden', 'factuur_betaald',
    'taak', 'email_verstuurd', 'order_aangemaakt',
  ])
  const SUPPORTS_RENAME = new Set([
    'offerte_aangemaakt', 'offerte_verzonden', 'offerte_geaccepteerd', 'offerte_afgewezen',
  ])

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

              const isClickableEmail = item.type === 'email_verstuurd' && onEmailClick && item.meta?.emailLogId
              const showActions = SUPPORTS_ACTIONS.has(item.type) && (onEdit || onDelete || onInlineRename)
              const supportsInlineRename = SUPPORTS_RENAME.has(item.type) && onInlineRename
              const isEditing = editingId === item.id

              function onCardClick() {
                if (isEditing) return
                if (item.link) { window.location.href = item.link; return }
                if (isClickableEmail) onEmailClick!(item.meta!.emailLogId as string)
              }

              return (
                <div key={item.id} className="flex items-start gap-3 group">
                  <div className={cn('w-10 h-10 rounded-full flex items-center justify-center shrink-0 relative z-10', config.color)}>
                    <Icon className="h-4 w-4" />
                  </div>

                  <div
                    className={cn(
                      'flex-1 bg-white border border-gray-200 rounded-lg px-4 py-3 min-w-0',
                      (item.link || isClickableEmail) && !isEditing && 'hover:border-gray-300 hover:shadow-sm transition-all cursor-pointer'
                    )}
                    onClick={onCardClick}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-[10px] font-semibold tracking-wider text-gray-400">
                            {typeLabels[item.type]}
                          </span>
                          {item.status && <Badge status={item.status} />}
                        </div>
                        {isEditing ? (
                          <div className="flex items-center gap-2 mt-1" onClick={e => e.stopPropagation()}>
                            <input
                              autoFocus
                              value={editingTitel}
                              onChange={e => setEditingTitel(e.target.value)}
                              onKeyDown={e => {
                                if (e.key === 'Enter') saveInlineEdit(item)
                                if (e.key === 'Escape') cancelInlineEdit()
                              }}
                              className="flex-1 px-2 py-1 border border-gray-300 rounded text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                            />
                            <button type="button" onClick={() => saveInlineEdit(item)} disabled={editSaving} className="p-1 text-[#00a66e] hover:bg-emerald-50 rounded" title="Opslaan">
                              <Check className="h-4 w-4" />
                            </button>
                            <button type="button" onClick={cancelInlineEdit} className="p-1 text-gray-400 hover:bg-gray-100 rounded" title="Annuleren">
                              <X className="h-4 w-4" />
                            </button>
                          </div>
                        ) : (
                          <>
                            <p className="text-sm font-medium text-gray-900 mt-0.5 truncate">{item.titel}</p>
                            {item.ondertitel && (
                              <p className="text-xs text-gray-500 mt-0.5 truncate">{item.ondertitel}</p>
                            )}
                          </>
                        )}
                      </div>
                      <div className="flex items-start gap-2 shrink-0" onClick={e => e.stopPropagation()}>
                        {showActions && !isEditing && (
                          <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                            {supportsInlineRename && (
                              <button
                                type="button"
                                onClick={() => startInlineEdit(item)}
                                className="p-1.5 text-gray-400 hover:text-[#00a66e] hover:bg-emerald-50 rounded"
                                title="Naam aanpassen"
                              >
                                <Pencil className="h-3.5 w-3.5" />
                              </button>
                            )}
                            {!supportsInlineRename && onEdit && (
                              <button
                                type="button"
                                onClick={() => onEdit(item)}
                                className="p-1.5 text-gray-400 hover:text-[#00a66e] hover:bg-emerald-50 rounded"
                                title="Bewerken"
                              >
                                <Pencil className="h-3.5 w-3.5" />
                              </button>
                            )}
                            {onDelete && (
                              <button
                                type="button"
                                onClick={() => onDelete(item)}
                                className="p-1.5 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded"
                                title="Verwijderen"
                              >
                                <Trash2 className="h-3.5 w-3.5" />
                              </button>
                            )}
                          </div>
                        )}
                        <div className="flex flex-col items-end">
                          <span className="text-xs text-gray-400">{formatDateShort(item.datum)}</span>
                          {item.bedrag != null && item.bedrag > 0 && (
                            <span className="text-sm font-medium text-gray-900 mt-0.5">{formatCurrency(item.bedrag)}</span>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}
