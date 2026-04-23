'use client'

import { useState, useEffect } from 'react'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { PageHeader } from '@/components/ui/page-header'
import { ChevronLeft, ChevronRight, ArrowLeft } from 'lucide-react'
import { getMedewerkerPlanning } from '@/lib/actions'
import Link from 'next/link'

interface Medewerker {
  id: string
  naam: string
  kleur: string | null
  functie: string | null
}

interface PlanningItem {
  id: string
  gepland_van: string | null
  gepland_tot: string | null
  geschatte_uren: number | null
  medewerker: { id: string; naam: string; kleur: string | null; functie: string | null } | null
  order: { id: string; ordernummer: string; onderwerp: string | null; relatie: { bedrijfsnaam: string } | null } | null
}

function getWeekDays(weekOffset: number): Date[] {
  const today = new Date()
  const monday = new Date(today)
  monday.setDate(today.getDate() - today.getDay() + 1 + weekOffset * 7)
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(monday)
    d.setDate(monday.getDate() + i)
    return d
  })
}

function formatDate(d: Date): string {
  return d.toISOString().split('T')[0]
}

function formatDayLabel(d: Date): string {
  const days = ['Zo', 'Ma', 'Di', 'Wo', 'Do', 'Vr', 'Za']
  return `${days[d.getDay()]} ${d.getDate()}/${d.getMonth() + 1}`
}

function isDateInRange(date: string, van: string | null, tot: string | null): boolean {
  if (!van && !tot) return false
  if (van && date < van) return false
  if (tot && date > tot) return false
  return true
}

export function PlanningView({ medewerkers }: { medewerkers: Medewerker[] }) {
  const [weekOffset, setWeekOffset] = useState(0)
  const [planning, setPlanning] = useState<PlanningItem[]>([])
  const [loading, setLoading] = useState(true)

  const days = getWeekDays(weekOffset)
  const startDatum = formatDate(days[0])
  const eindDatum = formatDate(days[6])

  useEffect(() => {
    setLoading(true)
    getMedewerkerPlanning(startDatum, eindDatum).then(data => {
      setPlanning(data as PlanningItem[])
      setLoading(false)
    })
  }, [startDatum, eindDatum])

  const weekLabel = (() => {
    const start = days[0]
    const end = days[6]
    const maanden = ['jan', 'feb', 'mrt', 'apr', 'mei', 'jun', 'jul', 'aug', 'sep', 'okt', 'nov', 'dec']
    return `${start.getDate()} ${maanden[start.getMonth()]} — ${end.getDate()} ${maanden[end.getMonth()]} ${end.getFullYear()}`
  })()

  return (
    <div>
      <PageHeader
        title="Planning"
        description="Weekoverzicht medewerkers"
        actions={
          <Button variant="secondary" size="sm" onClick={() => window.history.back()}>
            <ArrowLeft className="h-4 w-4 mr-1" />
            Terug
          </Button>
        }
      />

      {/* Week navigatie */}
      <div className="flex items-center justify-between mb-4">
        <Button variant="secondary" size="sm" onClick={() => setWeekOffset(w => w - 1)}>
          <ChevronLeft className="h-4 w-4" />
          Vorige week
        </Button>
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium text-gray-700">{weekLabel}</span>
          {weekOffset !== 0 && (
            <Button variant="ghost" size="sm" onClick={() => setWeekOffset(0)}>
              Vandaag
            </Button>
          )}
        </div>
        <Button variant="secondary" size="sm" onClick={() => setWeekOffset(w => w + 1)}>
          Volgende week
          <ChevronRight className="h-4 w-4" />
        </Button>
      </div>

      <Card>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-gray-200 bg-gray-50">
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase w-48">
                    Medewerker
                  </th>
                  {days.map(day => {
                    const isToday = formatDate(day) === formatDate(new Date())
                    const isWeekend = day.getDay() === 0 || day.getDay() === 6
                    return (
                      <th
                        key={formatDate(day)}
                        className={`px-2 py-3 text-center text-xs font-medium uppercase min-w-[120px] ${
                          isToday ? 'bg-blue-50 text-blue-700' : isWeekend ? 'bg-gray-100 text-gray-400' : 'text-gray-500'
                        }`}
                      >
                        {formatDayLabel(day)}
                      </th>
                    )
                  })}
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr>
                    <td colSpan={8} className="text-center py-12 text-sm text-gray-400">
                      Laden...
                    </td>
                  </tr>
                ) : medewerkers.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="text-center py-12 text-sm text-gray-400">
                      Geen actieve medewerkers
                    </td>
                  </tr>
                ) : (
                  medewerkers.map(med => {
                    const medPlanning = planning.filter(p => p.medewerker?.id === med.id)
                    return (
                      <tr key={med.id} className="border-b border-gray-100 hover:bg-gray-50/50">
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-2">
                            <div className="w-3 h-3 rounded-full flex-shrink-0" style={{ backgroundColor: med.kleur || '#3b82f6' }} />
                            <div>
                              <p className="text-sm font-medium">{med.naam}</p>
                              {med.functie && <p className="text-xs text-gray-400">{med.functie}</p>}
                            </div>
                          </div>
                        </td>
                        {days.map(day => {
                          const dateStr = formatDate(day)
                          const isWeekend = day.getDay() === 0 || day.getDay() === 6
                          const isToday = dateStr === formatDate(new Date())
                          const dayItems = medPlanning.filter(p =>
                            isDateInRange(dateStr, p.gepland_van, p.gepland_tot)
                          )
                          return (
                            <td
                              key={dateStr}
                              className={`px-1 py-2 align-top ${isToday ? 'bg-blue-50/50' : isWeekend ? 'bg-gray-50' : ''}`}
                            >
                              {dayItems.map(item => (
                                <Link
                                  key={item.id}
                                  href={`/offertes/orders/${item.order?.id}`}
                                  className="block mb-1"
                                >
                                  <div
                                    className="rounded px-2 py-1 text-xs text-white truncate hover:opacity-80 transition-opacity"
                                    style={{ backgroundColor: med.kleur || '#3b82f6' }}
                                    title={`${item.order?.ordernummer} - ${item.order?.onderwerp || (item.order?.relatie as { bedrijfsnaam: string } | null)?.bedrijfsnaam || ''}`}
                                  >
                                    {item.order?.ordernummer}
                                  </div>
                                </Link>
                              ))}
                            </td>
                          )
                        })}
                      </tr>
                    )
                  })
                )}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
