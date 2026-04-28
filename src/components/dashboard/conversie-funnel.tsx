'use client'

import { useEffect, useState } from 'react'
import { getConversieFunnel } from '@/lib/actions'
import { formatCurrency } from '@/lib/utils'
import { Loader2 } from 'lucide-react'

interface Stap {
  label: string
  aantal: number
  bedrag: number
  conversie_pct: number
}

// Visuele conversie-funnel: van Verkoopkansen → Offertes → Akkoord → Gefactureerd → Betaald.
// Pure CSS, geen externe library.
export function ConversieFunnel() {
  const [stappen, setStappen] = useState<Stap[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    getConversieFunnel().then(r => {
      if (r) setStappen(r.stappen)
      setLoading(false)
    }).catch(() => setLoading(false))
  }, [])

  if (loading) {
    return (
      <div className="bg-white border border-gray-200 rounded-lg p-4 h-40 flex items-center justify-center text-gray-400">
        <Loader2 className="h-5 w-5 animate-spin mr-2" />
        Funnel laden...
      </div>
    )
  }

  const maxAantal = Math.max(...stappen.map(s => s.aantal), 1)

  return (
    <div className="bg-white border border-gray-200 rounded-lg p-4">
      <div className="mb-3">
        <h3 className="font-semibold text-gray-900 text-sm">Conversie-funnel</h3>
        <p className="text-xs text-gray-500">
          Van eerste contact tot betaald — bulk-import april gefilterd
        </p>
      </div>

      <div className="space-y-2">
        {stappen.map((s, i) => {
          const breedte = (s.aantal / maxAantal) * 100
          return (
            <div key={s.label} className="relative">
              <div className="flex items-center gap-3">
                <div className="w-32 flex-shrink-0 text-xs text-gray-700 font-medium">
                  {s.label}
                </div>
                <div className="flex-1 relative h-9 bg-gray-100 rounded">
                  <div
                    className="absolute inset-y-0 left-0 rounded bg-gradient-to-r from-blue-500 to-blue-400 flex items-center justify-end pr-2 text-white text-xs font-medium"
                    style={{ width: `${Math.max(breedte, 5)}%`, opacity: 1 - i * 0.12 }}
                  >
                    {s.aantal > 0 && <span>{s.aantal}</span>}
                  </div>
                </div>
                <div className="w-32 flex-shrink-0 text-xs text-right">
                  {s.bedrag > 0 && <span className="text-gray-700">{formatCurrency(s.bedrag)}</span>}
                </div>
                <div className="w-16 flex-shrink-0 text-right">
                  {i > 0 && (
                    <span className={`text-xs font-medium ${s.conversie_pct >= 50 ? 'text-green-700' : s.conversie_pct >= 20 ? 'text-amber-600' : 'text-red-600'}`}>
                      {s.conversie_pct}%
                    </span>
                  )}
                </div>
              </div>
            </div>
          )
        })}
      </div>

      <div className="mt-3 pt-2 border-t border-gray-100 text-[11px] text-gray-500">
        Conversie-% is t.o.v. de vorige stap. Lees: van X% van de verkoopkansen wordt een offerte gemaakt, daarvan wordt Y% geaccepteerd, etc.
      </div>
    </div>
  )
}
