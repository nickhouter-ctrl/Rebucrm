'use client'

import { useEffect, useState } from 'react'
import { getMaandOmzetAnalytics } from '@/lib/actions'
import { formatCurrency } from '@/lib/utils'
import { Loader2 } from 'lucide-react'

interface MaandData {
  maand: string
  offertes: number
  facturen: number
  betaald: number
}

const MAAND_NAMEN = ['Jan', 'Feb', 'Mrt', 'Apr', 'Mei', 'Jun', 'Jul', 'Aug', 'Sep', 'Okt', 'Nov', 'Dec']

// Eenvoudige bar chart voor maand-omzet — geen externe library, pure SVG.
// Toont 3 series per maand: verzonden offertes, gefactureerd, betaald.
export function OmzetChart() {
  const [data, setData] = useState<MaandData[]>([])
  const [loading, setLoading] = useState(true)
  const [hoverIdx, setHoverIdx] = useState<number | null>(null)

  useEffect(() => {
    getMaandOmzetAnalytics()
      .then(r => {
        console.log('[OmzetChart] response:', r)
        setData(r.maanden || [])
        setLoading(false)
      })
      .catch(err => {
        console.error('[OmzetChart] fetch error:', err)
        setLoading(false)
      })
  }, [])

  if (loading) {
    return (
      <div className="bg-white border border-gray-200 rounded-lg p-4 h-64 flex items-center justify-center text-gray-400">
        <Loader2 className="h-5 w-5 animate-spin mr-2" />
        Omzet laden...
      </div>
    )
  }

  const maxValue = Math.max(...data.map(d => Math.max(d.offertes, d.facturen, d.betaald)), 1)
  const totaalBetaald = data.reduce((s, d) => s + d.betaald, 0)
  const totaalGefactureerd = data.reduce((s, d) => s + d.facturen, 0)

  return (
    <div className="bg-white border border-gray-200 rounded-lg p-4">
      <div className="flex items-start justify-between mb-3 flex-wrap gap-2">
        <div>
          <h3 className="font-semibold text-gray-900 text-sm">Omzet per maand</h3>
          <p className="text-xs text-gray-500">Laatste 12 maanden</p>
        </div>
        <div className="flex items-center gap-3 text-[11px]">
          <Legend kleur="bg-blue-400" label="Verzonden offertes" />
          <Legend kleur="bg-amber-400" label="Gefactureerd" />
          <Legend kleur="bg-green-500" label="Betaald" />
        </div>
      </div>

      <div className="relative h-48">
        <div className="absolute inset-0 flex items-end gap-1.5 pb-6">
          {data.map((d, i) => {
            const offerteH = (d.offertes / maxValue) * 100
            const factuurH = (d.facturen / maxValue) * 100
            const betaaldH = (d.betaald / maxValue) * 100
            const isHover = hoverIdx === i
            return (
              <div
                key={d.maand}
                className="flex-1 flex flex-col items-center group cursor-pointer relative"
                onMouseEnter={() => setHoverIdx(i)}
                onMouseLeave={() => setHoverIdx(null)}
              >
                {isHover && (
                  <div className="absolute bottom-full mb-2 left-1/2 -translate-x-1/2 z-10 bg-gray-900 text-white text-xs rounded-md px-2 py-1.5 whitespace-nowrap shadow-lg">
                    <div className="font-medium">{maandLabel(d.maand)}</div>
                    <div>Offertes: {formatCurrency(d.offertes)}</div>
                    <div>Gefactureerd: {formatCurrency(d.facturen)}</div>
                    <div>Betaald: {formatCurrency(d.betaald)}</div>
                  </div>
                )}
                <div className="flex-1 w-full flex items-end gap-0.5 px-0.5">
                  <div className="flex-1 bg-blue-400 rounded-t" style={{ height: `${offerteH}%`, minHeight: d.offertes > 0 ? 2 : 0 }} />
                  <div className="flex-1 bg-amber-400 rounded-t" style={{ height: `${factuurH}%`, minHeight: d.facturen > 0 ? 2 : 0 }} />
                  <div className="flex-1 bg-green-500 rounded-t" style={{ height: `${betaaldH}%`, minHeight: d.betaald > 0 ? 2 : 0 }} />
                </div>
              </div>
            )
          })}
        </div>
        <div className="absolute bottom-0 inset-x-0 flex gap-1.5 px-0.5">
          {data.map((d) => (
            <div key={d.maand} className="flex-1 text-center text-[10px] text-gray-500">{maandLabel(d.maand, true)}</div>
          ))}
        </div>
      </div>

      <div className="mt-3 pt-2 border-t border-gray-100 grid grid-cols-2 gap-2 text-xs">
        <div className="text-gray-600">
          Totaal gefactureerd: <strong className="text-gray-900">{formatCurrency(totaalGefactureerd)}</strong>
        </div>
        <div className="text-gray-600 text-right">
          Totaal betaald: <strong className="text-green-700">{formatCurrency(totaalBetaald)}</strong>
        </div>
      </div>
    </div>
  )
}

function Legend({ kleur, label }: { kleur: string; label: string }) {
  return (
    <div className="flex items-center gap-1">
      <span className={`inline-block w-2.5 h-2.5 rounded-sm ${kleur}`} />
      <span className="text-gray-600">{label}</span>
    </div>
  )
}

function maandLabel(yyyymm: string, kort = false): string {
  const [jaar, m] = yyyymm.split('-')
  const idx = parseInt(m) - 1
  if (kort) return MAAND_NAMEN[idx] || yyyymm
  return `${MAAND_NAMEN[idx]} ${jaar}`
}
