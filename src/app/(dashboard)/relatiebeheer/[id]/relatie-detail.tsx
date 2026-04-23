'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { saveRelatie, deleteRelatie, saveNotitie, deleteNotitie, deleteProject, saveContactpersoon, deleteContactpersoon } from '@/lib/actions'
import { PageHeader } from '@/components/ui/page-header'
import { Card, CardContent, CardFooter } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Select } from '@/components/ui/select'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { formatCurrency, formatDateShort } from '@/lib/utils'
import { format } from 'date-fns'
import { nl } from 'date-fns/locale'
import { ArrowLeft, Save, Trash2, DollarSign, FileText, Receipt, TrendingUp, MessageSquare, Plus, Clock, Bell, X, FolderKanban, Globe, UserPlus, Loader2, ChevronDown, ChevronUp, Phone, Mail, MapPin, CheckSquare, ArrowDownLeft, ArrowUpRight, Download, Pencil } from 'lucide-react'
import { Pipeline } from '@/components/verkoopkans/pipeline'
import type { PipelineStage } from '@/lib/actions'
import { createKlantToegang, deleteKlantToegang } from '@/lib/actions'
import { Dialog } from '@/components/ui/dialog'
import { RecentTracker } from '@/components/layout/recent-tracker'

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
  standaard_marge: number | null
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
  taak?: { id: string; titel: string; taaknummer: string | null } | null
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

interface RelatieEmail {
  id: string
  onderwerp: string | null
  van_naam: string | null
  van_email: string | null
  datum: string
  richting: string | null
}

interface Contactpersoon {
  id: string
  naam: string
  functie: string | null
  email: string | null
  telefoon: string | null
  mobiel: string | null
  is_primair: boolean
  opmerkingen: string | null
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
  contactpersonen?: Contactpersoon[]
  klantAccounts: KlantAccount[]
  relatieTaken?: RelatieTaak[]
  relatieEmails?: RelatieEmail[]
}

