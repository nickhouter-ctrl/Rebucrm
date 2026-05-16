'use client'

import { useState } from 'react'
import Link from 'next/link'
import { X } from 'lucide-react'
import { formatCurrency } from '@/lib/utils'
import { Badge } from '@/components/ui/badge'

export interface FunnelOfferte {
  id: string
  offertenummer: string
  relatie_naam: string
  project_naam: string | null
  status: string
  totaal: number
  datum: string
}

export interface FunnelData {
  offertes: number
  geaccepteerd: number
  gefactureerd: number
  betaald: number
  lijsten: {
    offertes: FunnelOfferte[]
    geaccepteerd: FunnelOfferte[]
    gefactureerd: FunnelOfferte[]
    betaald: FunnelOfferte[]
  }
}

type StepKey = 'offertes' | 'geaccepteerd' | 'gefactureerd' | 'betaald'

const STAP_LABELS: Record<StepKey, string> = {
  offertes: 'Offertes',
  geaccepteerd: 'Geaccepteerd',
  gefactureerd: 'Gefactureerd',
  betaald: 'Betaald',
}

const STAP_KLEUR: Record<StepKey, string> = {
  offertes: 'bg-violet-500',
  geaccepteerd: 'bg-blue-500',
  gefactureerd: 'bg-orange-500',
  betaald: 'bg-[#00a66e]',
}

export function ConversieFunnelDashboard({ data }: { data: FunnelData }) {
  const [open, setOpen] = useState<StepKey | null>(null)

  const stappen: { key: StepKey; value: number }[] = [
    { key: 'offertes', value: data.offertes },
    { key: 'geaccepteerd', value: data.geaccepteerd },
    { key: 'gefactureerd', value: data.gefactureerd },
    { key: 'betaald', value: data.betaald },
  ]
  const max = Math.max(...stappen.map(s => s.value), 1)
  const eindConversie = data.offertes > 0 ? Math.round((data.betaald / data.offertes) * 100) : 0

  const activeList = open ? data.lijsten[open] : []

  return (
    <div className="bg-white rounded-xl border border-gray-100 shadow-sm px-4 sm:px-5 py-4">
      <div className="flex items-center justify-between mb-3">
        <div>
          <span className="text-[11px] font-semibold text-gray-500 uppercase tracking-wider">Conversie-funnel</span>
          <span className="text-[10px] text-gray-400 ml-2">laatste 12 maanden</span>
        </div>
        <span className="text-[10px] text-gray-400">{data.offertes > 0 ? `${eindConversie}% offerte → betaald` : ''}</span>
      </div>
      <div className="space-y-2">
        {stappen.map((s, i) => {
          const pctVanMax = (s.value / max) * 100
          const pctVanVorige = i === 0 ? 100 : stappen[i - 1].value > 0 ? Math.round((s.value / stappen[i - 1].value) * 100) : 0
          const isClickable = s.value > 0
          return (
            <button
              key={s.key}
              type="button"
              onClick={() => isClickable && setOpen(s.key)}
              disabled={!isClickable}
              className={`w-full flex items-center gap-3 text-left ${isClickable ? 'cursor-pointer hover:opacity-90' : 'cursor-default'} transition-opacity`}
            >
              <div className="w-24 sm:w-28 text-xs text-gray-600 font-medium shrink-0">{STAP_LABELS[s.key]}</div>
              <div className="flex-1 relative h-6 bg-gray-50 rounded-md overflow-hidden">
                <div className={`h-full ${STAP_KLEUR[s.key]} transition-all rounded-md`} style={{ width: `${pctVanMax}%` }} />
                <div className="absolute inset-0 flex items-center px-2 text-[11px] font-semibold text-gray-900">
                  {s.value}
                </div>
              </div>
              <div className="w-12 text-right text-[10px] text-gray-400 shrink-0">
                {i > 0 ? `${pctVanVorige}%` : ''}
              </div>
            </button>
          )
        })}
      </div>

      {/* Detail-paneel */}
      {open && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/40" onClick={() => setOpen(null)}>
          <div
            className="bg-white w-full sm:max-w-2xl sm:rounded-xl shadow-xl max-h-[85vh] flex flex-col"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between px-5 py-3 border-b border-gray-100">
              <div>
                <h3 className="text-sm font-semibold text-gray-900">{STAP_LABELS[open]}</h3>
                <p className="text-xs text-gray-500 mt-0.5">{activeList.length} {activeList.length === 1 ? 'verkoopkans' : 'verkoopkansen'}</p>
              </div>
              <button onClick={() => setOpen(null)} className="text-gray-400 hover:text-gray-600 p-1">
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="flex-1 overflow-y-auto divide-y divide-gray-50">
              {activeList.length === 0 && (
                <div className="px-5 py-8 text-center text-sm text-gray-400">Geen offertes in deze stap</div>
              )}
              {activeList.map(o => (
                <Link
                  key={o.id}
                  href={`/offertes/${o.id}`}
                  className="flex items-center gap-3 px-5 py-3 hover:bg-gray-50 transition-colors"
                  onClick={() => setOpen(null)}
                >
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium text-gray-900 truncate">{o.relatie_naam}</span>
                      <Badge status={o.status} />
                    </div>
                    <div className="flex items-center gap-2 mt-0.5 text-xs text-gray-500">
                      <span className="text-[#00a66e] font-medium">{o.offertenummer}</span>
                      {o.project_naam && <span className="truncate">· {o.project_naam}</span>}
                    </div>
                  </div>
                  <div className="text-sm font-semibold text-gray-900 shrink-0">{formatCurrency(o.totaal)}</div>
                </Link>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
