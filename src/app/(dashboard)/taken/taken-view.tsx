'use client'

import { useState, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import { type ColumnDef } from '@tanstack/react-table'
import { DataTable } from '@/components/ui/data-table'
import { PageHeader } from '@/components/ui/page-header'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { EmptyState } from '@/components/ui/empty-state'
import { formatDateShort } from '@/lib/utils'
import { Plus, CheckSquare, CalendarDays, List, ChevronLeft, ChevronRight, Truck } from 'lucide-react'
import {
  startOfMonth, endOfMonth, startOfWeek, endOfWeek,
  addMonths, subMonths, eachDayOfInterval, format, isSameMonth, isSameDay, isToday,
} from 'date-fns'
import { nl } from 'date-fns/locale'

interface Taak {
  id: string
  titel: string
  status: string
  prioriteit: string
  deadline: string | null
  project: { naam: string } | null
  toegewezen: { naam: string } | null
}

interface Levering {
  id: string
  ordernummer: string
  leverdatum: string
  status: string
  onderwerp: string | null
  relatie_bedrijfsnaam: string
}

interface Project {
  id: string
  naam: string
}

const columns: ColumnDef<Taak, unknown>[] = [
  { accessorKey: 'titel', header: 'Titel' },
  { accessorKey: 'status', header: 'Status', cell: ({ getValue }) => <Badge status={getValue() as string} /> },
  { accessorKey: 'prioriteit', header: 'Prioriteit', cell: ({ getValue }) => <Badge status={getValue() as string} /> },
  { id: 'project', header: 'Project', accessorFn: (row) => row.project?.naam || '-' },
  { accessorKey: 'deadline', header: 'Deadline', cell: ({ getValue }) => getValue() ? formatDateShort(getValue() as string) : '-' },
]

function AgendaCalendar({ taken, leveringen }: { taken: Taak[]; leveringen: Levering[] }) {
  const router = useRouter()
  const [currentMonth, setCurrentMonth] = useState(new Date())
  const [selectedDate, setSelectedDate] = useState<Date | null>(null)

  const days = useMemo(() => {
    const monthStart = startOfMonth(currentMonth)
    const monthEnd = endOfMonth(currentMonth)
    const calStart = startOfWeek(monthStart, { weekStartsOn: 1 })
    const calEnd = endOfWeek(monthEnd, { weekStartsOn: 1 })
    return eachDayOfInterval({ start: calStart, end: calEnd })
  }, [currentMonth])

  const takenByDate = useMemo(() => {
    const map = new Map<string, Taak[]>()
    for (const t of taken) {
      if (t.deadline && t.status !== 'afgerond') {
        const key = t.deadline.split('T')[0]
        if (!map.has(key)) map.set(key, [])
        map.get(key)!.push(t)
      }
    }
    return map
  }, [taken])

  const leveringenByDate = useMemo(() => {
    const map = new Map<string, Levering[]>()
    for (const l of leveringen) {
      if (l.leverdatum) {
        const key = l.leverdatum.split('T')[0]
        if (!map.has(key)) map.set(key, [])
        map.get(key)!.push(l)
      }
    }
    return map
  }, [leveringen])

  const selectedDateStr = selectedDate ? format(selectedDate, 'yyyy-MM-dd') : null
  const selectedTaken = selectedDateStr ? (takenByDate.get(selectedDateStr) || []) : []
  const selectedLeveringen = selectedDateStr ? (leveringenByDate.get(selectedDateStr) || []) : []

  return (
    <div className="space-y-4">
      {/* Calendar header */}
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold text-gray-900 capitalize">
          {format(currentMonth, 'MMMM yyyy', { locale: nl })}
        </h2>
        <div className="flex items-center gap-1">
          <Button variant="ghost" size="sm" onClick={() => setCurrentMonth(subMonths(currentMonth, 1))}>
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <Button variant="ghost" size="sm" onClick={() => { setCurrentMonth(new Date()); setSelectedDate(new Date()) }}>
            Vandaag
          </Button>
          <Button variant="ghost" size="sm" onClick={() => setCurrentMonth(addMonths(currentMonth, 1))}>
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {/* Weekday headers */}
      <div className="grid grid-cols-7 gap-px bg-gray-200 rounded-t-lg overflow-hidden">
        {['Ma', 'Di', 'Wo', 'Do', 'Vr', 'Za', 'Zo'].map(dag => (
          <div key={dag} className="bg-gray-50 py-2 text-center text-xs font-medium text-gray-500">
            {dag}
          </div>
        ))}
      </div>

      {/* Calendar grid */}
      <div className="grid grid-cols-7 gap-px bg-gray-200 rounded-b-lg overflow-hidden -mt-4">
        {days.map(day => {
          const dayStr = format(day, 'yyyy-MM-dd')
          const dayTaken = takenByDate.get(dayStr) || []
          const dayLeveringen = leveringenByDate.get(dayStr) || []
          const hasItems = dayTaken.length > 0 || dayLeveringen.length > 0
          const isCurrentMonth = isSameMonth(day, currentMonth)
          const isSelected = selectedDate && isSameDay(day, selectedDate)
          const today = isToday(day)

          return (
            <div
              key={dayStr}
              onClick={() => setSelectedDate(day)}
              className={`
                min-h-[80px] bg-white p-1.5 cursor-pointer transition-colors
                ${!isCurrentMonth ? 'bg-gray-50' : ''}
                ${isSelected ? 'ring-2 ring-primary ring-inset' : ''}
                hover:bg-gray-50
              `}
            >
              <div className={`
                text-xs font-medium mb-1 w-6 h-6 flex items-center justify-center rounded-full
                ${today ? 'bg-primary text-white' : ''}
                ${!isCurrentMonth ? 'text-gray-300' : 'text-gray-700'}
              `}>
                {format(day, 'd')}
              </div>
              {hasItems && isCurrentMonth && (
                <div className="space-y-0.5">
                  {dayLeveringen.slice(0, 2).map(l => (
                    <div key={l.id} className="text-[10px] leading-tight px-1 py-0.5 rounded bg-emerald-100 text-emerald-800 truncate">
                      <Truck className="h-2.5 w-2.5 inline mr-0.5" />
                      {l.relatie_bedrijfsnaam}
                    </div>
                  ))}
                  {dayTaken.slice(0, 2).map(t => (
                    <div key={t.id} className="text-[10px] leading-tight px-1 py-0.5 rounded bg-blue-100 text-blue-800 truncate">
                      {t.titel}
                    </div>
                  ))}
                  {(dayTaken.length + dayLeveringen.length) > 2 && (
                    <div className="text-[10px] text-gray-400 px-1">
                      +{dayTaken.length + dayLeveringen.length - 2} meer
                    </div>
                  )}
                </div>
              )}
            </div>
          )
        })}
      </div>

      {/* Selected date detail */}
      {selectedDate && (
        <div className="bg-white border border-gray-200 rounded-lg p-4">
          <h3 className="text-sm font-semibold text-gray-900 mb-3 capitalize">
            {format(selectedDate, 'EEEE d MMMM yyyy', { locale: nl })}
          </h3>

          {selectedLeveringen.length === 0 && selectedTaken.length === 0 && (
            <p className="text-sm text-gray-400">Geen items op deze dag.</p>
          )}

          {selectedLeveringen.length > 0 && (
            <div className="mb-3">
              <h4 className="text-xs font-medium text-emerald-700 uppercase tracking-wide mb-2">Leveringen</h4>
              <div className="space-y-2">
                {selectedLeveringen.map(l => (
                  <div
                    key={l.id}
                    onClick={() => router.push(`/offertes/orders/${l.id}`)}
                    className="flex items-center gap-3 p-2 rounded-md bg-emerald-50 hover:bg-emerald-100 cursor-pointer transition-colors"
                  >
                    <Truck className="h-4 w-4 text-emerald-600 flex-shrink-0" />
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium text-gray-900 truncate">{l.relatie_bedrijfsnaam}</p>
                      <p className="text-xs text-gray-500">{l.ordernummer}{l.onderwerp ? ` — ${l.onderwerp}` : ''}</p>
                    </div>
                    <Badge status={l.status} />
                  </div>
                ))}
              </div>
            </div>
          )}

          {selectedTaken.length > 0 && (
            <div>
              <h4 className="text-xs font-medium text-blue-700 uppercase tracking-wide mb-2">Taken</h4>
              <div className="space-y-2">
                {selectedTaken.map(t => (
                  <div
                    key={t.id}
                    onClick={() => router.push(`/taken/${t.id}`)}
                    className="flex items-center gap-3 p-2 rounded-md bg-blue-50 hover:bg-blue-100 cursor-pointer transition-colors"
                  >
                    <CheckSquare className="h-4 w-4 text-blue-600 flex-shrink-0" />
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium text-gray-900 truncate">{t.titel}</p>
                      <p className="text-xs text-gray-500">{t.project?.naam || 'Geen project'}</p>
                    </div>
                    <Badge status={t.prioriteit} />
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

export function TakenView({ taken, leveringen }: { taken: Taak[]; projecten: Project[]; leveringen: Levering[] }) {
  const router = useRouter()
  const [view, setView] = useState<'agenda' | 'lijst'>('agenda')

  return (
    <div>
      <PageHeader
        title="Taken & Agenda"
        description="Beheer uw taken en bekijk geplande leveringen"
        actions={
          <div className="flex items-center gap-2">
            <div className="flex items-center bg-gray-100 rounded-lg p-0.5">
              <button
                onClick={() => setView('agenda')}
                className={`px-3 py-1.5 text-sm rounded-md transition-colors ${view === 'agenda' ? 'bg-white shadow-sm text-gray-900 font-medium' : 'text-gray-500 hover:text-gray-700'}`}
              >
                <CalendarDays className="h-4 w-4 inline mr-1" />
                Agenda
              </button>
              <button
                onClick={() => setView('lijst')}
                className={`px-3 py-1.5 text-sm rounded-md transition-colors ${view === 'lijst' ? 'bg-white shadow-sm text-gray-900 font-medium' : 'text-gray-500 hover:text-gray-700'}`}
              >
                <List className="h-4 w-4 inline mr-1" />
                Lijst
              </button>
            </div>
            <Button onClick={() => router.push('/taken/nieuw')}>
              <Plus className="h-4 w-4" />
              Nieuwe taak
            </Button>
          </div>
        }
      />

      {view === 'agenda' ? (
        <AgendaCalendar taken={taken} leveringen={leveringen} />
      ) : (
        <>
          {taken.length === 0 ? (
            <EmptyState icon={CheckSquare} title="Geen taken" description="U heeft nog geen taken." action={<Button onClick={() => router.push('/taken/nieuw')}><Plus className="h-4 w-4" />Taak aanmaken</Button>} />
          ) : (
            <DataTable columns={columns} data={taken} searchPlaceholder="Zoek taak..." onRowClick={(row) => router.push(`/taken/${row.id}`)} />
          )}
        </>
      )}
    </div>
  )
}