export function RelatieDetail({ detail, notities: initialNotities, klantAccounts: initialKlantAccounts, relatieTaken = [], relatieEmails = [], contactpersonen: initialContactpersonen = [] }: Props) {
  const { relatie, offertes, facturen, projecten, stats } = detail
  const router = useRouter()
  type TabKey = 'overzicht' | 'projecten' | 'offertes' | 'facturen' | 'documenten' | 'taken' | 'notities' | 'portaal' | 'gegevens'
  // Initiele tab uit URL ?tab=... zodat back-navigatie de juiste tab laat zien
  const initialTab = (typeof window !== 'undefined' && new URLSearchParams(window.location.search).get('tab') as TabKey) || 'overzicht'
  const [tab, setTabState] = useState<TabKey>(initialTab)
  function setTab(next: TabKey) {
    setTabState(next)
    if (typeof window !== 'undefined') {
      const url = new URL(window.location.href)
      if (next === 'overzicht') url.searchParams.delete('tab')
      else url.searchParams.set('tab', next)
      window.history.replaceState({}, '', url.toString())
    }
  }
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')

  // Notities state
  const [notities, setNotities] = useState(initialNotities)
  const [editNotitieId, setEditNotitieId] = useState<string | null>(null)
  const [editNotitieText, setEditNotitieText] = useState('')

  async function handleEditNotitie(id: string) {
    if (!editNotitieText.trim()) return
    const result = await saveNotitie({ id, relatie_id: relatie.id, tekst: editNotitieText })
    if (result.error) setError(result.error)
    else {
      setNotities(prev => prev.map(n => n.id === id ? { ...n, tekst: editNotitieText } : n))
      setEditNotitieId(null)
      setEditNotitieText('')
    }
  }
  function startEdit(n: Notitie) {
    setEditNotitieId(n.id)
    setEditNotitieText(n.tekst)
  }

  // Contactpersonen state
  const [contactpersonen, setContactpersonen] = useState(initialContactpersonen)
  const [contactDialogOpen, setContactDialogOpen] = useState(false)
  const [contactEdit, setContactEdit] = useState<Contactpersoon | null>(null)
  const [contactForm, setContactForm] = useState({ naam: '', functie: '', email: '', telefoon: '', mobiel: '', is_primair: false, opmerkingen: '' })

  function openNieuwContact() {
    setContactEdit(null)
    setContactForm({ naam: '', functie: '', email: '', telefoon: '', mobiel: '', is_primair: false, opmerkingen: '' })
    setContactDialogOpen(true)
  }
  function openBewerkContact(c: Contactpersoon) {
    setContactEdit(c)
    setContactForm({ naam: c.naam, functie: c.functie || '', email: c.email || '', telefoon: c.telefoon || '', mobiel: c.mobiel || '', is_primair: c.is_primair, opmerkingen: c.opmerkingen || '' })
    setContactDialogOpen(true)
  }
  async function handleSaveContact() {
    if (!contactForm.naam.trim()) return
    const payload = { ...contactForm, relatie_id: relatie.id, ...(contactEdit ? { id: contactEdit.id } : {}) }
    const result = await saveContactpersoon(payload)
    if (result.error) { setError(result.error); return }
    // Optimistic refresh
    if (contactEdit) {
      setContactpersonen(prev => prev.map(c => c.id === contactEdit.id ? { ...c, ...contactForm, id: contactEdit.id, functie: contactForm.functie || null, email: contactForm.email || null, telefoon: contactForm.telefoon || null, mobiel: contactForm.mobiel || null, opmerkingen: contactForm.opmerkingen || null } : c))
    } else {
      setContactpersonen(prev => [...prev, { id: `tmp-${Date.now()}`, ...contactForm, functie: contactForm.functie || null, email: contactForm.email || null, telefoon: contactForm.telefoon || null, mobiel: contactForm.mobiel || null, opmerkingen: contactForm.opmerkingen || null } as Contactpersoon])
    }
    setContactDialogOpen(false)
    router.refresh()
  }
  async function handleDeleteContact(id: string) {
    if (!confirm('Contactpersoon verwijderen?')) return
    const result = await deleteContactpersoon(id, relatie.id)
    if (result.error) setError(result.error)
    else setContactpersonen(prev => prev.filter(c => c.id !== id))
  }

  // Portaal state
  const [klantAccounts, setKlantAccounts] = useState(initialKlantAccounts)
  const [showKlantDialog, setShowKlantDialog] = useState(false)
  const [klantEmail, setKlantEmail] = useState(relatie.email || '')
  const [klantNaam, setKlantNaam] = useState(relatie.contactpersoon || relatie.bedrijfsnaam)
  const [klantWachtwoord, setKlantWachtwoord] = useState('')
  const [klantLoading, setKlantLoading] = useState(false)
  const [expandedProjectIds, setExpandedProjectIds] = useState<Set<string>>(new Set())
  const [showNotitieForm, setShowNotitieForm] = useState(false) // legacy, unused
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

  const openTaken = relatieTaken.filter(t => t.status !== 'afgerond' && t.status !== 'geannuleerd')

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
    { key: 'projecten' as const, label: `Verkoopkansen (${projecten.length})` },
    { key: 'offertes' as const, label: `Offertes (${offertes.length})` },
    { key: 'facturen' as const, label: `Facturen (${facturen.length})` },
    { key: 'documenten' as const, label: 'Documenten' },
    { key: 'taken' as const, label: `Taken (${relatieTaken.length})` },
    { key: 'notities' as const, label: `Notities (${notities.length})` },
    { key: 'portaal' as const, label: `Portaal (${klantAccounts.length})` },
    { key: 'gegevens' as const, label: 'Gegevens' },
  ]

  return (
    <div>
      <RecentTracker
        type="klant"
        id={relatie.id}
        label={relatie.bedrijfsnaam}
        sub={relatie.type.charAt(0).toUpperCase() + relatie.type.slice(1)}
        email={relatie.email}
        telefoon={relatie.telefoon}
        href={`/relatiebeheer/${relatie.id}`}
      />
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
        <div className="space-y-6">
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

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Contactgegevens */}
            <Card>
              <CardContent className="pt-4 pb-3">
                <h3 className="text-sm font-semibold text-gray-900 mb-3 flex items-center gap-2">
                  <Phone className="h-4 w-4 text-gray-400" />
                  Contactgegevens
                </h3>
                <div className="space-y-2 text-sm">
                  {relatie.contactpersoon && (
                    <div className="flex items-center gap-2 text-gray-700">
                      <span className="text-gray-400 w-4 flex justify-center"><UserPlus className="h-3.5 w-3.5" /></span>
                      {relatie.contactpersoon}
                    </div>
                  )}
                  {relatie.telefoon && (
                    <div className="flex items-center gap-2 text-gray-700">
                      <span className="text-gray-400 w-4 flex justify-center"><Phone className="h-3.5 w-3.5" /></span>
                      <a href={`tel:${relatie.telefoon}`} className="hover:text-primary">{relatie.telefoon}</a>
                    </div>
                  )}
                  {relatie.email && (
                    <div className="flex items-center gap-2 text-gray-700">
                      <span className="text-gray-400 w-4 flex justify-center"><Mail className="h-3.5 w-3.5" /></span>
                      <a href={`mailto:${relatie.email}`} className="hover:text-primary truncate">{relatie.email}</a>
                    </div>
                  )}
                  {(relatie.adres || relatie.plaats) && (
                    <div className="flex items-center gap-2 text-gray-700">
                      <span className="text-gray-400 w-4 flex justify-center"><MapPin className="h-3.5 w-3.5" /></span>
                      <span>{[relatie.adres, relatie.postcode, relatie.plaats].filter(Boolean).join(', ')}</span>
                    </div>
                  )}
                  {!relatie.contactpersoon && !relatie.telefoon && !relatie.email && !relatie.adres && !relatie.plaats && (
                    <p className="text-gray-400 text-xs">Geen contactgegevens ingevuld</p>
                  )}
                </div>
              </CardContent>
            </Card>

            {/* Contactpersonen */}
            <Card>
              <CardContent className="pt-4 pb-3">
                <div className="flex items-center justify-between mb-3">
                  <h3 className="text-sm font-semibold text-gray-900 flex items-center gap-2">
                    <UserPlus className="h-4 w-4 text-gray-400" />
                    Contactpersonen
                    <span className="text-xs font-normal text-gray-400">({contactpersonen.length})</span>
                  </h3>
                  <button onClick={openNieuwContact} className="text-xs text-primary hover:underline flex items-center gap-1">
                    <Plus className="h-3 w-3" />Toevoegen
                  </button>
                </div>
                {contactpersonen.length === 0 ? (
                  <p className="text-gray-400 text-xs">Nog geen contactpersonen toegevoegd</p>
                ) : (
                  <div className="space-y-2">
                    {contactpersonen.map(c => (
                      <div key={c.id} className="group flex items-start justify-between gap-2 text-sm border border-gray-100 rounded-md p-2 hover:bg-gray-50">
                        <div className="min-w-0 flex-1">
                          <div className="flex items-baseline gap-2 flex-wrap">
                            <span className="font-medium text-gray-900">{c.naam}</span>
                            {c.is_primair && <span className="text-[10px] bg-[#00a66e]/10 text-[#00a66e] px-1.5 py-0.5 rounded-full">Primair</span>}
                            {c.functie && <span className="text-xs text-gray-500">· {c.functie}</span>}
                          </div>
                          <div className="flex flex-wrap gap-3 text-xs text-gray-500 mt-0.5">
                            {c.email && <a href={`mailto:${c.email}`} className="hover:text-primary inline-flex items-center gap-1"><Mail className="h-3 w-3" />{c.email}</a>}
                            {c.telefoon && <a href={`tel:${c.telefoon}`} className="hover:text-primary inline-flex items-center gap-1"><Phone className="h-3 w-3" />{c.telefoon}</a>}
                            {c.mobiel && <a href={`tel:${c.mobiel}`} className="hover:text-primary inline-flex items-center gap-1"><Phone className="h-3 w-3" />{c.mobiel}</a>}
                          </div>
                        </div>
                        <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                          <button onClick={() => openBewerkContact(c)} className="p-1 text-gray-400 hover:text-gray-700"><Pencil className="h-3.5 w-3.5" /></button>
                          <button onClick={() => handleDeleteContact(c.id)} className="p-1 text-gray-400 hover:text-red-500"><Trash2 className="h-3.5 w-3.5" /></button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Recente emails */}
            <Card>
              <CardContent className="pt-4 pb-3">
                <div className="flex items-center justify-between mb-3">
                  <h3 className="text-sm font-semibold text-gray-900 flex items-center gap-2">
                    <Mail className="h-4 w-4 text-gray-400" />
                    Recente emails
                  </h3>
                  <Link href="/email" className="text-xs text-primary hover:underline">Alle emails</Link>
                </div>
                {relatieEmails.length === 0 ? (
                  <p className="text-gray-400 text-xs">Geen emails</p>
                ) : (
                  <div className="space-y-2">
                    {relatieEmails.slice(0, 3).map(e => (
                      <div key={e.id} className="flex items-start gap-2 text-sm">
                        <span className="mt-0.5 shrink-0">
                          {e.richting === 'inkomend' ? (
                            <ArrowDownLeft className="h-3.5 w-3.5 text-blue-500" />
                          ) : (
                            <ArrowUpRight className="h-3.5 w-3.5 text-green-500" />
                          )}
                        </span>
                        <div className="min-w-0 flex-1">
                          <p className="text-gray-700 truncate">{e.onderwerp || '(geen onderwerp)'}</p>
                          <p className="text-xs text-gray-400">{formatDateShort(e.datum)}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>

          </div>

          {/* Activiteiten (Tribe-stijl): Openstaand (taken) + Gereed (notities + afgeronde taken) */}
          <div className="space-y-4">
            {/* Openstaand */}
            <div>
              <h3 className="text-sm font-semibold text-gray-900 mb-2 flex items-center gap-2">
                Openstaand
                <span className="text-xs font-normal text-gray-400">({openTaken.length})</span>
              </h3>
              {openTaken.length === 0 ? (
                <p className="text-sm text-gray-400 italic">Geen openstaande taken</p>
              ) : (
                <div className="space-y-2">
                  {openTaken.map(t => (
                    <Link key={t.id} href={`/taken/${t.id}`} className="flex items-start gap-2 group">
                      <div className="h-7 w-7 rounded-md flex items-center justify-center shrink-0 mt-0.5 bg-gray-100 text-gray-500">
                        <CheckSquare className="h-3.5 w-3.5" />
                      </div>
                      <div className="flex-1 min-w-0 rounded-lg px-4 py-3 border bg-gray-50 border-gray-200 hover:border-gray-300 transition-colors">
                        <div className="flex items-start justify-between gap-2 mb-1">
                          <div className="flex items-baseline gap-2 flex-wrap text-xs text-gray-500">
                            <span className="font-semibold text-gray-700">Taak</span>
                            <span className="text-gray-600 font-medium">· {t.titel}</span>
                          </div>
                          {t.deadline && (() => {
                            const vandaag = new Date(); vandaag.setHours(0,0,0,0)
                            const dl = new Date(t.deadline); dl.setHours(0,0,0,0)
                            const overschreden = dl < vandaag
                            return (
                              <span className={`text-xs shrink-0 ${overschreden ? 'text-red-600' : 'text-gray-500'}`}>
                                {formatDateShort(t.deadline)}
                              </span>
                            )
                          })()}
                        </div>
                        <div className="flex items-center gap-2 text-xs text-gray-500">
                          <Badge status={t.prioriteit}>{t.prioriteit}</Badge>
                          {t.status && <span>· {t.status}</span>}
                        </div>
                      </div>
                    </Link>
                  ))}
                </div>
              )}
            </div>

            {/* Gereed: notities + afgeronde taken, op datum */}
            <div>
              <h3 className="text-sm font-semibold text-gray-900 mb-2 flex items-center gap-2">
                Gereed
                <span className="text-xs font-normal text-gray-400">({notities.length + relatieTaken.filter(t => t.status === 'afgerond').length})</span>
              </h3>
              {(() => {
                type Item = { id: string; datum: string; kind: 'notitie' | 'taak'; data: Notitie | RelatieTaak }
                const items: Item[] = [
                  ...notities.map(n => ({ id: 'n-' + n.id, datum: n.created_at, kind: 'notitie' as const, data: n })),
                  ...relatieTaken.filter(t => t.status === 'afgerond').map(t => ({ id: 't-' + t.id, datum: t.deadline || '', kind: 'taak' as const, data: t })),
                ]
                items.sort((a, b) => new Date(b.datum).getTime() - new Date(a.datum).getTime())
                if (items.length === 0) return <p className="text-sm text-gray-400 italic">Nog niets afgerond</p>
                return (
                  <div className="space-y-2">
                    {items.map(item => {
                      if (item.kind === 'notitie') {
                        const n = item.data as Notitie
                        const isTaakNot = !!n.taak
                        const datumStr = format(new Date(n.created_at), "d MMMM yyyy 'om' HH:mm", { locale: nl })
                        return (
                          <div key={item.id} className="flex items-start gap-2">
                            <div className={`h-7 w-7 rounded-md flex items-center justify-center shrink-0 mt-0.5 ${isTaakNot ? 'bg-gray-100 text-gray-500' : 'bg-amber-50 text-amber-500'}`}>
                              {isTaakNot ? <CheckSquare className="h-3.5 w-3.5" /> : <MessageSquare className="h-3.5 w-3.5" />}
                            </div>
                            <div className={`flex-1 min-w-0 rounded-lg px-4 py-3 border ${isTaakNot ? 'bg-gray-50 border-gray-200' : 'bg-amber-50 border-amber-100'}`}>
                              <div className="flex items-start justify-between gap-2 mb-1">
                                <div className="flex items-baseline gap-2 flex-wrap text-xs text-gray-500">
                                  <span className={`font-semibold ${isTaakNot ? 'text-gray-700' : 'text-amber-900'}`}>{isTaakNot ? 'Taak' : 'Notitie'}</span>
                                  {isTaakNot && n.taak?.titel && <span className="text-gray-600 font-medium">· {n.taak.titel}</span>}
                                </div>
                                <span className="text-xs text-gray-400 shrink-0">{datumStr}</span>
                              </div>
                              <div className="text-xs text-gray-500 mb-1">{n.gebruiker?.naam || 'Onbekend'}</div>
                              <p className={`text-sm whitespace-pre-wrap ${isTaakNot ? 'text-gray-800' : 'text-amber-900'}`}>{n.tekst}</p>
                            </div>
                          </div>
                        )
                      } else {
                        const t = item.data as RelatieTaak
                        return (
                          <Link key={item.id} href={`/taken/${t.id}`} className="flex items-start gap-2">
                            <div className="h-7 w-7 rounded-md flex items-center justify-center shrink-0 mt-0.5 bg-emerald-50 text-emerald-600">
                              <CheckSquare className="h-3.5 w-3.5" />
                            </div>
                            <div className="flex-1 min-w-0 rounded-lg px-4 py-3 border bg-emerald-50/40 border-emerald-100">
                              <div className="flex items-start justify-between gap-2 mb-1">
                                <div className="flex items-baseline gap-2 flex-wrap text-xs text-gray-500">
                                  <span className="font-semibold text-emerald-700">Taak afgerond</span>
                                  <span className="text-gray-600 font-medium">· {t.titel}</span>
                                </div>
                                {t.deadline && <span className="text-xs text-gray-400 shrink-0">{formatDateShort(t.deadline)}</span>}
                              </div>
                            </div>
                          </Link>
                        )
                      }
                    })}
                  </div>
                )
              })()}
            </div>
          </div>
        </div>
      )}

      {tab === 'projecten' && (
        <div className="space-y-4">
          {projecten.length === 0 ? (
            <Card>
              <CardContent className="py-8 text-center text-gray-500 text-sm">
                <FolderKanban className="h-8 w-8 mx-auto mb-2 text-gray-300" />
                Nog geen verkoopkansen voor deze klant
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
                        <button
                          onClick={async (e) => {
                            e.stopPropagation()
                            if (!confirm(`Weet u zeker dat u "${p.naam}" wilt verwijderen?`)) return
                            const result = await deleteProject(p.id)
                            if (result.error) alert(result.error)
                            else router.refresh()
                          }}
                          className="text-gray-400 hover:text-red-500 transition-colors p-1 rounded"
                          title="Verwijderen"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
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
                  <th className="text-right text-xs font-medium text-gray-500 uppercase px-6 py-3">PDF</th>
                </tr>
              </thead>
              <tbody>
                {offertes.length === 0 ? (
                  <tr><td colSpan={7} className="px-6 py-8 text-center text-gray-500 text-sm">Geen offertes</td></tr>
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
                      <td className="px-6 py-3 text-right" onClick={e => e.stopPropagation()}>
                        <div className="flex items-center justify-end gap-1">
                          <a href={`/api/pdf/offerte/${o.id}`} target="_blank" rel="noopener noreferrer" title="PDF met prijzen">
                            <Button variant="ghost" className="h-7 px-2 text-xs">
                              <Download className="h-3.5 w-3.5" />
                            </Button>
                          </a>
                          <a href={`/api/pdf/offerte/${o.id}?hidePrices=1`} target="_blank" rel="noopener noreferrer" title="PDF zonder prijzen">
                            <Button variant="ghost" className="h-7 px-2 text-xs text-gray-400">
                              <Download className="h-3.5 w-3.5" />
                              <span className="ml-0.5">ZP</span>
                            </Button>
                          </a>
                        </div>
                      </td>
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

      {tab === 'documenten' && (
        <div className="space-y-6">
          {/* Offerte PDFs */}
          <Card>
            <CardContent className="p-0">
              <div className="px-6 py-3 border-b border-gray-200 bg-gray-50">
                <h3 className="text-sm font-medium text-gray-700">Offerte PDFs</h3>
              </div>
              {offertes.length === 0 ? (
                <div className="px-6 py-8 text-center text-gray-500 text-sm">Geen offertes</div>
              ) : (
                <div className="divide-y divide-gray-100">
                  {offertes.map(o => (
                    <div key={o.id} className="px-6 py-3 flex items-center justify-between">
                      <div className="flex items-center gap-3 min-w-0">
                        <FileText className="h-4 w-4 text-gray-400 flex-shrink-0" />
                        <div className="min-w-0">
                          <p className="text-sm font-medium text-gray-900 truncate">
                            {o.offertenummer} v{o.versie_nummer || 1}
                          </p>
                          <p className="text-xs text-gray-500">
                            {formatDateShort(o.datum)} {o.onderwerp ? `— ${o.onderwerp}` : ''} <Badge status={o.status} />
                          </p>
                        </div>
                      </div>
                      <div className="flex items-center gap-2 flex-shrink-0">
                        <a href={`/api/pdf/offerte/${o.id}`} target="_blank" rel="noopener noreferrer">
                          <Button variant="secondary" className="h-8 text-xs">
                            <Download className="h-3.5 w-3.5" />
                            PDF
                          </Button>
                        </a>
                        <a href={`/api/pdf/offerte/${o.id}?hidePrices=1`} target="_blank" rel="noopener noreferrer">
                          <Button variant="ghost" className="h-8 text-xs">
                            <Download className="h-3.5 w-3.5" />
                            Zonder prijzen
                          </Button>
                        </a>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Factuur PDFs */}
          <Card>
            <CardContent className="p-0">
              <div className="px-6 py-3 border-b border-gray-200 bg-gray-50">
                <h3 className="text-sm font-medium text-gray-700">Factuur PDFs</h3>
              </div>
              {facturen.length === 0 ? (
                <div className="px-6 py-8 text-center text-gray-500 text-sm">Geen facturen</div>
              ) : (
                <div className="divide-y divide-gray-100">
                  {facturen.map(f => (
                    <div key={f.id} className="px-6 py-3 flex items-center justify-between">
                      <div className="flex items-center gap-3 min-w-0">
                        <Receipt className="h-4 w-4 text-gray-400 flex-shrink-0" />
                        <div className="min-w-0">
                          <p className="text-sm font-medium text-gray-900 truncate">
                            {f.factuurnummer}
                          </p>
                          <p className="text-xs text-gray-500">
                            {formatDateShort(f.datum)} {f.onderwerp ? `— ${f.onderwerp}` : ''} <Badge status={f.status} />
                          </p>
                        </div>
                      </div>
                      <div className="flex items-center gap-2 flex-shrink-0">
                        <a href={`/api/pdf/factuur/${f.id}`} target="_blank" rel="noopener noreferrer">
                          <Button variant="secondary" className="h-8 text-xs">
                            <Download className="h-3.5 w-3.5" />
                            PDF
                          </Button>
                        </a>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      )}

      {tab === 'taken' && (
        <div className="space-y-4">
          <div className="flex justify-end">
            <Button size="sm" onClick={() => router.push(`/taken/nieuw?relatie_id=${relatie.id}`)}>
              <Plus className="h-4 w-4" />
              Taak aanmaken
            </Button>
          </div>
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
        </div>
      )}

      {tab === 'notities' && (
        <div className="space-y-4">
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
                <div className="flex items-center gap-4">
                  <div className="flex items-center gap-2">
                    <Bell className="h-3.5 w-3.5 text-gray-400" />
                    <input
                      type="date"
                      value={notitieHerinnering}
                      onChange={e => setNotitieHerinnering(e.target.value)}
                      className="px-2 py-1 border border-gray-200 rounded-md text-xs text-gray-600"
                    />
                  </div>
                  <div className="flex gap-2 ml-auto">
                    <Button variant="ghost" size="sm" onClick={() => setNotitieText('')}>Annuleren</Button>
                    <Button size="sm" className="bg-[#00a66e] hover:bg-[#008f5f]" onClick={handleSaveNotitie} disabled={loading || !notitieText.trim()}>
                      Opslaan
                    </Button>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Notities tijdlijn */}
          {notities.length === 0 ? (
            <Card>
              <CardContent className="py-8 text-center text-gray-500 text-sm">
                <MessageSquare className="h-8 w-8 mx-auto mb-2 text-gray-300" />
                Nog geen notities voor deze relatie
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-2">
              {notities.map(n => {
                const datum = new Date(n.created_at)
                const datumStr = format(datum, "d MMMM yyyy 'om' HH:mm", { locale: nl })
                const isTaak = !!n.taak
                return (
                  <div key={n.id} className="flex items-start gap-2 group">
                    {/* Icon */}
                    <div className={`h-7 w-7 rounded-md flex items-center justify-center shrink-0 mt-0.5 ${isTaak ? 'bg-gray-100 text-gray-500' : 'bg-amber-50 text-amber-500'}`}>
                      {isTaak ? <CheckSquare className="h-3.5 w-3.5" /> : <MessageSquare className="h-3.5 w-3.5" />}
                    </div>
                    <div className={`flex-1 min-w-0 rounded-lg px-4 py-3 border ${isTaak ? 'bg-gray-50 border-gray-200' : 'bg-amber-50 border-amber-100'}`}>
                      <div className="flex items-start justify-between gap-2 mb-1">
                        <div className="flex items-baseline gap-2 flex-wrap text-xs text-gray-500">
                          <span className={`font-semibold ${isTaak ? 'text-gray-700' : 'text-amber-900'}`}>{isTaak ? 'Taak' : 'Notitie'}</span>
                          {isTaak && n.taak?.titel && <span className="text-gray-600 font-medium">· {n.taak.titel}</span>}
                          {isTaak && n.taak?.taaknummer && <span className="text-gray-400">({n.taak.taaknummer})</span>}
                        </div>
                        <div className="flex items-center gap-1 shrink-0">
                          <span className="text-xs text-gray-400 mr-1">{datumStr}</span>
                          {!isTaak && editNotitieId !== n.id && (
                            <>
                              <button onClick={() => handleDeleteNotitie(n.id)} className="p-1 text-gray-400 hover:text-red-500 transition-colors" title="Verwijderen">
                                <Trash2 className="h-3.5 w-3.5" />
                              </button>
                              <button onClick={() => startEdit(n)} className="p-1 text-gray-400 hover:text-[#00a66e] transition-colors" title="Bewerken">
                                <Pencil className="h-3.5 w-3.5" />
                              </button>
                            </>
                          )}
                        </div>
                      </div>
                      <div className="text-xs text-gray-500 mb-1">{n.gebruiker?.naam || 'Onbekend'}</div>
                      {editNotitieId === n.id ? (
                        <div className="space-y-2">
                          <textarea value={editNotitieText} onChange={e => setEditNotitieText(e.target.value)} rows={3} className="w-full px-2 py-1.5 border border-gray-300 rounded text-sm focus:outline-none focus:ring-2 focus:ring-[#00a66e]" />
                          <div className="flex gap-2 justify-end">
                            <Button variant="ghost" size="sm" onClick={() => { setEditNotitieId(null); setEditNotitieText('') }}>Annuleren</Button>
                            <Button size="sm" onClick={() => handleEditNotitie(n.id)}>Opslaan</Button>
                          </div>
                        </div>
                      ) : (
                        <p className={`text-sm whitespace-pre-wrap ${isTaak ? 'text-gray-800' : 'text-amber-900'}`}>{n.tekst}</p>
                      )}
                      {n.herinnering_datum && (
                        <span className={`inline-flex items-center gap-1 text-xs mt-2 ${n.herinnering_verstuurd ? 'text-green-600' : 'text-orange-500'}`}>
                          <Bell className="h-3 w-3" />
                          {n.herinnering_verstuurd ? 'Herinnerd' : `Herinnering: ${formatDateShort(n.herinnering_datum)}`}
                        </span>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
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
                <Input id="factuur_email" name="factuur_email" label="Factuur-e-mail (optioneel)" type="email" defaultValue={(relatie as Record<string, unknown>).factuur_email as string || ''} placeholder="Leeg = algemene e-mail gebruiken" />
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
              <div className="border-t border-gray-200 pt-4 mt-4">
                <h3 className="text-sm font-semibold text-gray-900 mb-3">Offerte instellingen</h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <Input
                    id="standaard_marge"
                    name="standaard_marge"
                    label="Standaard marge (%)"
                    type="number"
                    step="0.1"
                    min="0"
                    max="100"
                    defaultValue={relatie.standaard_marge != null ? String(relatie.standaard_marge) : ''}
                    placeholder="Geen standaard marge"
                  />
                </div>
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

      {contactDialogOpen && (
        <Dialog open={contactDialogOpen} onClose={() => setContactDialogOpen(false)} title={contactEdit ? 'Contactpersoon bewerken' : 'Contactpersoon toevoegen'} className="max-w-md">
          <div className="space-y-3">
            <Input id="cp_naam" label="Naam *" value={contactForm.naam} onChange={e => setContactForm(f => ({ ...f, naam: e.target.value }))} required />
            <Input id="cp_functie" label="Functie" value={contactForm.functie} onChange={e => setContactForm(f => ({ ...f, functie: e.target.value }))} />
            <div className="grid grid-cols-2 gap-2">
              <Input id="cp_telefoon" label="Telefoon" value={contactForm.telefoon} onChange={e => setContactForm(f => ({ ...f, telefoon: e.target.value }))} />
              <Input id="cp_mobiel" label="Mobiel" value={contactForm.mobiel} onChange={e => setContactForm(f => ({ ...f, mobiel: e.target.value }))} />
            </div>
            <Input id="cp_email" label="E-mail" type="email" value={contactForm.email} onChange={e => setContactForm(f => ({ ...f, email: e.target.value }))} />
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={contactForm.is_primair} onChange={e => setContactForm(f => ({ ...f, is_primair: e.target.checked }))} className="h-4 w-4 rounded border-gray-300 text-[#00a66e] focus:ring-[#00a66e]" />
              Primaire contactpersoon
            </label>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Opmerkingen</label>
              <textarea rows={2} value={contactForm.opmerkingen} onChange={e => setContactForm(f => ({ ...f, opmerkingen: e.target.value }))} className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-[#00a66e] focus:border-transparent" />
            </div>
            <div className="flex justify-end gap-2 pt-1">
              <Button variant="ghost" onClick={() => setContactDialogOpen(false)}>Annuleren</Button>
              <Button onClick={handleSaveContact} disabled={!contactForm.naam.trim()}>{contactEdit ? 'Opslaan' : 'Toevoegen'}</Button>
            </div>
          </div>
        </Dialog>
      )}
    </div>
  )
}
