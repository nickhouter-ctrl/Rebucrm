'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { saveRelatie, deleteRelatie, saveNotitie, deleteNotitie } from '@/lib/actions'
import { PageHeader } from '@/components/ui/page-header'
import { Card, CardContent, CardFooter } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Select } from '@/components/ui/select'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { formatCurrency, formatDateShort } from '@/lib/utils'
import { ArrowLeft, Save, Trash2, DollarSign, FileText, Receipt, TrendingUp, MessageSquare, Plus, Clock, Bell, X, FolderKanban, Globe, UserPlus, Loader2, ChevronDown, ChevronUp } from 'lucide-react'
import { Pipeline } from '@/components/verkoopkans/pipeline'
import type { PipelineStage } from '@/lib/actions'
import { createKlantToegang, deleteKlantToegang } from '@/lib/actions'
import { Dialog } from '@/components/ui/dialog'

interface RelatieData {
  id: string
  bedrijfsnaam: string
  type: string
  contactpersoon: string | null
  email: string | null
  telefoon: string | null
  adres: string | null
  postcode: string | null
  plaats: string | null
  kvk_nummer: string | null
  btw_nummer: string | null
  iban: string | null
  opmerkingen: string | null
}

interface Offerte {
  id: string
  offertenummer: string
  datum: string
  status: string
  totaal: number
  onderwerp: string | null
  versie_nummer: number | null
  groep_id: string | null
}

interface Factuur {
  id: string
  factuurnummer: string
  datum: string
  status: string
  totaal: number
  betaald_bedrag: number
  onderwerp: string | null
}

interface Notitie {
  id: string
  tekst: string
  herinnering_datum: string | null
  herinnering_verstuurd: boolean
  created_at: string
  gebruiker: { naam: string } | null
}

interface ProjectWithOffertes {
  id: string
  naam: string
  status: string
  offertes: {
    id: string
    offertenummer: string
    versie_nummer: number | null
    datum: string
    status: string
    totaal: number
    facturen?: { id: string; factuur_type: string; status: string }[]
  }[]
}

interface KlantAccount {
  id: string
  profiel: { id: string; naam: string; email: string } | { id: string; naam: string; email: string }[] | null
  created_at: string
}

interface RelatieTaak {
  id: string
  titel: string
  status: string
  prioriteit: string
  deadline: string | null
}

interface Props {
  detail: {
    relatie: RelatieData
    offertes: Offerte[]
    facturen: Factuur[]
    projecten: ProjectWithOffertes[]
    stats: {
      totaleOmzet: number
      openstaand: number
      aantalOffertes: number
      conversiePercentage: number
    }
  }
  notities: Notitie[]
  klantAccounts: KlantAccount[]
  relatieTaken?: RelatieTaak[]
}

