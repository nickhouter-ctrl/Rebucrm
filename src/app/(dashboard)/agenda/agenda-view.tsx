'use client'

import { useState, useMemo, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { PageHeader } from '@/components/ui/page-header'
import { Button } from '@/components/ui/button'
import { Dialog } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Select } from '@/components/ui/select'
import { type AgendaItem, type AgendaItemType, saveAfspraak, deleteAfspraak } from '@/lib/actions'
import {
  Plus, ChevronLeft, ChevronRight, CheckSquare, Truck, Phone, CalendarDays,
  MapPin, Trash2,
} from 'lucide-react'
import {
  startOfMonth, endOfMonth, startOfWeek, endOfWeek,
  addMonths, subMonths, eachDayOfInterval, format, isSameMonth, isSameDay, isToday,
} from 'date-fns'
import { nl } from 'date-fns/locale'

interface Afspraak {
  id: string
  titel: string
  omschrijving: string | null
  start_datum: string
  start_tijd: string
  eind_datum: string | null
  eind_tijd: string
  hele_dag: boolean
  locatie: string | null
  relatie_id: string | null
  lead_id: string | null
  project_id: string | null
}

interface Relatie {
  id: string
  bedrijfsnaam: string
}

interface Lead {
  id: string
  bedrijfsnaam: string
}

interface Project {
  id: string
  naam: string
}

function formatTijd(datum: string, hele_dag?: boolean): string {
  if (hele_dag) return 'Hele dag'
  const t = datum.includes('T') ? datum.slice(11, 16) : ''
  return t && t !== '00:00' ? t : ''
}

const typeConfig: Record<AgendaItemType, { label: string; bg: string; text: string; dot: string; icon: typeof CheckSquare }> = {
  taak: { label: 'Taken', bg: 'bg-blue-100', text: 'text-blue-800', dot: 'bg-blue-500', icon: CheckSquare },
  levering: { label: 'Leveringen', bg: 'bg-emerald-100', text: 'text-emerald-800', dot: 'bg-emerald-500', icon: Truck },
  terugbellen: { label: 'Terugbellen', bg: 'bg-orange-100', text: 'text-orange-800', dot: 'bg-orange-500', icon: Phone },
  afspraak: { label: 'Afspraken', bg: 'bg-purple-100', text: 'text-purple-800', dot: 'bg-purple-500', icon: CalendarDays },
}

