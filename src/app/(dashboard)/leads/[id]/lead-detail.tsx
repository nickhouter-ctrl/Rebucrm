'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { PageHeader } from '@/components/ui/page-header'
import { Card, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Dialog } from '@/components/ui/dialog'
import {
  ArrowLeft, Save, Trash2, Phone, Mail, MapPin, Building2,
  CalendarClock, Plus, CheckSquare, UserCheck, Loader2, Clock,
} from 'lucide-react'
import {
  updateLead, deleteLead, updateLeadStatus, setTerugbelMoment,
  convertLeadToRelatie, createLeadTaak, deleteTaak,
} from '@/lib/actions'
import { formatDateShort } from '@/lib/utils'
import { CopyablePhone } from '@/components/ui/copyable-phone'
import { leadStatussen } from '@/lib/constants'

interface Lead {
  id: string
  bedrijfsnaam: string
  contactpersoon: string | null
  email: string | null
  telefoon: string | null
  adres: string | null
  postcode: string | null
  plaats: string | null
  status: string
  notities: string | null
  terugbel_datum: string | null
  terugbel_notitie: string | null
  relatie_id: string | null
  bron: string | null
  created_at: string
}

interface Taak {
  id: string
  titel: string
  status: string
  prioriteit: string
  deadline: string | null
  created_at: string
}

const statusConfig: Record<string, { label: string; next?: string; nextLabel?: string }> = {
  nieuw: { label: 'Nieuw', next: 'gecontacteerd', nextLabel: 'Markeer als gecontacteerd' },
  gecontacteerd: { label: 'Gecontacteerd', next: 'offerte_verstuurd', nextLabel: 'Offerte verstuurd' },
  offerte_verstuurd: { label: 'Offerte verstuurd' },
  gewonnen: { label: 'Gewonnen' },
  verloren: { label: 'Verloren' },
}

