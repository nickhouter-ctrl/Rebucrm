'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { getMijnTakenVandaag } from '@/lib/actions'
import { formatDateShort } from '@/lib/utils'
import { CheckSquare, ArrowRight, AlertTriangle, ChevronDown, ChevronUp } from 'lucide-react'

interface HerinnerTaak {
  id: string
  titel: string
  deadline: string | null
  deadline_tijd: string | null
  prioriteit: string
  relatieNaam: string | null
  toegewezenNaam: string | null
}

/**
 * Taken-overzicht bovenaan het dashboard (géén popup meer). Toont de open taken
 * met een deadline vandaag of eerder (achterstallig), zodat je ze meteen op het
 * hoofdscherm ziet en kunt opvolgen. Verschijnt alleen als er zulke taken zijn.
 */
export function TakenHerinnering() {
  const router = useRouter()
  const [taken, setTaken] = useState<HerinnerTaak[]>([])
  const [open, setOpen] = useState(true)

  useEffect(() => {
    let actief = true
    getMijnTakenVandaag()
      .then(rows => { if (actief) setTaken(rows) })
      .catch(() => { /* stil falen — herinnering is niet kritisch */ })
    return () => { actief = false }
  }, [])

  if (taken.length === 0) return null

  const vandaagStr = new Date().toISOString().slice(0, 10)
  const achterstallig = taken.filter(t => t.deadline && t.deadline < vandaagStr).length
  const vandaag = taken.length - achterstallig

  return (
    <div className="mb-6 rounded-xl border border-amber-200 bg-amber-50/60 overflow-hidden">
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        className="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-amber-50 transition-colors"
      >
        <CheckSquare className="h-5 w-5 text-amber-600 flex-shrink-0" />
        <div className="flex-1 min-w-0">
          <div className="text-sm font-semibold text-gray-900">
            {taken.length} {taken.length === 1 ? 'taak vraagt' : 'taken vragen'} om opvolging
          </div>
          <div className="text-xs text-gray-600 mt-0.5 flex flex-wrap gap-x-3">
            {achterstallig > 0 && (
              <span className="inline-flex items-center gap-1 text-red-700 font-medium">
                <AlertTriangle className="h-3.5 w-3.5" />
                {achterstallig} achterstallig
              </span>
            )}
            {vandaag > 0 && <span className="text-amber-700">{vandaag} voor vandaag</span>}
          </div>
        </div>
        {open ? <ChevronUp className="h-4 w-4 text-gray-400" /> : <ChevronDown className="h-4 w-4 text-gray-400" />}
      </button>

      {open && (
        <div className="px-4 pb-3">
          <ul className="divide-y divide-amber-100 max-h-[40vh] overflow-y-auto rounded-lg bg-white border border-amber-100">
            {taken.map(t => {
              const over = t.deadline && t.deadline < vandaagStr
              return (
                <li key={t.id}>
                  <button
                    type="button"
                    onClick={() => router.push(`/taken/${t.id}`)}
                    className="w-full text-left px-3 py-2.5 hover:bg-gray-50 transition-colors flex items-start gap-3"
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
          <div className="flex justify-end pt-2">
            <Button variant="ghost" size="sm" onClick={() => router.push('/taken')}>
              Naar takenlijst <ArrowRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
      )}
    </div>
  )
}