export function AgendaView({
  agendaItems,
  afspraken,
  relaties,
  leads,
  projecten,
}: {
  agendaItems: AgendaItem[]
  afspraken: Afspraak[]
  relaties: Relatie[]
  leads: Lead[]
  projecten: Project[]
}) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [currentMonth, setCurrentMonth] = useState(new Date())
  const [selectedDate, setSelectedDate] = useState<Date | null>(new Date())
  const [filters, setFilters] = useState<Record<AgendaItemType, boolean>>({
    taak: true,
    levering: true,
    terugbellen: true,
    afspraak: true,
  })
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editingAfspraak, setEditingAfspraak] = useState<Afspraak | null>(null)

  const filteredItems = useMemo(
    () => agendaItems.filter(item => filters[item.type]),
    [agendaItems, filters]
  )

  const itemsByDate = useMemo(() => {
    const map = new Map<string, AgendaItem[]>()
    for (const item of filteredItems) {
      const key = item.datum.split('T')[0]
      if (!map.has(key)) map.set(key, [])
      map.get(key)!.push(item)
    }
    return map
  }, [filteredItems])

  const days = useMemo(() => {
    const monthStart = startOfMonth(currentMonth)
    const monthEnd = endOfMonth(currentMonth)
    const calStart = startOfWeek(monthStart, { weekStartsOn: 1 })
    const calEnd = endOfWeek(monthEnd, { weekStartsOn: 1 })
    return eachDayOfInterval({ start: calStart, end: calEnd })
  }, [currentMonth])

  const selectedDateStr = selectedDate ? format(selectedDate, 'yyyy-MM-dd') : null
  const selectedItems = selectedDateStr ? (itemsByDate.get(selectedDateStr) || []) : []

  function toggleFilter(type: AgendaItemType) {
    setFilters(f => ({ ...f, [type]: !f[type] }))
  }

  function openNewAfspraak(date?: Date) {
    const d = date || selectedDate || new Date()
    setEditingAfspraak({
      id: '',
      titel: '',
      omschrijving: null,
      start_datum: format(d, 'yyyy-MM-dd'),
      start_tijd: format(d, 'HH:mm'),
      eind_datum: null,
      eind_tijd: '',
      hele_dag: false,
      locatie: null,
      relatie_id: null,
      lead_id: null,
      project_id: null,
    })
    setDialogOpen(true)
  }

  function openEditAfspraak(id: string) {
    const a = afspraken.find(x => x.id === id)
    if (a) {
      setEditingAfspraak({
        ...a,
        start_datum: a.start_datum ? a.start_datum.slice(0, 10) : '',
        start_tijd: a.start_datum && !a.hele_dag ? a.start_datum.slice(11, 16) : '',
        eind_datum: a.eind_datum ? a.eind_datum.slice(0, 10) : null,
        eind_tijd: a.eind_datum && !a.hele_dag ? a.eind_datum.slice(11, 16) : '',
      })
      setDialogOpen(true)
    }
  }

  async function handleSave(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const form = new FormData(e.currentTarget)
    if (editingAfspraak?.id) form.set('id', editingAfspraak.id)

    const heleDag = form.get('hele_dag') ? 'true' : 'false'
    form.set('hele_dag', heleDag)

    // Combineer datum + tijd tot datetime string
    const startDatum = form.get('start_datum') as string
    const startTijd = form.get('start_tijd') as string
    form.set('start_datum', heleDag === 'true' ? startDatum : `${startDatum}T${startTijd || '00:00'}`)
    form.delete('start_tijd')

    const eindDatum = form.get('eind_datum') as string
    const eindTijd = form.get('eind_tijd') as string
    if (eindDatum) {
      form.set('eind_datum', heleDag === 'true' ? eindDatum : `${eindDatum}T${eindTijd || '23:59'}`)
    }
    form.delete('eind_tijd')

    startTransition(async () => {
      await saveAfspraak(form)
      setDialogOpen(false)
      setEditingAfspraak(null)
      router.refresh()
    })
  }

  async function handleDelete() {
    if (!editingAfspraak?.id) return
    startTransition(async () => {
      await deleteAfspraak(editingAfspraak.id)
      setDialogOpen(false)
      setEditingAfspraak(null)
      router.refresh()
    })
  }

  function handleItemClick(item: AgendaItem) {
    if (item.type === 'afspraak') {
      openEditAfspraak(item.id)
    } else if (item.link) {
      router.push(item.link)
    }
  }

  return (
    <div>
      <PageHeader
        title="Agenda"
        description="Overzicht van taken, leveringen, terugbelmomenten en afspraken"
        actions={
          <Button onClick={() => openNewAfspraak()}>
            <Plus className="h-4 w-4" />
            Afspraak toevoegen
          </Button>
        }
      />

      {/* Filter toggles */}
      <div className="flex flex-wrap gap-2 mb-4">
        {(Object.keys(typeConfig) as AgendaItemType[]).map(type => {
          const cfg = typeConfig[type]
          const active = filters[type]
          return (
            <button
              key={type}
              onClick={() => toggleFilter(type)}
              className={`
                inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium transition-all
                ${active ? `${cfg.bg} ${cfg.text}` : 'bg-gray-100 text-gray-400'}
              `}
            >
              <span className={`w-2 h-2 rounded-full ${active ? cfg.dot : 'bg-gray-300'}`} />
              {cfg.label}
            </button>
          )
        })}
      </div>

      {/* Calendar header */}
      <div className="flex items-center justify-between mb-2">
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
      <div className="grid grid-cols-7 gap-px bg-gray-200 rounded-b-lg overflow-hidden">
        {days.map(day => {
          const dayStr = format(day, 'yyyy-MM-dd')
          const dayItems = itemsByDate.get(dayStr) || []
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
              {dayItems.length > 0 && isCurrentMonth && (
                <div className="space-y-0.5">
                  {dayItems.slice(0, 3).map(item => {
                    const cfg = typeConfig[item.type]
                    return (
                      <div key={`${item.type}-${item.id}`} className={`text-[10px] leading-tight px-1 py-0.5 rounded ${cfg.bg} ${cfg.text} truncate`}>
                        {item.titel}
                      </div>
                    )
                  })}
                  {dayItems.length > 3 && (
                    <div className="text-[10px] text-gray-400 px-1">
                      +{dayItems.length - 3} meer
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
        <div className="bg-white border border-gray-200 rounded-lg p-4 mt-4">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-semibold text-gray-900 capitalize">
              {format(selectedDate, 'EEEE d MMMM yyyy', { locale: nl })}
            </h3>
            <Button variant="ghost" size="sm" onClick={() => openNewAfspraak(selectedDate)}>
              <Plus className="h-3.5 w-3.5" />
              Afspraak
            </Button>
          </div>

          {selectedItems.length === 0 && (
            <p className="text-sm text-gray-400">Geen items op deze dag.</p>
          )}

          {(Object.keys(typeConfig) as AgendaItemType[]).map(type => {
            const items = selectedItems.filter(i => i.type === type)
            if (items.length === 0) return null
            const cfg = typeConfig[type]
            const Icon = cfg.icon

            return (
              <div key={type} className="mb-3 last:mb-0">
                <h4 className={`text-xs font-medium uppercase tracking-wide mb-2 ${cfg.text}`}>
                  {cfg.label}
                </h4>
                <div className="space-y-1.5">
                  {items.map(item => {
                    const tijd = item.datum.includes('T') ? item.datum.slice(11, 16) : ''
                    const toonTijd = tijd && tijd !== '00:00'
                    return (
                      <div
                        key={item.id}
                        onClick={() => handleItemClick(item)}
                        className={`flex items-center gap-3 p-2 rounded-md ${cfg.bg} hover:opacity-80 cursor-pointer transition-colors`}
                      >
                        <Icon className={`h-4 w-4 ${cfg.text} flex-shrink-0`} />
                        <div className="min-w-0 flex-1">
                          <p className="text-sm font-medium text-gray-900 truncate">
                            {toonTijd && <span className="text-gray-500 font-normal mr-1.5">{tijd}</span>}
                            {item.titel}
                          </p>
                          {item.meta && <p className="text-xs text-gray-500">{item.meta}</p>}
                        </div>
                      </div>
                    )
                  })}
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* Afspraak dialog */}
      <Dialog
        open={dialogOpen}
        onClose={() => { setDialogOpen(false); setEditingAfspraak(null) }}
        title={editingAfspraak?.id ? 'Afspraak bewerken' : 'Nieuwe afspraak'}
      >
        {editingAfspraak && (
          <form onSubmit={handleSave} className="space-y-4">
            <Input
              label="Titel"
              name="titel"
              required
              defaultValue={editingAfspraak.titel}
            />

            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                name="hele_dag"
                checked={editingAfspraak.hele_dag}
                onChange={(e) => setEditingAfspraak(prev => prev ? { ...prev, hele_dag: e.target.checked } : prev)}
                className="rounded border-gray-300"
              />
              Hele dag
            </label>

            <div className="grid grid-cols-2 gap-3">
              <Input
                label="Start datum"
                name="start_datum"
                type="date"
                required
                defaultValue={editingAfspraak.start_datum}
              />
              {!editingAfspraak.hele_dag && (
                <Input
                  label="Start tijd"
                  name="start_tijd"
                  type="time"
                  required
                  defaultValue={editingAfspraak.start_tijd}
                />
              )}
            </div>

            <div className="grid grid-cols-2 gap-3">
              <Input
                label="Eind datum"
                name="eind_datum"
                type="date"
                defaultValue={editingAfspraak.eind_datum || ''}
              />
              {!editingAfspraak.hele_dag && (
                <Input
                  label="Eind tijd"
                  name="eind_tijd"
                  type="time"
                  defaultValue={editingAfspraak.eind_tijd}
                />
              )}
            </div>

            <Input
              label="Locatie"
              name="locatie"
              defaultValue={editingAfspraak.locatie || ''}
              placeholder="Optioneel"
            />

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Omschrijving</label>
              <textarea
                name="omschrijving"
                rows={3}
                defaultValue={editingAfspraak.omschrijving || ''}
                className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent"
                placeholder="Optioneel"
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <Select
                label="Relatie"
                name="relatie_id"
                placeholder="Geen relatie"
                defaultValue={editingAfspraak.relatie_id || ''}
                options={relaties.map(r => ({ value: r.id, label: r.bedrijfsnaam }))}
              />
              <Select
                label="Lead"
                name="lead_id"
                placeholder="Geen lead"
                defaultValue={editingAfspraak.lead_id || ''}
                options={leads.map(l => ({ value: l.id, label: l.bedrijfsnaam }))}
              />
            </div>

            <Select
              label="Project"
              name="project_id"
              placeholder="Geen project"
              defaultValue={editingAfspraak.project_id || ''}
              options={projecten.map(p => ({ value: p.id, label: p.naam }))}
            />

            <div className="flex items-center justify-between pt-2 border-t">
              {editingAfspraak.id ? (
                <Button type="button" variant="ghost" onClick={handleDelete} disabled={isPending}>
                  <Trash2 className="h-4 w-4 text-red-500" />
                  <span className="text-red-500">Verwijderen</span>
                </Button>
              ) : (
                <div />
              )}
              <div className="flex gap-2">
                <Button type="button" variant="ghost" onClick={() => { setDialogOpen(false); setEditingAfspraak(null) }}>
                  Annuleren
                </Button>
                <Button type="submit" disabled={isPending}>
                  {isPending ? 'Opslaan...' : 'Opslaan'}
                </Button>
              </div>
            </div>
          </form>
        )}
      </Dialog>
    </div>
  )
}