export function LeadDetail({ lead, taken: initialTaken }: { lead: Lead; taken: Taak[] }) {
  const router = useRouter()
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  const [taken, setTaken] = useState(initialTaken)

  async function pdokAutoFill() {
    const postcode = (document.getElementById('lead_postcode') as HTMLInputElement | null)?.value.trim() || ''
    const huisnummer = (document.getElementById('lead_huisnr') as HTMLInputElement | null)?.value.trim() || ''
    if (!postcode || !huisnummer) return
    if (!/^[1-9][0-9]{3}\s?[A-Za-z]{2}$/.test(postcode)) return
    try {
      const res = await fetch(`/api/pdok/lookup?postcode=${encodeURIComponent(postcode)}&huisnummer=${encodeURIComponent(huisnummer)}`)
      if (!res.ok) return
      const adres = await res.json() as { straat: string; huisnummer: string; toevoeging: string | null; postcode: string; plaats: string }
      const huisnrFull = adres.toevoeging ? `${adres.huisnummer}${adres.toevoeging}` : adres.huisnummer
      const adresEl = document.getElementById('lead_adres') as HTMLInputElement | null
      const postcodeEl = document.getElementById('lead_postcode') as HTMLInputElement | null
      const plaatsEl = document.getElementById('lead_plaats') as HTMLInputElement | null
      if (adresEl && !adresEl.value.trim()) adresEl.value = `${adres.straat} ${huisnrFull}`
      if (postcodeEl) postcodeEl.value = adres.postcode
      if (plaatsEl && !plaatsEl.value.trim()) plaatsEl.value = adres.plaats
    } catch {
      // stille fail
    }
  }

  // Terugbel state
  const [terugbelDatum, setTerugbelDatum] = useState(
    lead.terugbel_datum ? new Date(lead.terugbel_datum).toISOString().slice(0, 16) : ''
  )
  const [terugbelNotitie, setTerugbelNotitie] = useState(lead.terugbel_notitie || '')

  // Taak dialog
  const [taakDialogOpen, setTaakDialogOpen] = useState(false)
  const [taakTitel, setTaakTitel] = useState('')
  const [taakDeadline, setTaakDeadline] = useState('')
  const [taakPrioriteit, setTaakPrioriteit] = useState('normaal')

  // Notities
  const [notities, setNotities] = useState(lead.notities || '')

  function showMessage(msg: string, isError = false) {
    if (isError) { setError(msg); setSuccess('') }
    else { setSuccess(msg); setError('') }
    setTimeout(() => { setError(''); setSuccess('') }, 3000)
  }

  async function handleSave(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setSaving(true)
    const formData = new FormData(e.currentTarget)
    const result = await updateLead(lead.id, formData)
    setSaving(false)
    if (result.error) showMessage(result.error, true)
    else showMessage('Lead opgeslagen')
  }

  async function handleDelete() {
    if (!confirm('Weet u zeker dat u deze lead wilt verwijderen?')) return
    const result = await deleteLead(lead.id)
    if (result.error) showMessage(result.error, true)
    else router.push('/leads')
  }

  async function handleStatusChange(status: string) {
    const result = await updateLeadStatus(lead.id, status)
    if (result.error) showMessage(result.error, true)
    else router.refresh()
  }

  async function handleTerugbelSave() {
    const result = await setTerugbelMoment(lead.id, terugbelDatum, terugbelNotitie)
    if (result.error) showMessage(result.error, true)
    else showMessage('Terugbelmoment ingepland')
  }

  async function handleConvert() {
    if (!confirm('Lead converteren naar relatie? De lead wordt als gewonnen gemarkeerd.')) return
    setSaving(true)
    const result = await convertLeadToRelatie(lead.id)
    setSaving(false)
    if (result.error) showMessage(result.error, true)
    else router.push(`/relatiebeheer/${result.relatie_id}`)
  }

  async function handleTaakToevoegen() {
    if (!taakTitel.trim()) return
    const result = await createLeadTaak(lead.id, taakTitel, taakDeadline || undefined, taakPrioriteit)
    if (result.error) {
      showMessage(result.error, true)
    } else {
      setTaakDialogOpen(false)
      setTaakTitel('')
      setTaakDeadline('')
      setTaakPrioriteit('normaal')
      router.refresh()
    }
  }

  async function handleTaakVerwijderen(taakId: string) {
    const result = await deleteTaak(taakId)
    if (result.error) showMessage(result.error, true)
    else setTaken(taken.filter(t => t.id !== taakId))
  }

  const config = statusConfig[lead.status] || statusConfig.nieuw
  const isAfgesloten = lead.status === 'gewonnen' || lead.status === 'verloren'

  return (
    <div>
      <PageHeader
        title={lead.bedrijfsnaam}
        description={`Lead ${config.label.toLowerCase()} — ${formatDateShort(lead.created_at)}`}
        actions={
          <div className="flex gap-2">
            <Button variant="secondary" onClick={() => router.back()}>
              <ArrowLeft className="h-4 w-4" />
              Terug
            </Button>
            {!isAfgesloten && (
              <Button onClick={handleConvert}>
                <UserCheck className="h-4 w-4" />
                Converteren naar relatie
              </Button>
            )}
            {lead.relatie_id && (
              <Button variant="secondary" onClick={() => router.push(`/relatiebeheer/${lead.relatie_id}`)}>
                Bekijk relatie
              </Button>
            )}
          </div>
        }
      />

      {error && <div className="mb-4 p-3 bg-red-50 text-red-600 rounded-lg text-sm">{error}</div>}
      {success && <div className="mb-4 p-3 bg-green-50 text-green-600 rounded-lg text-sm">{success}</div>}

      {/* Status knoppen */}
      <div className="flex items-center gap-2 mb-6">
        <span className="text-sm text-gray-500 mr-2">Status:</span>
        {leadStatussen.map(s => (
          <button
            key={s}
            onClick={() => handleStatusChange(s)}
            className={`px-3 py-1.5 rounded-full text-xs font-medium transition-colors ${
              lead.status === s
                ? 'ring-2 ring-offset-1 ring-gray-400'
                : 'opacity-60 hover:opacity-100'
            }`}
          >
            <Badge status={s} />
          </button>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left column: info + notities */}
        <div className="lg:col-span-2 space-y-6">
          {/* Contactgegevens */}
          <Card>
            <CardContent>
              <h3 className="font-semibold text-gray-900 mb-4">Contactgegevens</h3>
              <form onSubmit={handleSave} className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Bedrijfsnaam *</label>
                    <Input name="bedrijfsnaam" defaultValue={lead.bedrijfsnaam} required />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Contactpersoon</label>
                    <Input name="contactpersoon" defaultValue={lead.contactpersoon || ''} />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">E-mail</label>
                    <Input name="email" type="email" defaultValue={lead.email || ''} />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Telefoon</label>
                    <Input name="telefoon" defaultValue={lead.telefoon || ''} />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Adres (straat + huisnummer)</label>
                    <Input id="lead_adres" name="adres" defaultValue={lead.adres || ''} />
                  </div>
                  <div className="grid grid-cols-[1fr_120px_1fr] gap-2">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Postcode</label>
                      <Input id="lead_postcode" name="postcode" defaultValue={lead.postcode || ''} placeholder="1234 AB" onBlur={pdokAutoFill} />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Huisnr.</label>
                      <Input id="lead_huisnr" placeholder="12 of 12A" onBlur={pdokAutoFill} />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Plaats</label>
                      <Input id="lead_plaats" name="plaats" defaultValue={lead.plaats || ''} />
                    </div>
                  </div>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Notities</label>
                  <textarea
                    name="notities"
                    rows={4}
                    value={notities}
                    onChange={(e) => setNotities(e.target.value)}
                    className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  />
                </div>
                <div className="flex justify-between">
                  <Button type="button" variant="secondary" onClick={handleDelete} className="text-red-600 hover:text-red-700">
                    <Trash2 className="h-4 w-4" />
                    Verwijderen
                  </Button>
                  <Button type="submit" disabled={saving}>
                    {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                    Opslaan
                  </Button>
                </div>
              </form>
            </CardContent>
          </Card>

          {/* Taken */}
          <Card>
            <CardContent>
              <div className="flex items-center justify-between mb-4">
                <h3 className="font-semibold text-gray-900">Taken</h3>
                <Button variant="secondary" onClick={() => setTaakDialogOpen(true)}>
                  <Plus className="h-4 w-4" />
                  Taak toevoegen
                </Button>
              </div>
              {taken.length === 0 ? (
                <p className="text-sm text-gray-500">Geen taken gekoppeld aan deze lead.</p>
              ) : (
                <div className="space-y-2">
                  {taken.map(taak => (
                    <div key={taak.id} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                      <div className="flex items-center gap-3">
                        <CheckSquare className="h-4 w-4 text-gray-400" />
                        <div>
                          <p className="text-sm font-medium text-gray-900">{taak.titel}</p>
                          <div className="flex items-center gap-2 mt-0.5">
                            <Badge status={taak.prioriteit} />
                            <Badge status={taak.status} />
                            {taak.deadline && (
                              <span className="text-xs text-gray-500">
                                <Clock className="inline h-3 w-3 mr-0.5" />
                                {formatDateShort(taak.deadline)}
                              </span>
                            )}
                          </div>
                        </div>
                      </div>
                      <button
                        onClick={() => handleTaakVerwijderen(taak.id)}
                        className="text-gray-400 hover:text-red-500 transition-colors"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Right column: quick info + terugbellen */}
        <div className="space-y-6">
          {/* Quick info */}
          <Card>
            <CardContent>
              <h3 className="font-semibold text-gray-900 mb-4">Overzicht</h3>
              <div className="space-y-3">
                {lead.contactpersoon && (
                  <div className="flex items-center gap-2 text-sm">
                    <Building2 className="h-4 w-4 text-gray-400" />
                    <span>{lead.contactpersoon}</span>
                  </div>
                )}
                {lead.telefoon && (
                  <div className="flex items-center gap-2 text-sm">
                    <Phone className="h-4 w-4 text-gray-400" />
                    <CopyablePhone nummer={lead.telefoon} showIcon={false} />
                  </div>
                )}
                {lead.email && (
                  <div className="flex items-center gap-2 text-sm">
                    <Mail className="h-4 w-4 text-gray-400" />
                    <a href={`mailto:${lead.email}`} className="text-blue-600 hover:underline">{lead.email}</a>
                  </div>
                )}
                {(lead.adres || lead.plaats) && (
                  <div className="flex items-center gap-2 text-sm">
                    <MapPin className="h-4 w-4 text-gray-400" />
                    <span>{[lead.adres, lead.postcode, lead.plaats].filter(Boolean).join(', ')}</span>
                  </div>
                )}
                <div className="pt-2 border-t border-gray-100">
                  <p className="text-xs text-gray-500">Bron: {lead.bron || 'handmatig'}</p>
                  <p className="text-xs text-gray-500">Aangemaakt: {formatDateShort(lead.created_at)}</p>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Terugbellen */}
          <Card>
            <CardContent>
              <h3 className="font-semibold text-gray-900 mb-4 flex items-center gap-2">
                <CalendarClock className="h-4 w-4" />
                Terugbellen
              </h3>
              <div className="space-y-3">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Datum & tijd</label>
                  <Input
                    type="datetime-local"
                    value={terugbelDatum}
                    onChange={(e) => setTerugbelDatum(e.target.value)}
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Notitie</label>
                  <textarea
                    rows={2}
                    value={terugbelNotitie}
                    onChange={(e) => setTerugbelNotitie(e.target.value)}
                    className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    placeholder="Reden om terug te bellen..."
                  />
                </div>
                <Button variant="secondary" onClick={handleTerugbelSave} className="w-full">
                  <CalendarClock className="h-4 w-4" />
                  Inplannen
                </Button>
                {lead.terugbel_datum && (
                  <div className="p-2 bg-blue-50 rounded text-sm text-blue-700">
                    <Phone className="inline h-3 w-3 mr-1" />
                    Gepland: {formatDateShort(lead.terugbel_datum)}
                    {lead.terugbel_notitie && <p className="mt-1 text-xs">{lead.terugbel_notitie}</p>}
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Taak toevoegen dialog */}
      <Dialog open={taakDialogOpen} onClose={() => setTaakDialogOpen(false)} title="Taak toevoegen">
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Titel *</label>
            <Input value={taakTitel} onChange={(e) => setTaakTitel(e.target.value)} placeholder="Bijv. Bel klant terug" />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Deadline</label>
              <Input type="date" value={taakDeadline} onChange={(e) => setTaakDeadline(e.target.value)} />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Prioriteit</label>
              <select
                value={taakPrioriteit}
                onChange={(e) => setTaakPrioriteit(e.target.value)}
                className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              >
                <option value="laag">Laag</option>
                <option value="normaal">Normaal</option>
                <option value="hoog">Hoog</option>
                <option value="urgent">Urgent</option>
              </select>
            </div>
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="secondary" onClick={() => setTaakDialogOpen(false)}>
              Annuleren
            </Button>
            <Button onClick={handleTaakToevoegen} disabled={!taakTitel.trim()}>
              Toevoegen
            </Button>
          </div>
        </div>
      </Dialog>
    </div>
  )
}
