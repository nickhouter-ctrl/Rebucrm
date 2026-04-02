'use client'

import { useRouter } from 'next/navigation'
import { useState } from 'react'
import { saveTaak, deleteTaak, saveTaakNotitie, deleteTaakNotitie } from '@/lib/actions'
import { PageHeader } from '@/components/ui/page-header'
import { Card, CardContent, CardFooter } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Select } from '@/components/ui/select'
import { Button } from '@/components/ui/button'
import { SearchSelect } from '@/components/ui/search-select'
import { Save, Trash2, ArrowLeft, MessageSquare } from 'lucide-react'
import { format } from 'date-fns'
import { nl } from 'date-fns/locale'

type Notitie = {
  id: string
  tekst: string
  created_at: string
  gebruiker: { naam: string } | null
}

export function TaakForm({ taak, projecten, medewerkers, relaties, offertes, notities: initialNotities = [], defaultRelatieId }: {
  taak: Record<string, unknown> | null
  projecten: { id: string; naam: string; relatie_id?: string }[]
  medewerkers: { id: string; naam: string; type: string; actief: boolean }[]
  relaties: { id: string; bedrijfsnaam: string }[]
  offertes: { id: string; offertenummer: string; relatie_id: string }[]
  notities?: Notitie[]
  defaultRelatieId?: string
}) {
  const router = useRouter()
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [selectedRelatieId, setSelectedRelatieId] = useState((taak?.relatie_id as string) || defaultRelatieId || '')
  const [selectedProjectId, setSelectedProjectId] = useState((taak?.project_id as string) || '')
  const [selectedMedewerkerId, setSelectedMedewerkerId] = useState((taak?.medewerker_id as string) || '')
  const [selectedOfferteId, setSelectedOfferteId] = useState((taak?.offerte_id as string) || '')
  const isNew = !taak

  const [notities, setNotities] = useState(initialNotities)
  const [notitieText, setNotitieText] = useState('')

  const filteredProjecten = selectedRelatieId
    ? projecten.filter(p => p.relatie_id === selectedRelatieId)
    : projecten

  const filteredOffertes = selectedRelatieId
    ? offertes.filter(o => o.relatie_id === selectedRelatieId)
    : offertes

  async function handleSubmit(formData: FormData) {
    setLoading(true); setError('')
    if (taak) formData.set('id', taak.id as string)
    formData.set('relatie_id', selectedRelatieId)
    const result = await saveTaak(formData)
    if (result.error) { setError(result.error); setLoading(false) }
    else router.push('/taken')
  }

  async function handleDelete() {
    if (!taak || !confirm('Verwijderen?')) return
    const result = await deleteTaak(taak.id as string)
    if (result.error) setError(result.error)
    else router.push('/taken')
  }

  async function handleSaveNotitie() {
    if (!notitieText.trim() || !taak) return
    setLoading(true)
    const result = await saveTaakNotitie({ taak_id: taak.id as string, tekst: notitieText })
    if (result.error) {
      setError(result.error as string)
    } else {
      setNotitieText('')
      router.refresh()
    }
    setLoading(false)
  }

  async function handleDeleteNotitie(id: string) {
    if (!confirm('Notitie verwijderen?')) return
    const result = await deleteTaakNotitie(id)
    if (result.error) {
      setError(result.error as string)
    } else {
      setNotities(prev => prev.filter(n => n.id !== id))
    }
  }

  return (
    <div>
      <PageHeader title={isNew ? 'Nieuwe taak' : 'Taak bewerken'} actions={<Button variant="ghost" onClick={() => router.push('/taken')}><ArrowLeft className="h-4 w-4" />Terug</Button>} />
      {error && <div className="bg-red-50 text-red-600 text-sm p-3 rounded-md mb-4">{error}</div>}
      <form action={handleSubmit}>
        <Card>
          <CardContent className="space-y-4 pt-6">
            <Input id="titel" name="titel" label="Titel *" defaultValue={(taak?.titel as string) || ''} required />
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <Select id="status" name="status" label="Status" defaultValue={(taak?.status as string) || 'open'} options={[
                { value: 'open', label: 'Open' }, { value: 'in_uitvoering', label: 'In uitvoering' }, { value: 'afgerond', label: 'Afgerond' },
              ]} />
              <Select id="prioriteit" name="prioriteit" label="Prioriteit" defaultValue={(taak?.prioriteit as string) || 'normaal'} options={[
                { value: 'laag', label: 'Laag' }, { value: 'normaal', label: 'Normaal' }, { value: 'hoog', label: 'Hoog' }, { value: 'urgent', label: 'Urgent' },
              ]} />
              <Input id="deadline" name="deadline" label="Deadline" type="date" defaultValue={(taak?.deadline as string) || ''} />
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <SearchSelect
                id="relatie_id"
                label="Klant / Relatie"
                placeholder="Zoek klant..."
                options={relaties.map(r => ({ value: r.id, label: r.bedrijfsnaam }))}
                value={selectedRelatieId}
                onChange={(val) => { setSelectedRelatieId(val); setSelectedProjectId('') }}
              />
              <SearchSelect
                id="project_id"
                name="project_id"
                label="Verkoopkans"
                placeholder="Zoek verkoopkans..."
                options={filteredProjecten.map(p => ({ value: p.id, label: p.naam }))}
                value={selectedProjectId}
                onChange={setSelectedProjectId}
              />
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <SearchSelect
                id="medewerker_id"
                name="medewerker_id"
                label="Toegewezen aan"
                placeholder="Selecteer medewerker..."
                options={medewerkers.filter(m => m.actief).map(m => ({ value: m.id, label: `${m.naam} (${m.type})` }))}
                value={selectedMedewerkerId}
                onChange={setSelectedMedewerkerId}
              />
              <SearchSelect
                id="offerte_id"
                name="offerte_id"
                label="Offerte"
                placeholder="Zoek offerte..."
                options={filteredOffertes.map(o => ({ value: o.id, label: o.offertenummer }))}
                value={selectedOfferteId}
                onChange={setSelectedOfferteId}
              />
            </div>
            <div>
              <label htmlFor="omschrijving" className="block text-sm font-medium text-gray-700 mb-1">Omschrijving</label>
              <textarea id="omschrijving" name="omschrijving" rows={4} defaultValue={(taak?.omschrijving as string) || ''} className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent" />
            </div>
          </CardContent>
          <CardFooter className="flex justify-between">
            <div>{!isNew && <Button type="button" variant="danger" onClick={handleDelete}><Trash2 className="h-4 w-4" />Verwijderen</Button>}</div>
            <Button type="submit" disabled={loading}><Save className="h-4 w-4" />{loading ? 'Opslaan...' : 'Opslaan'}</Button>
          </CardFooter>
        </Card>
      </form>

      {/* Notities sectie - alleen bij bestaande taken */}
      {!isNew && (
        <div className="mt-6 space-y-4">
          <h3 className="text-sm font-semibold text-gray-900">Notities</h3>

          {/* Notitie invoer */}
          <Card>
            <CardContent className="pt-4 pb-3 space-y-3">
              <textarea
                placeholder="Schrijf een notitie..."
                value={notitieText}
                onChange={e => setNotitieText(e.target.value)}
                rows={2}
                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#00a66e] focus:border-transparent resize-none"
              />
              {notitieText.trim() && (
                <div className="flex gap-2 justify-end">
                  <Button variant="ghost" size="sm" onClick={() => setNotitieText('')}>Annuleren</Button>
                  <Button size="sm" className="bg-[#00a66e] hover:bg-[#008f5f]" onClick={handleSaveNotitie} disabled={loading || !notitieText.trim()}>
                    Opslaan
                  </Button>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Notities tijdlijn */}
          {notities.length === 0 ? (
            <Card>
              <CardContent className="py-8 text-center text-gray-500 text-sm">
                <MessageSquare className="h-8 w-8 mx-auto mb-2 text-gray-300" />
                Nog geen notities voor deze taak
              </CardContent>
            </Card>
          ) : (
            <div className="relative">
              {/* Tijdlijn lijn */}
              <div className="absolute left-4 top-0 bottom-0 w-px bg-gray-200" />

              <div className="space-y-0">
                {notities.map((n, i) => {
                  const datum = new Date(n.created_at)
                  const datumStr = format(datum, "EEEE d MMMM yyyy 'om' HH:mm", { locale: nl })
                  return (
                    <div key={n.id} className="relative pl-10 py-3 group">
                      {/* Tijdlijn dot */}
                      <div className="absolute left-[11px] top-[18px] h-2.5 w-2.5 rounded-full border-2 border-[#00a66e] bg-white z-10" />

                      <div className="flex items-start justify-between gap-3">
                        <div className="flex-1 min-w-0">
                          {/* Gebruiker + datum */}
                          <div className="flex items-baseline gap-2 flex-wrap">
                            <span className="text-sm font-semibold text-gray-900">{n.gebruiker?.naam || 'Onbekend'}</span>
                            <span className="text-xs text-gray-400">{datumStr}</span>
                          </div>
                          {/* Notitietekst */}
                          <p className="text-sm text-gray-700 whitespace-pre-wrap mt-1">{n.tekst}</p>
                        </div>
                        {/* Verwijder knop */}
                        <button
                          type="button"
                          onClick={() => handleDeleteNotitie(n.id)}
                          className="p-1 text-gray-300 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-opacity shrink-0"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </div>

                      {/* Scheidingslijn tussen notities */}
                      {i < notities.length - 1 && <div className="border-b border-gray-100 mt-3" />}
                    </div>
                  )
                })}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
