'use client'

import { useEffect, useState } from 'react'
import { Dialog } from '@/components/ui/dialog'
import { getOfferteConversieDitJaar } from '@/lib/actions'
import { Loader2 } from 'lucide-react'

interface MaandData {
  maand: string
  verstuurdAantal: number
  geaccepteerdAantal: number
}

interface ConversieData {
  jaar: number
  verstuurdAantal: number
  geaccepteerdAantal: number
  conversie: number
  maanden: MaandData[]
}

const MAAND_NAMEN = ['Jan', 'Feb', 'Mrt', 'Apr', 'Mei', 'Jun', 'Jul', 'Aug', 'Sep', 'Okt', 'Nov', 'Dec']

function maandLabel(maand: string): string {
  const [jaar, mnd] = maand.split('-')
  return `${MAAND_NAMEN[parseInt(mnd) - 1]} ${jaar}`
}

// Toont per maand van het HUIDIGE jaar: hoeveel offertes verstuurd, hoeveel
// daarvan zijn doorgegaan (geaccepteerd) en de conversiegraad. Data uit
// getOfferteConversieDitJaar — per losse offerte (groep_id) geteld. Zelfde bron
// als de dashboard-kop, dus het totaal hieronder is gelijk aan het kop-getal.
export function ConversiePerMaandDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [data, setData] = useState<ConversieData | null>(null)
  const [loading, setLoading] = useState(true)
  const [fetched, setFetched] = useState(false)

  // Eén keer ophalen bij eerste opening; daarna gecached. Alle setState-calls
  // staan in async callbacks (niet synchroon in de effect-body) zodat we geen
  // cascading renders triggeren.
  useEffect(() => {
    if (!open || fetched) return
    getOfferteConversieDitJaar()
      .then(r => setData(r as ConversieData))
      .catch(() => setData(null))
      .finally(() => { setLoading(false); setFetched(true) })
  }, [open, fetched])

  // Nieuwste maand bovenaan
  const rijen = data ? [...data.maanden].reverse() : []
  const totVerstuurd = data?.verstuurdAantal ?? 0
  const totDoorgegaan = data?.geaccepteerdAantal ?? 0
  const totConversie = data?.conversie ?? 0

  return (
    <Dialog open={open} onClose={onClose} title={`Conversie ${data?.jaar ?? ''}`} className="max-w-2xl">
      {loading ? (
        <div className="flex items-center justify-center py-12 text-gray-400">
          <Loader2 className="h-5 w-5 animate-spin mr-2" />
          Laden...
        </div>
      ) : (
        <div>
          {/* Samenvatting huidig jaar */}
          <div className="grid grid-cols-3 gap-3 mb-4">
            <div className="bg-violet-50 rounded-lg p-3">
              <p className="text-xs text-violet-600 font-medium uppercase tracking-wider">Verstuurd</p>
              <p className="text-2xl font-bold text-gray-900 mt-1">{totVerstuurd}</p>
            </div>
            <div className="bg-blue-50 rounded-lg p-3">
              <p className="text-xs text-blue-600 font-medium uppercase tracking-wider">Doorgegaan</p>
              <p className="text-2xl font-bold text-gray-900 mt-1">{totDoorgegaan}</p>
            </div>
            <div className="bg-emerald-50 rounded-lg p-3">
              <p className="text-xs text-emerald-600 font-medium uppercase tracking-wider">Conversie</p>
              <p className="text-2xl font-bold text-gray-900 mt-1">{totConversie}%</p>
            </div>
          </div>
          <p className="text-xs text-gray-400 mb-3">Huidig jaar · per losse offerte geteld</p>

          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-200 text-left text-xs text-gray-500 uppercase tracking-wider">
                  <th className="py-2 pr-3 font-medium">Maand</th>
                  <th className="py-2 px-3 font-medium text-right">Verstuurd</th>
                  <th className="py-2 px-3 font-medium text-right">Doorgegaan</th>
                  <th className="py-2 pl-3 font-medium text-right">Conversie</th>
                </tr>
              </thead>
              <tbody>
                {rijen.map(m => {
                  const conv = m.verstuurdAantal > 0
                    ? Math.round((m.geaccepteerdAantal / m.verstuurdAantal) * 100)
                    : 0
                  const leeg = m.verstuurdAantal === 0
                  return (
                    <tr key={m.maand} className="border-b border-gray-100 last:border-0">
                      <td className="py-2 pr-3 font-medium text-gray-900">{maandLabel(m.maand)}</td>
                      <td className="py-2 px-3 text-right text-gray-700">{m.verstuurdAantal}</td>
                      <td className="py-2 px-3 text-right text-gray-700">{m.geaccepteerdAantal}</td>
                      <td className="py-2 pl-3 text-right">
                        {leeg ? (
                          <span className="text-gray-300">—</span>
                        ) : (
                          <span className={`font-semibold ${conv >= 50 ? 'text-emerald-600' : conv >= 25 ? 'text-amber-600' : 'text-gray-500'}`}>
                            {conv}%
                          </span>
                        )}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </Dialog>
  )
}
