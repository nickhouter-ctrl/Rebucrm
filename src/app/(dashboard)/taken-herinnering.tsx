'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Dialog } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { getMijnTakenVandaag } from '@/lib/actions'
import { formatDateShort } from '@/lib/utils'
import { CheckSquare, ArrowRight, AlertTriangle } from 'lucide-react'

interface HerinnerTaak {
  id: string
  titel: string
  deadline: string | null
  deadline_tijd: string | null
  prioriteit: string
  relatieNaam: string | null
  toegewezenNaam: string | null
}

const STORAGE_KEY = 'taken:herinnering:gezien'

/**
 * Dagelijkse herinner-popup. Toont bij het eerste bezoek van het dashboard op
 * een dag de open taken met een deadline vandaag of eerder (achterstallig),
 * zodat ze echt worden opgevolgd. Per dag één keer — daarna onthoudt
 * localStorage dat je 'm vandaag al hebt gezien.
 */
export function TakenHerinnering() {
  const router = useRouter()
  const [taken, setTaken] = useState<HerinnerTaak[]>([])
  const [open, setOpen] = useState(false)

  useEffect(() => {
    const vandaag = new Date().toISOString().slice(0, 10)
    let gezien: string | null = null
    try { gezien = localStorage.getItem(STORAGE_KEY) } catch { /* ignore */ }
    if (gezien === vandaag) return
    let actief = true
    getMijnTakenVandaag().then(rows => {
      if (!actief || rows.length === 0) return
      setTaken(rows)
      setOpen(true)
    }).catch(() => { /* stil falen — herinnering is niet kritisch */ })
    return () => { actief = false }
  }, [])

  function sluit() {
    const vandaag = new Date().toISOString().slice(0, 10)
    try { localStorage.setItem(STORAGE_KEY, vandaag) } catch { /* ignore */ }
    setOpen(false)
  }

  const vandaagStr = new Date().toISOString().slice(0, 10)
  const achterstallig = taken.filter(t => t.deadline && t.deadline < vandaagStr).length

  return (
    <Dialog
      open={open}
      onClose={sluit}
      title={`${taken.length} ${taken.length === 1 ? 'taak vraagt' : 'taken vragen'} om opvolging vandaag`}
    >
      <div className="space-y-3">
        {achterstallig > 0 && (
          <div className="flex items-center gap-2 rounded-md bg-red-50 border border-red-200 px-3 py-2 text-sm text-red-700">
            <AlertTriangle className="h-4 w-4 flex-shrink-0" />
            {achterstallig} {achterstallig === 1 ? 'taak is' : 'taken zijn'} al over de deadline.
          </div>
        )}
        <ul className="divide-y divide-gray-100 max-h-[50vh] overflow-y-auto -mx-1">
          {taken.map(t => {
            const over = t.deadline && t.deadline < vandaagStr
            return (
              <li key={t.id}>
                <button
                  type="button"
                  onClick={() => { sluit(); router.push(`/taken/${t.id}`) }}
                  className="w-full text-left px-1 py-2.5 hover:bg-gray-50 rounded-md transition-colors flex items-start gap-3"
                >
                  <CheckSquare className="h-4 w-4 text-gray-300 mt-0.5 flex-shrink-0" />
                  <div className="min-w-0 flex-1">
                    <div className="text-sm font-medium text-gray-900 truncate">{t.titel}</div>
                    <div className="text-xs text-gray-500 truncate">
                      {t.relatieNaam || 'Geen relatie'}
                      {t.toegewezenNaam ? <> · {t.toegewezenNaam}</> : null}
                    </div>
                  </div>
                  <span className={`text-xs whitespace-nowrap ${over ? 'text-red-600 font-medium' : 'text-amber-600'}`}>
                    {t.deadline ? formatDateShort(t.deadline) : ''}
                    {t.deadline_tijd ? ` ${String(t.deadline_tijd).slice(0, 5)}` : ''}
                  </span>
                </button>
              </li>
            )
          })}
        </ul>
        <div className="flex items-center justify-between gap-2 pt-2 border-t border-gray-200">
          <Button variant="ghost" onClick={sluit}>Later</Button>
          <Button onClick={() => { sluit(); router.push('/taken') }}>
            Naar takenlijst <ArrowRight className="h-4 w-4" />
          </Button>
        </div>
      </div>
    </Dialog>
  )
}