export function RelatieDetail({ detail, notities: initialNotities, klantAccounts: initialKlantAccounts, relatieTaken = [] }: Props) {
  const { relatie, offertes, facturen, projecten, stats } = detail
  const router = useRouter()
  const [tab, setTab] = useState<'overzicht' | 'projecten' | 'offertes' | 'facturen' | 'taken' | 'notities' | 'portaal' | 'gegevens'>('overzicht')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')

  // Notities state
  const [notities, setNotities] = useState(initialNotities)

  // Portaal state
  const [klantAccounts, setKlantAccounts] = useState(initialKlantAccounts)
  const [showKlantDialog, setShowKlantDialog] = useState(false)
  const [klantEmail, setKlantEmail] = useState(relatie.email || '')
  const [klantNaam, setKlantNaam] = useState(relatie.contactpersoon || relatie.bedrijfsnaam)
  const [klantWachtwoord, setKlantWachtwoord] = useState('')
  const [klantLoading, setKlantLoading] = useState(false)
  const [expandedProjectIds, setExpandedProjectIds] = useState<Set<string>>(new Set())
  const [showNotitieForm, setShowNotitieForm] = useState(false)
  const [notitieText, setNotitieText] = useState('')
  const [notitieHerinnering, setNotitieHerinnering] = useState(
    new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]
  )

  const statCards = [
    { label: 'Totale omzet', waarde: formatCurrency(stats.totaleOmzet), icon: DollarSign, kleur: 'text-green-600 bg-green-50', tab: 'facturen' as const },
    { label: 'Openstaand', waarde: formatCurrency(stats.openstaand), icon: Receipt, kleur: 'text-orange-600 bg-orange-50', tab: 'facturen' as const },
    { label: 'Offertes', waarde: String(stats.aantalOffertes), icon: FileText, kleur: 'text-blue-600 bg-blue-50', tab: 'offertes' as const },
    { label: 'Conversie', waarde: `${stats.conversiePercentage}%`, icon: TrendingUp, kleur: 'text-purple-600 bg-purple-50', tab: 'projecten' as const },
  ]

  async function handleSave(formData: FormData) {
    setLoading(true); setError(''); setSuccess('')
    formData.set('id', relatie.id)
    const result = await saveRelatie(formData)
    if (result.error) setError(result.error)
    else setSuccess('Gegevens opgeslagen')
    setLoading(false)
  }

  async function handleDelete() {
    if (!confirm('Weet u zeker dat u deze relatie wilt verwijderen?')) return
    const result = await deleteRelatie(relatie.id)
    if (result.error) setError(result.error)
    else router.push('/relatiebeheer')
  }

  async function handleSaveNotitie() {
    if (!notitieText.trim()) return
    setLoading(true)
    const result = await saveNotitie({
      relatie_id: relatie.id,
      tekst: notitieText,
      herinnering_datum: notitieHerinnering ? new Date(notitieHerinnering).toISOString() : undefined,
    })
    if (result.error) {
      setError(result.error)
    } else {
      setNotitieText('')
      setNotitieHerinnering(new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0])
      setShowNotitieForm(false)
      router.refresh()
    }
    setLoading(false)
  }

  async function handleDeleteNotitie(id: string) {
    if (!confirm('Notitie verwijderen?')) return
    const result = await deleteNotitie(id)
    if (result.error) {
      setError(result.error)
    } else {
      setNotities(prev => prev.filter(n => n.id !== id))
    }
  }

  async function handleCreateKlant() {
    if (!klantEmail || !klantNaam || !klantWachtwoord) return
    setKlantLoading(true); setError('')
    const result = await createKlantToegang({
      relatie_id: relatie.id,
      email: klantEmail,
      naam: klantNaam,
      wachtwoord: klantWachtwoord,
    })
    setKlantLoading(false)
    if (result.error) {
      setError(result.error)
    } else {
      setShowKlantDialog(false)
      setKlantWachtwoord('')
      router.refresh()
    }
  }

  async function handleDeleteKlant(id: string) {
    if (!confirm('Klanttoegang verwijderen? De gebruiker kan dan niet meer inloggen.')) return
    const result = await deleteKlantToegang(id)
    if (result.error) setError(result.error)
    else {
      setKlantAccounts(prev => prev.filter(k => k.id !== id))
      router.refresh()
    }
  }

  const tabs = [
    { key: 'overzicht' as const, label: 'Overzicht' },
    { key: 'projecten' as const, label: `Projecten (${projecten.length})` },
    { key: 'offertes' as const, label: `Offertes (${offertes.length})` },
    { key: 'facturen' as const, label: `Facturen (${facturen.length})` },
    { key: 'taken' as const, label: `Taken (${relatieTaken.length})` },
    { key: 'notities' as const, label: `Notities (${notities.length})` },
    { key: 'portaal' as const, label: `Portaal (${klantAccounts.length})` },
    { key: 'gegevens' as const, label: 'Gegevens' },
  ]

  return (
    <div>
      <PageHeader
        title={relatie.bedrijfsnaam}
        description={`${relatie.type.charAt(0).toUpperCase() + relatie.type.slice(1)} ${relatie.plaats ? `- ${relatie.plaats}` : ''}`}
        actions={
          <div className="flex gap-2">
            <Button variant="ghost" onClick={() => router.push('/relatiebeheer')}>
              <ArrowLeft className="h-4 w-4" />
              Terug
            </Button>
            <Button variant="secondary" onClick={() => router.push(`/offertes/nieuw?relatie_id=${relatie.id}`)}>
              <FileText className="h-4 w-4" />
              Offerte aanmaken
            </Button>
          </div>
        }
      />

      {success && <div className="bg-green-50 text-green-600 text-sm p-3 rounded-md mb-4">{success}</div>}
      {error && <div className="bg-red-50 text-red-600 text-sm p-3 rounded-md mb-4">{error}</div>}

      <div className="flex gap-2 mb-6 flex-wrap">
        {tabs.map(t => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`px-4 py-2 text-sm rounded-md transition-colors ${tab === t.key ? 'bg-primary text-white' : 'bg-white text-gray-700 border border-gray-300 hover:bg-gray-50'}`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === 'overzicht' && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          {statCards.map(s => (
            <Card key={s.label} className="cursor-pointer hover:border-primary/50 hover:shadow-md transition-all" onClick={() => setTab(s.tab)}>
              <CardContent className="flex items-center gap-4">
                <div className={`p-3 rounded-lg ${s.kleur}`}>
                  <s.icon className="h-6 w-6" />
                </div>
                <div>
                  <p className="text-sm text-gray-500">{s.label}</p>
                  <p className="text-2xl font-bold text-gray-900">{s.waarde}</p>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {tab === 'projecten' && (
        <div className="space-y-4">
          {projecten.length === 0 ? (
            <Card>
              <CardContent className="py-8 text-center text-gray-500 text-sm">
                <FolderKanban className="h-8 w-8 mx-auto mb-2 text-gray-300" />
                Nog geen projecten voor deze klant
              </CardContent>
            </Card>
          ) : (
            projecten.map(p => {
              const sortedOffertes = [...(p.offertes || [])].sort((a, b) => (b.versie_nummer || 0) - (a.versie_nummer || 0))
              const laatsteOfferte = sortedOffertes[0]
              const oudereVersies = sortedOffertes.slice(1)
              const geoffreerd = laatsteOfferte?.totaal || 0
              const allFacturen = sortedOffertes.flatMap(o => o.facturen || [])
              const heeftOffertes = sortedOffertes.length > 0
              const heeftGeaccepteerd = sortedOffertes.some(o => o.status === 'geaccepteerd')
              const heeftAanbetaling = allFacturen.some(f => (f.factuur_type === 'aanbetaling' || f.factuur_type === 'volledig') && f.status !== 'concept')
              const heeftRestbetaling = allFacturen.some(f => f.factuur_type === 'restbetaling' && f.status !== 'concept')
              const isAfgerond = p.status === 'afgerond'
              const isExpanded = expandedProjectIds.has(p.id)
              const stages: PipelineStage[] = [
                { key: 'contact', label: 'Contact', bereikt: true, actief: false },
                { key: 'offerte', label: 'Offerte', bereikt: heeftOffertes, actief: false },
                { key: 'offerte_akkoord', label: 'Akkoord', bereikt: heeftGeaccepteerd, actief: false },
                { key: 'eerste_factuur', label: '1e Factuur', bereikt: heeftAanbetaling, actief: false },
                { key: 'tweede_factuur', label: '2e Factuur', bereikt: heeftRestbetaling, actief: false },
                { key: 'afgerond', label: 'Afgerond', bereikt: isAfgerond, actief: false },
              ]
              const laatsteBereikte = stages.reduce((idx, s, i) => (s.bereikt ? i : idx), 0)
              stages[laatsteBereikte].actief = true

              return (
                <Card key={p.id}>
                  <div
                    className="px-6 py-4 border-b border-gray-200 cursor-pointer hover:bg-gray-50 transition-colors"
                    onClick={() => router.push(`/projecten/${p.id}`)}
                  >
                    <div className="flex items-center justify-between mb-3">
                      <div className="flex items-center gap-3">
                        <FolderKanban className="h-4 w-4 text-gray-500" />
                        <h3 className="font-semibold text-gray-900">{p.naam}</h3>
                        <Badge status={p.status} />
                      </div>
                      <div className="flex items-center gap-3">
                        {geoffreerd > 0 && (
                          <span className="text-sm font-medium text-gray-700">{formatCurrency(geoffreerd)}</span>
                        )}
                        <span className="text-sm text-gray-500">{sortedOffertes.length} offerte{sortedOffertes.length !== 1 ? 's' : ''}</span>
                      </div>
                    </div>
                    <Pipeline stages={stages} compact />
                  </div>
                  {laatsteOfferte && (
                    <CardContent className="p-0">
                      <table className="w-full">
                        <tbody>
                          <tr
                            className="border-b border-gray-100 last:border-0 hover:bg-gray-50 cursor-pointer"
                            onClick={() => router.push(`/offertes/${laatsteOfferte.id}`)}
                          >
                            <td className="px-6 py-2.5 text-sm font-medium text-primary">{laatsteOfferte.offertenummer}</td>
                            <td className="px-6 py-2.5">
                              <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-gray-100 text-gray-700">
                                v{laatsteOfferte.versie_nummer || 1}
                              </span>
                            </td>
                            <td className="px-6 py-2.5 text-sm text-gray-600">{formatDateShort(laatsteOfferte.datum)}</td>
                            <td className="px-6 py-2.5"><Badge status={laatsteOfferte.status} /></td>
                            <td className="px-6 py-2.5 text-sm text-right font-medium">{formatCurrency(laatsteOfferte.totaal)}</td>
                          </tr>
                          {oudereVersies.length > 0 && (
                            <tr>
                              <td colSpan={5} className="px-6 py-1.5">
                                <button
                                  onClick={(e) => {
                                    e.stopPropagation()
                                    setExpandedProjectIds(prev => {
                                      const next = new Set(prev)
                                      if (next.has(p.id)) next.delete(p.id)
                                      else next.add(p.id)
                                      return next
                                    })
                                  }}
                                  className="flex items-center gap-1 text-xs text-gray-400 hover:text-gray-600 transition-colors"
                                >
                                  {isExpanded ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
                                  {oudereVersies.length} oudere versie{oudereVersies.length !== 1 ? 's' : ''}
                                </button>
                              </td>
                            </tr>
                          )}
                          {isExpanded && oudereVersies.map(o => (
                            <tr
                              key={o.id}
                              className="border-b border-gray-100 last:border-0 hover:bg-gray-50 cursor-pointer bg-gray-50/50"
                              onClick={() => router.push(`/offertes/${o.id}`)}
                            >
                              <td className="px-6 py-2.5 text-sm font-medium text-gray-400">{o.offertenummer}</td>
                              <td className="px-6 py-2.5">
                                <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-gray-100 text-gray-400">
                                  v{o.versie_nummer || 1}
                                </span>
                              </td>
                              <td className="px-6 py-2.5 text-sm text-gray-400">{formatDateShort(o.datum)}</td>
                              <td className="px-6 py-2.5"><Badge status={o.status} /></td>
                              <td className="px-6 py-2.5 text-sm text-right font-medium text-gray-400">{formatCurrency(o.totaal)}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </CardContent>
                  )}
                </Card>
              )
            })
          )}
        </div>
      )}

      {tab === 'offertes' && (
        <Card>
          <CardContent className="p-0">
            <table className="w-full">
              <thead>
                <tr className="border-b border-gray-200 bg-gray-50">
                  <th className="text-left text-xs font-medium text-gray-500 uppercase px-6 py-3">Nummer</th>
                  <th className="text-left text-xs font-medium text-gray-500 uppercase px-6 py-3">Versie</th>
                  <th className="text-left text-xs font-medium text-gray-500 uppercase px-6 py-3">Datum</th>
                  <th className="text-left text-xs font-medium text-gray-500 uppercase px-6 py-3">Onderwerp</th>
                  <th className="text-left text-xs font-medium text-gray-500 uppercase px-6 py-3">Status</th>
                  <th className="text-right text-xs font-medium text-gray-500 uppercase px-6 py-3">Totaal</th>
                </tr>
              </thead>
              <tbody>
                {offertes.length === 0 ? (
                  <tr><td colSpan={6} className="px-6 py-8 text-center text-gray-500 text-sm">Geen offertes</td></tr>
                ) : (
                  offertes.map(o => (
                    <tr key={o.id} className="border-b border-gray-100 hover:bg-gray-50 cursor-pointer" onClick={() => router.push(`/offertes/${o.id}`)}>
                      <td className="px-6 py-3 text-sm font-medium text-primary">{o.offertenummer}</td>
                      <td className="px-6 py-3">
                        <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-gray-100 text-gray-700">
                          v{o.versie_nummer || 1}
                        </span>
                      </td>
                      <td className="px-6 py-3 text-sm text-gray-600">{formatDateShort(o.datum)}</td>
                      <td className="px-6 py-3 text-sm text-gray-600">{o.onderwerp || '-'}</td>
                      <td className="px-6 py-3"><Badge status={o.status} /></td>
                      <td className="px-6 py-3 text-sm text-right font-medium">{formatCurrency(o.totaal)}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </CardContent>
        </Card>
      )}

      {tab === 'facturen' && (
        <Card>
          <CardContent className="p-0">
            <table className="w-full">
              <thead>
                <tr className="border-b border-gray-200 bg-gray-50">
                  <th className="text-left text-xs font-medium text-gray-500 uppercase px-6 py-3">Nummer</th>
                  <th className="text-left text-xs font-medium text-gray-500 uppercase px-6 py-3">Datum</th>
                  <th className="text-left text-xs font-medium text-gray-500 uppercase px-6 py-3">Onderwerp</th>
                  <th className="text-left text-xs font-medium text-gray-500 uppercase px-6 py-3">Status</th>
                  <th className="text-right text-xs font-medium text-gray-500 uppercase px-6 py-3">Totaal</th>
                </tr>
              </thead>
              <tbody>
                {facturen.length === 0 ? (
                  <tr><td colSpan={5} className="px-6 py-8 text-center text-gray-500 text-sm">Geen facturen</td></tr>
                ) : (
                  facturen.map(f => (
                    <tr key={f.id} className="border-b border-gray-100 hover:bg-gray-50 cursor-pointer" onClick={() => router.push(`/facturatie/${f.id}`)}>
                      <td className="px-6 py-3 text-sm font-medium text-primary">{f.factuurnummer}</td>
                      <td className="px-6 py-3 text-sm text-gray-600">{formatDateShort(f.datum)}</td>
                      <td className="px-6 py-3 text-sm text-gray-600">{f.onderwerp || '-'}</td>
                      <td className="px-6 py-3"><Badge status={f.status} /></td>
                      <td className="px-6 py-3 text-sm text-right font-medium">{formatCurrency(f.totaal)}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </CardContent>
        </Card>
      )}

      {tab === 'taken' && (
        <Card>
          <CardContent className="p-0">
            {relatieTaken.length === 0 ? (
              <div className="py-8 text-center text-gray-500 text-sm">Geen taken gekoppeld aan deze relatie</div>
            ) : (
              <table className="w-full">
                <thead><tr className="border-b border-gray-200 text-left text-xs font-medium text-gray-500 uppercase">
                  <th className="px-4 py-3">Titel</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3">Prioriteit</th>
                  <th className="px-4 py-3">Deadline</th>
                </tr></thead>
                <tbody className="divide-y divide-gray-100">
                  {relatieTaken.map(t => (
                    <tr key={t.id} className="hover:bg-gray-50">
                      <td className="px-4 py-3"><Link href={`/taken/${t.id}`} className="text-sm font-medium text-gray-900 hover:text-primary">{t.titel}</Link></td>
                      <td className="px-4 py-3"><Badge status={t.status}>{t.status}</Badge></td>
                      <td className="px-4 py-3"><Badge status={t.prioriteit}>{t.prioriteit}</Badge></td>
                      <td className="px-4 py-3 text-sm text-gray-600">{t.deadline ? new Date(t.deadline).toLocaleDateString('nl-NL') : '-'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </CardContent>
        </Card>
      )}

      {tab === 'notities' && (
        <div className="space-y-4">
          <div className="flex justify-between items-center">
            <h3 className="font-semibold text-gray-900">Notities</h3>
            <Button variant="secondary" size="sm" onClick={() => setShowNotitieForm(true)}>
              <Plus className="h-3 w-3" />
              Nieuwe notitie
            </Button>
          </div>

          {showNotitieForm && (
            <Card>
              <CardContent className="pt-6 space-y-3">
                <textarea
                  placeholder="Schrijf een notitie..."
                  value={notitieText}
                  onChange={e => setNotitieText(e.target.value)}
                  rows={3}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent"
                  autoFocus
                />
                <div className="flex items-center gap-4">
                  <div className="flex items-center gap-2">
                    <Bell className="h-4 w-4 text-gray-400" />
                    <label className="text-sm text-gray-600">Herinnering:</label>
                    <input
                      type="date"
                      value={notitieHerinnering}
                      onChange={e => setNotitieHerinnering(e.target.value)}
                      className="px-2 py-1 border border-gray-300 rounded-md text-sm"
                    />
                  </div>
                  <div className="flex gap-2 ml-auto">
                    <Button variant="ghost" size="sm" onClick={() => setShowNotitieForm(false)}>Annuleren</Button>
                    <Button size="sm" onClick={handleSaveNotitie} disabled={loading || !notitieText.trim()}>
                      <Save className="h-3 w-3" />
                      Opslaan
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          )}

          {notities.length === 0 && !showNotitieForm ? (
            <Card>
              <CardContent className="py-8 text-center text-gray-500 text-sm">
                <MessageSquare className="h-8 w-8 mx-auto mb-2 text-gray-300" />
                Nog geen notities voor deze relatie
              </CardContent>
            </Card>
          ) : (
            notities.map(n => (
              <Card key={n.id}>
                <CardContent className="pt-4 pb-3">
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex-1">
                      <p className="text-sm text-gray-900 whitespace-pre-wrap">{n.tekst}</p>
                      <div className="flex items-center gap-3 mt-2 text-xs text-gray-500">
                        <span>{n.gebruiker?.naam || 'Onbekend'}</span>
                        <span>{formatDateShort(n.created_at)}</span>
                        {n.herinnering_datum && (
                          <span className={`flex items-center gap-1 ${n.herinnering_verstuurd ? 'text-green-600' : 'text-orange-600'}`}>
                            <Clock className="h-3 w-3" />
                            {n.herinnering_verstuurd ? 'Herinnerd' : `Herinnering: ${formatDateShort(n.herinnering_datum)}`}
                          </span>
                        )}
                      </div>
                    </div>
                    <button
                      onClick={() => handleDeleteNotitie(n.id)}
                      className="p-1 text-gray-400 hover:text-red-500 shrink-0"
                    >
                      <X className="h-4 w-4" />
                    </button>
                  </div>
                </CardContent>
              </Card>
            ))
          )}
        </div>
      )}

      {tab === 'portaal' && (
        <div className="space-y-4">
          <div className="flex justify-between items-center">
            <h3 className="font-semibold text-gray-900">Klanttoegang portaal</h3>
            <Button variant="secondary" size="sm" onClick={() => setShowKlantDialog(true)}>
              <UserPlus className="h-3 w-3" />
              Klanttoegang aanmaken
            </Button>
          </div>

          {klantAccounts.length === 0 ? (
            <Card>
              <CardContent className="py-8 text-center text-gray-500 text-sm">
                <Globe className="h-8 w-8 mx-auto mb-2 text-gray-300" />
                <p>Geen klantaccounts voor deze relatie.</p>
                <p className="text-xs text-gray-400 mt-1">Maak een account aan zodat de klant offertes, orders en berichten kan bekijken.</p>
              </CardContent>
            </Card>
          ) : (
            klantAccounts.map(k => (
              <Card key={k.id}>
                <CardContent className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium text-gray-900">{(k.profiel as { naam: string } | null)?.naam || 'Onbekend'}</p>
                    <p className="text-xs text-gray-500">{(k.profiel as { email: string } | null)?.email || ''}</p>
                    <p className="text-xs text-gray-400 mt-1">Aangemaakt: {formatDateShort(k.created_at)}</p>
                  </div>
                  <Button variant="danger" size="sm" onClick={() => handleDeleteKlant(k.id)}>
                    <Trash2 className="h-3 w-3" />
                    Verwijderen
                  </Button>
                </CardContent>
              </Card>
            ))
          )}

          {showKlantDialog && (
            <Dialog open={showKlantDialog} onClose={() => setShowKlantDialog(false)} title="Klanttoegang aanmaken" className="max-w-md">
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Naam</label>
                  <input
                    type="text"
                    value={klantNaam}
                    onChange={e => setKlantNaam(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">E-mailadres</label>
                  <input
                    type="email"
                    value={klantEmail}
                    onChange={e => setKlantEmail(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Wachtwoord</label>
                  <input
                    type="text"
                    value={klantWachtwoord}
                    onChange={e => setKlantWachtwoord(e.target.value)}
                    placeholder="Minimaal 6 tekens"
                    className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent"
                  />
                </div>
                <div className="flex justify-end gap-2 pt-2">
                  <Button variant="ghost" onClick={() => setShowKlantDialog(false)}>Annuleren</Button>
                  <Button onClick={handleCreateKlant} disabled={klantLoading || !klantEmail || !klantNaam || klantWachtwoord.length < 6}>
                    {klantLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <UserPlus className="h-4 w-4" />}
                    {klantLoading ? 'Aanmaken...' : 'Account aanmaken'}
                  </Button>
                </div>
              </div>
            </Dialog>
          )}
        </div>
      )}

      {tab === 'gegevens' && (
        <form action={handleSave}>
          <Card>
            <CardContent className="space-y-4 pt-6">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <Input id="bedrijfsnaam" name="bedrijfsnaam" label="Bedrijfsnaam *" defaultValue={relatie.bedrijfsnaam} required />
                <Select
                  id="type"
                  name="type"
                  label="Type *"
                  defaultValue={relatie.type}
                  options={[
                    { value: 'particulier', label: 'Particulier' },
                    { value: 'zakelijk', label: 'Zakelijk' },
                  ]}
                />
                <Input id="contactpersoon" name="contactpersoon" label="Contactpersoon" defaultValue={relatie.contactpersoon || ''} />
                <Input id="email" name="email" label="E-mail" type="email" defaultValue={relatie.email || ''} />
                <Input id="telefoon" name="telefoon" label="Telefoon" defaultValue={relatie.telefoon || ''} />
                <Input id="adres" name="adres" label="Adres" defaultValue={relatie.adres || ''} />
                <Input id="postcode" name="postcode" label="Postcode" defaultValue={relatie.postcode || ''} />
                <Input id="plaats" name="plaats" label="Plaats" defaultValue={relatie.plaats || ''} />
                <Input id="kvk_nummer" name="kvk_nummer" label="KVK-nummer" defaultValue={relatie.kvk_nummer || ''} />
                <Input id="btw_nummer" name="btw_nummer" label="BTW-nummer" defaultValue={relatie.btw_nummer || ''} />
                <Input id="iban" name="iban" label="IBAN" defaultValue={relatie.iban || ''} />
              </div>
              <div>
                <label htmlFor="opmerkingen" className="block text-sm font-medium text-gray-700 mb-1">Opmerkingen</label>
                <textarea
                  id="opmerkingen"
                  name="opmerkingen"
                  rows={3}
                  defaultValue={relatie.opmerkingen || ''}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent"
                />
              </div>
            </CardContent>
            <CardFooter className="flex justify-between">
              <Button type="button" variant="danger" onClick={handleDelete}>
                <Trash2 className="h-4 w-4" />
                Verwijderen
              </Button>
              <Button type="submit" disabled={loading}>
                <Save className="h-4 w-4" />
                {loading ? 'Opslaan...' : 'Opslaan'}
              </Button>
            </CardFooter>
          </Card>
        </form>
      )}
    </div>
  )
}
