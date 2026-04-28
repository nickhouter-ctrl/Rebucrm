import { Check } from 'lucide-react'

interface Order {
  id: string
  ordernummer: string
  status: string
  leverdatum?: string | null
  betaald?: boolean
}

const FASES = [
  { key: 'offerte_akkoord', label: 'Offerte akkoord' },
  { key: 'in_productie',    label: 'In productie' },
  { key: 'gereed',          label: 'Klaar voor levering' },
  { key: 'geleverd',        label: 'Geleverd' },
  { key: 'betaald',         label: 'Betaald' },
] as const

function bepaalActieveFase(order: Order): number {
  if (order.betaald) return 4 // alles afgerond
  if (order.status === 'afgerond' || order.status === 'geleverd') return 3
  if (order.status === 'gereed') return 2
  if (order.status === 'in_behandeling') return 1
  return 0 // alleen akkoord
}

// Visuele status-tracker voor 1 order — toont voortgang als horizontale stappen.
export function OrderStatusTracker({ order }: { order: Order }) {
  const actief = bepaalActieveFase(order)

  return (
    <div className="bg-white border border-gray-200 rounded-lg p-3 sm:p-4">
      <div className="flex items-center justify-between mb-3">
        <div>
          <p className="text-sm font-semibold text-gray-900">Order {order.ordernummer}</p>
          {order.leverdatum && (
            <p className="text-xs text-gray-500">Geplande levering: {new Date(order.leverdatum).toLocaleDateString('nl-NL', { day: '2-digit', month: 'long', year: 'numeric' })}</p>
          )}
        </div>
        <span className="text-[10px] text-gray-400 uppercase tracking-wider">{Math.round(((actief + 1) / FASES.length) * 100)}%</span>
      </div>
      <div className="flex items-center">
        {FASES.map((fase, i) => {
          const isDone = i <= actief
          const isCurrent = i === actief && !order.betaald
          return (
            <div key={fase.key} className="flex-1 flex flex-col items-center relative">
              {i > 0 && (
                <div className={`absolute right-1/2 top-3 h-0.5 w-full -z-0 ${i <= actief ? 'bg-green-400' : 'bg-gray-200'}`} aria-hidden />
              )}
              <div className={`relative z-10 h-6 w-6 rounded-full flex items-center justify-center text-[10px] font-medium transition-colors ${
                isDone ? 'bg-green-500 text-white'
                : isCurrent ? 'bg-blue-500 text-white animate-pulse'
                : 'bg-gray-200 text-gray-400'
              }`}>
                {isDone ? <Check className="h-3 w-3" /> : i + 1}
              </div>
              <span className={`mt-1.5 text-[10px] text-center ${isDone || isCurrent ? 'text-gray-900 font-medium' : 'text-gray-400'} hidden sm:block`}>
                {fase.label}
              </span>
            </div>
          )
        })}
      </div>
      <div className="sm:hidden mt-2 text-center text-xs text-gray-700">
        {FASES[actief]?.label || FASES[FASES.length - 1].label}
      </div>
    </div>
  )
}
