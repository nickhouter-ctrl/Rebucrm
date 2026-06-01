'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Dialog } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Select } from '@/components/ui/select'
import { Badge } from '@/components/ui/badge'
import { showToast } from '@/components/ui/toast'
import { saveVrijeDag, beoordeelVrijeDag, deleteVrijeDag } from '@/lib/actions'
import { Plus, Palmtree, Check, X, Trash2, Clock, CheckCircle, XCircle } from 'lucide-react'
import { format } from 'date-fns'
import { nl } from 'date-fns/locale'

interface VrijeDag {
  id: string
  medewerker_id: string | null
  medewerker_naam: string | null
  start_datum: string
  eind_datum: string
  aantal_uren: number | null
  type: string
  reden: string | null
  status: string
  aangevraagd_op: string
}

interface Medewerker { id: string; naam: string }

const TYPE_LABEL: Record<string, string> = { vakantie: 'Vakantie', verlof: 'Verlof', ziek: 'Ziek', bijzonder: 'Bijzonder verlof' }

function dagenTussen(start: string, eind: string): number {
  const a = new Date(start); const b = new Date(eind || start)
  return Math.max(1, Math.round((b.getTime() - a.getTime()) / 86400000) + 1)
}

export function VrijeDagenView({ items, rol, medewerkers }: { items: VrijeDag[]; rol: string; medewerkers: Medewerker[] }) {
  const router = useRouter()
  const isAdmin = rol !== 'medewerker'
  const [dialogOpen, setDialogOpen] = useState(false)
  const [bezig, setBezig] = useState(false)
  const [loadingId, setLoadingId] = useState<string | null>(null)

  const aangevraagd = items.filter(i => i.status === 'aangevraagd')
  const goedgekeurd = items.filter(i => i.status === 'goedgekeurd')
  const afgewezen = items.filter(i => i.status === 'afgewezen')

  async function handleSubmit(formData: FormData) {
    setBezig(true)
    const res = await saveVrijeDag(formData)
    setBezig(false)
    if (res?.error) { showToast(res.error, 'error'); return }
    showToast(isAdmin ? 'Vrije dagen opgeslagen' : 'Aanvraag ingediend', 'success')
    setDialogOpen(false)
    router.refresh()
  }

  async function handleBeoordeel(id: string, status: 'goedgekeurd' | 'afgewezen') {
    setLoadingId(id)
    const res = await beoordeelVrijeDag(id, status)
    setLoadingId(null)
    if (res?.error) { showToast(res.error, 'error'); return }
    showToast(status === 'goedgekeurd' ? 'Goedgekeurd' : 'Afgewezen', 'success')
    router.refresh()
  }

  async function handleDelete(id: string) {
    if (!confirm('Verwijderen?')) return
    setLoadingId(id)
    const res = await deleteVrijeDag(id)
    setLoadingId(null)
    if (res?.error) { showToast(res.error, 'error'); return }
    router.refresh()
  }

  function Rij({ v }: { v: VrijeDag }) {
    const dagen = dagenTussen(v.start_datum, v.eind_datum)
    return (
      <div className="px-4 py-3 flex items-start gap-3 hover:bg-gray-50 transition-colors">
        <Palmtree className="h-5 w-5 text-rose-500 mt-0.5 flex-shrink-0" />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-sm font-medium text-gray-900">{v.medewerker_naam || 'Onbekend'}</span>
            <Badge status={v.type}>{TYPE_LABEL[v.type] || v.type}</Badge>
          </div>
          <div className="text-xs text-gray-500 mt-0.5">
            {format(new Date(v.start_datum), 'd MMM yyyy', { locale: nl })}
            {v.eind_datum && v.eind_datum !== v.start_datum ? ` – ${format(new Date(v.eind_datum), 'd MMM yyyy', { locale: nl })}` : ''}
            {' · '}{dagen} {dagen === 1 ? 'dag' : 'dagen'}
            {v.aantal_uren ? ` · ${v.aantal_uren} uur` : ''}
          </div>
          {v.reden && <div className="text-xs text-gray-400 mt-0.5 truncate">{v.reden}</div>}
        </div>
        <div className="flex items-center gap-1 flex-shrink-0">
          {isAdmin && v.status === 'aangevraagd' && (
            <>
              <Button size="sm" variant="ghost" disabled={loadingId === v.id} onClick={() => handleBeoordeel(v.id, 'goedgekeurd')} className="text-green-600 hover:bg-green-50">
                <Check className="h-4 w-4" /> Goedkeuren
              </Button>
              <Button size="sm" variant="ghost" disabled={loadingId === v.id} onClick={() => handleBeoordeel(v.id, 'afgewezen')} className="text-red-600 hover:bg-red-50">
                <X className="h-4 w-4" />
              </Button>
            </>
          )}
          {(isAdmin || v.status === 'aangevraagd') && (
            <Button size="sm" variant="ghost" disabled={loadingId === v.id} onClick={() => handleDelete(v.id)} className="text-gray-400 hover:text-red-500">
              <Trash2 className="h-4 w-4" />
            </Button>
          )}
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Vrije dagen</h1>
          <p className="text-sm text-gray-500 mt-1">
            {isAdmin ? 'Beheer en keur vrije dagen goed — goedgekeurde dagen verschijnen in de agenda' : 'Vraag je vrije dagen aan — de beheerder keurt ze goed'}
          </p>
        </div>
        <Button onClick={() => setDialogOpen(true)}>
          <Plus className="h-4 w-4" />
          {isAdmin ? 'Vrije dagen toevoegen' : 'Vrije dagen aanvragen'}
        </Button>
      </div>

      {/* Te beoordelen (admin) */}
      {isAdmin && aangevraagd.length > 0 && (
        <Card>
          <CardContent className="p-0">
            <div className="px-4 py-2.5 border-b border-gray-100 flex items-center gap-2 bg-amber-50">
              <Clock className="h-4 w-4 text-amber-600" />
              <span className="text-sm font-semibold text-amber-800">Te beoordelen ({aangevraagd.length})</span>
            </div>
            <div className="divide-y divide-gray-100">{aangevraagd.map(v => <Rij key={v.id} v={v} />)}</div>
          </CardContent>
        </Card>
      )}

      {/* Eigen openstaande aanvragen (medewerker) */}
      {!isAdmin && aangevraagd.length > 0 && (
        <Card>
          <CardContent className="p-0">
            <div className="px-4 py-2.5 border-b border-gray-100 flex items-center gap-2">
              <Clock className="h-4 w-4 text-amber-500" />
              <span className="text-sm font-semibold text-gray-700">In afwachting ({aangevraagd.length})</span>
            </div>
            <div className="divide-y divide-gray-100">{aangevraagd.map(v => <Rij key={v.id} v={v} />)}</div>
          </CardContent>
        </Card>
      )}

      {/* Goedgekeurd */}
      <Card>
        <CardContent className="p-0">
          <div className="px-4 py-2.5 border-b border-gray-100 flex items-center gap-2">
            <CheckCircle className="h-4 w-4 text-emerald-500" />
            <span className="text-sm font-semibold text-gray-700">Goedgekeurd ({goedgekeurd.length})</span>
          </div>
          {goedgekeurd.length === 0
            ? <p className="px-4 py-6 text-sm text-gray-400 text-center">Nog geen goedgekeurde vrije dagen</p>
            : <div className="divide-y divide-gray-100">{goedgekeurd.map(v => <Rij key={v.id} v={v} />)}</div>}
        </CardContent>
      </Card>

      {/* Afgewezen */}
      {afgewezen.length > 0 && (
        <Card>
          <CardContent className="p-0">
            <div className="px-4 py-2.5 border-b border-gray-100 flex items-center gap-2">
              <XCircle className="h-4 w-4 text-gray-400" />
              <span className="text-sm font-semibold text-gray-500">Afgewezen ({afgewezen.length})</span>
            </div>
            <div className="divide-y divide-gray-100">{afgewezen.map(v => <Rij key={v.id} v={v} />)}</div>
          </CardContent>
        </Card>
      )}

      <Dialog open={dialogOpen} onClose={() => setDialogOpen(false)} title={isAdmin ? 'Vrije dagen toevoegen' : 'Vrije dagen aanvragen'}>
        <form action={handleSubmit} className="space-y-4">
          {isAdmin && (
            <Select name="medewerker_id" label="Medewerker" required options={medewerkers.map(m => ({ value: m.id, label: m.naam }))} placeholder="Kies medewerker..." />
          )}
          <div className="grid grid-cols-2 gap-3">
            <Input name="start_datum" label="Van" type="date" required />
            <Input name="eind_datum" label="Tot en met" type="date" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Select name="type" label="Type" defaultValue="vakantie" options={[
              { value: 'vakantie', label: 'Vakantie' },
              { value: 'verlof', label: 'Verlof' },
              { value: 'ziek', label: 'Ziek' },
              { value: 'bijzonder', label: 'Bijzonder verlof' },
            ]} />
            <Input name="aantal_uren" label="Aantal uren (voor rapportage)" type="number" step="0.5" placeholder="bijv. 8" />
          </div>
          <Input name="reden" label="Toelichting (optioneel)" placeholder="bijv. zomervakantie" />
          {isAdmin && (
            <label className="flex items-center gap-2 text-sm text-gray-700">
              <input type="checkbox" name="direct_goedkeuren" value="true" defaultChecked className="rounded border-gray-300 text-primary" />
              Direct goedkeuren
            </label>
          )}
          <div className="flex justify-end gap-2 pt-2 border-t border-gray-200">
            <Button type="button" variant="ghost" onClick={() => setDialogOpen(false)}>Annuleren</Button>
            <Button type="submit" disabled={bezig}>{bezig ? 'Bezig…' : isAdmin ? 'Opslaan' : 'Aanvragen'}</Button>
          </div>
        </form>
      </Dialog>
    </div>
  )
}
