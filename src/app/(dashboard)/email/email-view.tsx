'use client'

import { useState, useTransition } from 'react'
import Link from 'next/link'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { ToastContainer, showToast } from '@/components/ui/toast'
import { Mail, MailOpen, ArrowDownLeft, ArrowUpRight, Search, RefreshCw, ChevronDown, ChevronUp, ExternalLink, Clock, EyeOff, Eye, UserPlus, FolderKanban, Megaphone, Send, X, Loader2, Check } from 'lucide-react'
import { format } from 'date-fns'
import { nl } from 'date-fns/locale'
import { getEmails, markEmailGelezen, getEmailBody, reclassifyExistingEmails, assignEmailToMedewerker, linkEmailToProject, getActiveProjectsForEmail, getBroadcastRelatieCount, sendBroadcastEmail, getBroadcastRelaties } from '@/lib/actions'
import { useRouter } from 'next/navigation'

interface Email {
  id: string
  message_id: string | null
  van_email: string
  van_naam: string | null
  aan_email: string
  onderwerp: string | null
  body_text: string | null
  body_html: string | null
  datum: string
  richting: 'inkomend' | 'uitgaand'
  relatie: { id: string; bedrijfsnaam: string } | null
  offerte: { id: string; offertenummer: string } | null
  medewerker: { id: string; naam: string } | null
  gelezen: boolean
  labels: string[]
}

interface SyncStatus {
  laatste_sync: string | null
  status: string
  error_bericht: string | null
}

interface Medewerker {
  id: string
  naam: string
  type: string
  actief: boolean
}

interface Project {
  id: string
  naam: string
}

export function EmailView({
  initialEmails,
  initialTotal,
  syncStatus,
  medewerkers = [],
  projecten = [],
}: {
  initialEmails: Email[]
  initialTotal: number
  syncStatus: SyncStatus | null
  medewerkers?: Medewerker[]
  projecten?: Project[]
}) {
  const router = useRouter()
  const [emails, setEmails] = useState(initialEmails)
  const [total, setTotal] = useState(initialTotal)
  const [filter, setFilter] = useState<'alle' | 'inkomend' | 'uitgaand'>('alle')
  const [zoekterm, setZoekterm] = useState('')
  const [zoekInput, setZoekInput] = useState('')
  const [page, setPage] = useState(1)
  const [expandedEmail, setExpandedEmail] = useState<string | null>(null)
  const [emailBodies, setEmailBodies] = useState<Record<string, { text: string | null; html: string | null; loading?: boolean }>>({})
  const [syncing, setSyncing] = useState(false)
  const [reclassifying, setReclassifying] = useState(false)
  const [toonIrrelevant, setToonIrrelevant] = useState(false)
  const [isPending, startTransition] = useTransition()
  const [assigningEmail, setAssigningEmail] = useState<string | null>(null)
  const [assignStep, setAssignStep] = useState<'medewerker' | 'project'>('medewerker')
  const [selectedMedewerker, setSelectedMedewerker] = useState<string | null>(null)
  const [assignProjecten, setAssignProjecten] = useState<{ id: string; naam: string; status: string }[]>([])
  const [assignLoading, setAssignLoading] = useState(false)
  const [linkingEmail, setLinkingEmail] = useState<string | null>(null)
  const [projectZoek, setProjectZoek] = useState('')

  // Broadcast state
  const [broadcastOpen, setBroadcastOpen] = useState(false)
  const [broadcastOnderwerp, setBroadcastOnderwerp] = useState('')
  const [broadcastBericht, setBroadcastBericht] = useState('')
  const [broadcastType, setBroadcastType] = useState<'alle' | 'zakelijk' | 'particulier' | 'top_klanten' | 'selectie'>('alle')
  const [broadcastAantal, setBroadcastAantal] = useState<number | null>(null)
  const [broadcastLoading, setBroadcastLoading] = useState(false)
  const [broadcastCountLoading, setBroadcastCountLoading] = useState(false)
  const [broadcastRelaties, setBroadcastRelaties] = useState<{ id: string; bedrijfsnaam: string; email: string; type: string }[]>([])
  const [broadcastSelectedIds, setBroadcastSelectedIds] = useState<Set<string>>(new Set())
  const [broadcastRelatieZoek, setBroadcastRelatieZoek] = useState('')
  const [broadcastRelatiesLoaded, setBroadcastRelatiesLoaded] = useState(false)

  const pageSize = 25
  const totalPages = Math.ceil(total / pageSize)

  async function loadEmails(newPage: number, newFilter: typeof filter, newZoekterm: string, showIrrelevant = toonIrrelevant) {
    startTransition(async () => {
      const result = await getEmails(newPage, newFilter, newZoekterm, showIrrelevant)
      setEmails(result.emails as Email[])
      setTotal(result.total)
    })
  }

  function handleFilterChange(newFilter: typeof filter) {
    setFilter(newFilter)
    setPage(1)
    loadEmails(1, newFilter, zoekterm)
  }

  function handleSearch() {
    setZoekterm(zoekInput)
    setPage(1)
    loadEmails(1, filter, zoekInput)
  }

  function handlePageChange(newPage: number) {
    setPage(newPage)
    loadEmails(newPage, filter, zoekterm)
  }

  function handleToggleIrrelevant() {
    const next = !toonIrrelevant
    setToonIrrelevant(next)
    setPage(1)
    loadEmails(1, filter, zoekterm, next)
  }

  async function handleSync() {
    setSyncing(true)
    try {
      await fetch('/api/email/sync', { method: 'POST' })
      router.refresh()
      loadEmails(1, filter, zoekterm)
    } catch {
      // ignore
    }
    setSyncing(false)
  }

  async function handleEmailClick(email: Email) {
    if (expandedEmail === email.id) {
      setExpandedEmail(null)
      return
    }
    setExpandedEmail(email.id)
    if (!email.gelezen) {
      await markEmailGelezen(email.id)
      setEmails(prev => prev.map(e => e.id === email.id ? { ...e, gelezen: true } : e))
    }
    // Load body on-demand if not already loaded
    if (!emailBodies[email.id] && !email.body_text && !email.body_html) {
      setEmailBodies(prev => ({ ...prev, [email.id]: { text: null, html: null, loading: true } }))
      const body = await getEmailBody(email.id)
      setEmailBodies(prev => ({ ...prev, [email.id]: { ...body, loading: false } }))
    }
  }

  async function handleSelectMedewerker(emailId: string, medewerkerId: string) {
    setSelectedMedewerker(medewerkerId)
    setAssignLoading(true)
    // Check of er bestaande verkoopkansen zijn voor deze email's relatie
    const projecten = await getActiveProjectsForEmail(emailId)
    setAssignLoading(false)
    if (projecten.length > 0) {
      setAssignProjecten(projecten)
      setAssignStep('project')
    } else {
      // Geen bestaande projecten → direct toewijzen (maakt automatisch nieuwe aan)
      await finalizeAssign(emailId, medewerkerId, undefined)
    }
  }

  async function finalizeAssign(emailId: string, medewerkerId: string, projectId?: string | 'nieuw') {
    setAssigningEmail(null)
    setAssignStep('medewerker')
    setSelectedMedewerker(null)
    setAssignProjecten([])
    const result = await assignEmailToMedewerker(emailId, medewerkerId, projectId)
    if (result.success) {
      const mw = medewerkers.find(m => m.id === medewerkerId)
      setEmails(prev => prev.map(e => e.id === emailId ? { ...e, gelezen: true, labels: [...(e.labels || []), 'verwerkt'], medewerker: mw ? { id: mw.id, naam: mw.naam } : e.medewerker } : e))
      showToast(`Toegewezen aan ${mw?.naam || 'medewerker'}`)
    }
  }

  async function handleLinkToProject(emailId: string, projectId: string) {
    setLinkingEmail(null)
    setProjectZoek('')
    await linkEmailToProject(emailId, projectId)
    showToast('Gekoppeld aan verkoopkans')
    loadEmails(page, filter, zoekterm)
  }

  async function openBroadcastDialog() {
    setBroadcastOpen(true)
    setBroadcastOnderwerp('')
    setBroadcastBericht('')
    setBroadcastType('alle')
    setBroadcastSelectedIds(new Set())
    setBroadcastRelatieZoek('')
    setBroadcastRelatiesLoaded(false)
    setBroadcastCountLoading(true)
    const count = await getBroadcastRelatieCount('alle')
    setBroadcastAantal(count)
    setBroadcastCountLoading(false)
  }

  async function handleBroadcastTypeChange(type: typeof broadcastType) {
    setBroadcastType(type)
    if (type === 'selectie') {
      // Laad relaties als dat nog niet is gedaan
      if (!broadcastRelatiesLoaded) {
        setBroadcastCountLoading(true)
        const relaties = await getBroadcastRelaties()
        setBroadcastRelaties(relaties)
        setBroadcastRelatiesLoaded(true)
        setBroadcastCountLoading(false)
      }
      setBroadcastAantal(broadcastSelectedIds.size)
    } else {
      setBroadcastCountLoading(true)
      const count = await getBroadcastRelatieCount(type)
      setBroadcastAantal(count)
      setBroadcastCountLoading(false)
    }
  }

  function toggleRelatieSelection(id: string) {
    setBroadcastSelectedIds(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id); else next.add(id)
      setBroadcastAantal(next.size)
      return next
    })
  }

  async function handleSendBroadcast() {
    if (!broadcastOnderwerp.trim() || !broadcastBericht.trim()) return
    const effectiveAantal = broadcastType === 'selectie' ? broadcastSelectedIds.size : broadcastAantal
    if (!effectiveAantal || effectiveAantal === 0) return
    setBroadcastLoading(true)
    const selectedArr = broadcastType === 'selectie' ? [...broadcastSelectedIds] : undefined
    const result = await sendBroadcastEmail(broadcastOnderwerp, broadcastBericht, broadcastType === 'selectie' ? 'alle' : broadcastType, selectedArr)
    setBroadcastLoading(false)
    if (result.success) {
      showToast(`Broadcast verzonden naar ${result.aantalOntvangers} ontvanger(s)`)
      setBroadcastOpen(false)
    } else {
      showToast(result.error || 'Verzenden mislukt')
    }
  }

  const filterButtons: { label: string; value: typeof filter }[] = [
    { label: 'Alle', value: 'alle' },
    { label: 'Inkomend', value: 'inkomend' },
    { label: 'Uitgaand', value: 'uitgaand' },
  ]

  return (
    <div className="space-y-6">
      <ToastContainer />
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900">E-mail</h1>
        <div className="flex items-center gap-3">
          {syncStatus?.laatste_sync && (
            <span className="text-xs text-gray-400 flex items-center gap-1">
              <Clock className="h-3 w-3" />
              Laatste sync: {format(new Date(syncStatus.laatste_sync), 'd MMM HH:mm', { locale: nl })}
            </span>
          )}
          <Button size="sm" variant="secondary" onClick={openBroadcastDialog}>
            <Megaphone className="h-4 w-4" />
            Broadcast
          </Button>
          <Button
            size="sm"
            variant="secondary"
            onClick={async () => {
              setReclassifying(true)
              const result = await reclassifyExistingEmails()
              setReclassifying(false)
              if (result.updated) {
                router.refresh()
                loadEmails(1, filter, zoekterm)
              }
            }}
            disabled={reclassifying}
          >
            {reclassifying ? 'Classificeren...' : 'Herclassificeer'}
          </Button>
          <Button size="sm" variant="secondary" onClick={handleSync} disabled={syncing}>
            <RefreshCw className={`h-4 w-4 ${syncing ? 'animate-spin' : ''}`} />
            {syncing ? 'Synchroniseren...' : 'Sync nu'}
          </Button>
        </div>
      </div>

      {syncStatus?.status === 'error' && syncStatus.error_bericht && (
        <div className="bg-red-50 border border-red-200 rounded-lg px-4 py-3 text-sm text-red-700">
          Sync fout: {syncStatus.error_bericht}
        </div>
      )}

      {/* Filters & zoeken */}
      <div className="flex items-center gap-4">
        <div className="flex gap-1">
          {filterButtons.map(f => (
            <button
              key={f.value}
              onClick={() => handleFilterChange(f.value)}
              className={`px-3 py-1.5 text-sm rounded-md font-medium transition-colors ${
                filter === f.value ? 'bg-primary text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>
        <div className="flex-1 flex gap-2">
          <div className="relative flex-1 max-w-md">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
            <input
              type="text"
              value={zoekInput}
              onChange={(e) => setZoekInput(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
              placeholder="Zoek op onderwerp of afzender..."
              className="w-full pl-9 pr-3 py-1.5 text-sm border border-gray-200 rounded-md focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
            />
          </div>
          <Button size="sm" variant="secondary" onClick={handleSearch}>
            Zoeken
          </Button>
        </div>
        <button
          onClick={handleToggleIrrelevant}
          className={`flex items-center gap-1.5 px-3 py-1.5 text-sm rounded-md font-medium transition-colors shrink-0 ${
            toonIrrelevant ? 'bg-gray-200 text-gray-700' : 'bg-gray-100 text-gray-500 hover:bg-gray-200'
          }`}
        >
          {toonIrrelevant ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
          {toonIrrelevant ? 'Irrelevant verbergen' : 'Toon irrelevant'}
        </button>
      </div>

      {/* Email lijst */}
      <Card>
        <CardContent className="p-0">
          {emails.length === 0 ? (
            <div className="py-12 text-center">
              <Mail className="h-12 w-12 text-gray-300 mx-auto mb-3" />
              <p className="text-gray-500">Geen e-mails gevonden</p>
              <p className="text-sm text-gray-400 mt-1">Synchroniseer om e-mails op te halen</p>
            </div>
          ) : (
            <div className="divide-y divide-gray-100">
              {emails.map(email => {
                const isExpanded = expandedEmail === email.id
                return (
                  <div key={email.id} className={`${!email.gelezen ? 'bg-blue-50/50' : ''}`}>
                    <button
                      onClick={() => handleEmailClick(email)}
                      className="w-full text-left px-4 py-3 hover:bg-gray-50 transition-colors"
                    >
                      <div className="flex items-start gap-3">
                        <div className="mt-0.5">
                          {email.richting === 'inkomend' ? (
                            <ArrowDownLeft className="h-4 w-4 text-blue-500" />
                          ) : (
                            <ArrowUpRight className="h-4 w-4 text-green-500" />
                          )}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <span className={`text-sm truncate ${!email.gelezen ? 'font-semibold text-gray-900' : 'font-medium text-gray-700'}`}>
                              {email.richting === 'inkomend'
                                ? (email.van_naam || email.van_email)
                                : email.aan_email}
                            </span>
                            {!email.gelezen && (
                              <span className="w-2 h-2 rounded-full bg-blue-500 shrink-0" />
                            )}
                          </div>
                          <p className={`text-sm truncate ${!email.gelezen ? 'text-gray-900' : 'text-gray-600'}`}>
                            {email.onderwerp || '(geen onderwerp)'}
                          </p>
                          <div className="flex items-center gap-2 mt-1">
                            {email.relatie && (
                              <span className="inline-flex items-center gap-1 text-xs bg-purple-50 text-purple-700 px-1.5 py-0.5 rounded">
                                {email.relatie.bedrijfsnaam}
                              </span>
                            )}
                            {email.offerte && (
                              <span className="inline-flex items-center gap-1 text-xs bg-blue-50 text-blue-700 px-1.5 py-0.5 rounded">
                                {email.offerte.offertenummer}
                              </span>
                            )}
                            {email.medewerker && (
                              <span className="inline-flex items-center gap-1 text-xs bg-emerald-50 text-emerald-700 px-1.5 py-0.5 rounded">
                                <UserPlus className="h-3 w-3" />
                                {email.medewerker.naam}
                              </span>
                            )}
                            {email.labels?.includes('offerte_aanvraag') && (
                              <span className="inline-flex items-center text-[10px] font-semibold bg-green-100 text-green-700 px-1.5 py-0.5 rounded">
                                Offerte aanvraag
                              </span>
                            )}
                            {email.labels?.includes('offerte_reactie') && (
                              <span className="inline-flex items-center text-[10px] font-semibold bg-blue-100 text-blue-700 px-1.5 py-0.5 rounded">
                                Offerte reactie
                              </span>
                            )}
                            {email.labels?.includes('onzeker') && (
                              <span className="inline-flex items-center text-[10px] font-semibold bg-orange-100 text-orange-700 px-1.5 py-0.5 rounded">
                                Onzeker
                              </span>
                            )}
                            {email.labels?.includes('irrelevant') && (
                              <span className="inline-flex items-center text-[10px] font-semibold bg-gray-100 text-gray-400 px-1.5 py-0.5 rounded">
                                Irrelevant
                              </span>
                            )}
                          </div>
                        </div>
                        <div className="flex items-center gap-2 shrink-0">
                          <span className="text-xs text-gray-400">
                            {format(new Date(email.datum), 'd MMM HH:mm', { locale: nl })}
                          </span>
                          {isExpanded ? <ChevronUp className="h-4 w-4 text-gray-400" /> : <ChevronDown className="h-4 w-4 text-gray-400" />}
                        </div>
                      </div>
                    </button>

                    {isExpanded && (
                      <div className="px-4 pb-4 pl-11">
                        <div className="bg-gray-50 rounded-lg p-4 text-sm">
                          <div className="flex items-center gap-4 text-xs text-gray-500 mb-3 pb-3 border-b border-gray-200">
                            <span>Van: {email.van_naam ? `${email.van_naam} <${email.van_email}>` : email.van_email}</span>
                            <span>Aan: {email.aan_email}</span>
                            <span>{format(new Date(email.datum), 'EEEE d MMMM yyyy HH:mm', { locale: nl })}</span>
                          </div>
                          {(() => {
                            const body = emailBodies[email.id]
                            const bodyHtml = email.body_html || body?.html
                            const bodyText = email.body_text || body?.text
                            if (body?.loading) {
                              return <p className="text-sm text-gray-400 animate-pulse">Inhoud laden...</p>
                            }
                            if (bodyHtml) {
                              return (
                                <iframe
                                  sandbox=""
                                  srcDoc={bodyHtml}
                                  className="w-full border-0 min-h-[200px]"
                                  style={{ height: 'auto' }}
                                  onLoad={(e) => {
                                    const frame = e.target as HTMLIFrameElement
                                    if (frame.contentDocument) {
                                      frame.style.height = frame.contentDocument.body.scrollHeight + 20 + 'px'
                                    }
                                  }}
                                />
                              )
                            }
                            return <pre className="whitespace-pre-wrap text-gray-700 font-sans">{bodyText || '(geen inhoud)'}</pre>
                          })()}
                          <div className="flex gap-2 mt-4 pt-3 border-t border-gray-200 flex-wrap items-start">
                            {email.relatie && (
                              <Link href={`/relatiebeheer/${email.relatie.id}`}>
                                <Button size="sm" variant="secondary">
                                  <ExternalLink className="h-3.5 w-3.5" />
                                  {email.relatie.bedrijfsnaam}
                                </Button>
                              </Link>
                            )}
                            {email.offerte && (
                              <Link href={`/offertes/${email.offerte.id}`}>
                                <Button size="sm" variant="secondary">
                                  <ExternalLink className="h-3.5 w-3.5" />
                                  {email.offerte.offertenummer}
                                </Button>
                              </Link>
                            )}

                            {/* Toewijzen aan medewerker */}
                            <div className="relative">
                              <Button
                                size="sm"
                                variant="secondary"
                                onClick={(e) => { e.stopPropagation(); setAssigningEmail(assigningEmail === email.id ? null : email.id); setAssignStep('medewerker'); setSelectedMedewerker(null); setAssignProjecten([]); setLinkingEmail(null) }}
                              >
                                <UserPlus className="h-3.5 w-3.5" />
                                Toewijzen
                              </Button>
                              {assigningEmail === email.id && (
                                <div className="absolute top-full left-0 mt-1 bg-white border border-gray-200 rounded-lg shadow-lg z-20 min-w-[280px]">
                                  {assignStep === 'medewerker' && (
                                    <>
                                      <div className="px-4 py-2 text-xs font-medium text-gray-500 border-b border-gray-100">Kies medewerker</div>
                                      {assignLoading ? (
                                        <div className="px-4 py-3 text-sm text-gray-400">Laden...</div>
                                      ) : (
                                        medewerkers.filter(m => m.actief).map(m => (
                                          <button
                                            key={m.id}
                                            onClick={(e) => { e.stopPropagation(); handleSelectMedewerker(email.id, m.id) }}
                                            className="block w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-gray-50"
                                          >
                                            {m.naam}
                                          </button>
                                        ))
                                      )}
                                    </>
                                  )}
                                  {assignStep === 'project' && selectedMedewerker && (
                                    <>
                                      <div className="px-4 py-2 text-xs font-medium text-gray-500 border-b border-gray-100">Koppel aan verkoopkans</div>
                                      {assignProjecten.map(p => (
                                        <button
                                          key={p.id}
                                          onClick={(e) => { e.stopPropagation(); finalizeAssign(email.id, selectedMedewerker, p.id) }}
                                          className="block w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-gray-50"
                                        >
                                          <span>{p.naam}</span>
                                          <span className="ml-2 text-xs text-gray-400">{p.status}</span>
                                        </button>
                                      ))}
                                      <button
                                        onClick={(e) => { e.stopPropagation(); finalizeAssign(email.id, selectedMedewerker, 'nieuw') }}
                                        className="block w-full text-left px-4 py-2 text-sm text-primary font-medium hover:bg-gray-50 border-t border-gray-100"
                                      >
                                        + Nieuwe verkoopkans aanmaken
                                      </button>
                                    </>
                                  )}
                                </div>
                              )}
                            </div>

                            {/* Koppelen aan verkoopkans */}
                            <div className="relative">
                              <Button
                                size="sm"
                                variant="secondary"
                                onClick={(e) => { e.stopPropagation(); setLinkingEmail(linkingEmail === email.id ? null : email.id); setAssigningEmail(null); setProjectZoek('') }}
                              >
                                <FolderKanban className="h-3.5 w-3.5" />
                                Koppel aan verkoopkans
                              </Button>
                              {linkingEmail === email.id && (
                                <div className="absolute top-full left-0 mt-1 bg-white border border-gray-200 rounded-lg shadow-lg z-20 min-w-[280px] max-h-[250px] flex flex-col">
                                  <div className="p-2 border-b border-gray-100">
                                    <input
                                      type="text"
                                      placeholder="Zoek verkoopkans..."
                                      value={projectZoek}
                                      onChange={(e) => setProjectZoek(e.target.value)}
                                      onClick={(e) => e.stopPropagation()}
                                      className="w-full px-3 py-1.5 text-sm border border-gray-200 rounded-md focus:outline-none focus:ring-2 focus:ring-primary/20"
                                    />
                                  </div>
                                  <div className="overflow-y-auto">
                                    {projecten
                                      .filter(p => !projectZoek || p.naam.toLowerCase().includes(projectZoek.toLowerCase()))
                                      .slice(0, 20)
                                      .map(p => (
                                        <button
                                          key={p.id}
                                          onClick={(e) => { e.stopPropagation(); handleLinkToProject(email.id, p.id) }}
                                          className="block w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-gray-50"
                                        >
                                          {p.naam}
                                        </button>
                                      ))}
                                  </div>
                                </div>
                              )}
                            </div>
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Paginering */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between">
          <p className="text-sm text-gray-500">
            {total} e-mail{total !== 1 ? 's' : ''} · Pagina {page} van {totalPages}
          </p>
          <div className="flex gap-1">
            <Button
              size="sm"
              variant="secondary"
              disabled={page <= 1 || isPending}
              onClick={() => handlePageChange(page - 1)}
            >
              Vorige
            </Button>
            <Button
              size="sm"
              variant="secondary"
              disabled={page >= totalPages || isPending}
              onClick={() => handlePageChange(page + 1)}
            >
              Volgende
            </Button>
          </div>
        </div>
      )}

      {/* Broadcast dialog */}
      {broadcastOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-lg mx-4">
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200">
              <h2 className="text-lg font-semibold text-gray-900 flex items-center gap-2">
                <Megaphone className="h-5 w-5 text-primary" />
                Broadcast e-mail
              </h2>
              <button onClick={() => setBroadcastOpen(false)} className="text-gray-400 hover:text-gray-600">
                <X className="h-5 w-5" />
              </button>
            </div>
            <div className="px-6 py-4 space-y-4">
              {/* Type filter */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Ontvangers</label>
                <div className="flex gap-1 flex-wrap">
                  {([
                    { value: 'alle' as const, label: 'Alle' },
                    { value: 'zakelijk' as const, label: 'Zakelijk' },
                    { value: 'particulier' as const, label: 'Particulier' },
                    { value: 'top_klanten' as const, label: 'Top klanten' },
                    { value: 'selectie' as const, label: 'Selectie' },
                  ]).map(t => (
                    <button
                      key={t.value}
                      onClick={() => handleBroadcastTypeChange(t.value)}
                      className={`px-3 py-1.5 text-sm rounded-md font-medium transition-colors ${
                        broadcastType === t.value ? 'bg-primary text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                      }`}
                    >
                      {t.label}
                    </button>
                  ))}
                </div>
                <p className="text-xs text-gray-500 mt-1">
                  {broadcastCountLoading ? 'Tellen...' : broadcastType === 'top_klanten'
                    ? `${broadcastAantal ?? 0} top klant(en) met e-mailadres (op basis van omzet)`
                    : `${broadcastAantal ?? 0} ontvanger(s) met e-mailadres`}
                </p>
              </div>

              {/* Klant selectie lijst */}
              {broadcastType === 'selectie' && broadcastRelatiesLoaded && (
                <div>
                  <div className="relative mb-2">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                    <input
                      type="text"
                      value={broadcastRelatieZoek}
                      onChange={e => setBroadcastRelatieZoek(e.target.value)}
                      placeholder="Zoek klant..."
                      className="w-full pl-9 pr-3 py-2 text-sm border border-gray-200 rounded-md focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
                    />
                  </div>
                  <div className="border border-gray-200 rounded-md max-h-[200px] overflow-y-auto">
                    {broadcastRelaties
                      .filter(r => !broadcastRelatieZoek || r.bedrijfsnaam.toLowerCase().includes(broadcastRelatieZoek.toLowerCase()) || r.email.toLowerCase().includes(broadcastRelatieZoek.toLowerCase()))
                      .map(r => (
                        <button
                          key={r.id}
                          onClick={() => toggleRelatieSelection(r.id)}
                          className={`flex items-center gap-2 w-full text-left px-3 py-2 text-sm hover:bg-gray-50 border-b border-gray-50 last:border-0 ${
                            broadcastSelectedIds.has(r.id) ? 'bg-primary/5' : ''
                          }`}
                        >
                          <span className={`flex-shrink-0 w-4 h-4 rounded border flex items-center justify-center ${
                            broadcastSelectedIds.has(r.id) ? 'bg-primary border-primary' : 'border-gray-300'
                          }`}>
                            {broadcastSelectedIds.has(r.id) && <Check className="h-3 w-3 text-white" />}
                          </span>
                          <span className="truncate font-medium text-gray-700">{r.bedrijfsnaam}</span>
                          <span className="truncate text-gray-400 text-xs ml-auto">{r.email}</span>
                          <span className={`text-[10px] px-1.5 py-0.5 rounded ${r.type === 'zakelijk' ? 'bg-blue-50 text-blue-600' : 'bg-orange-50 text-orange-600'}`}>
                            {r.type}
                          </span>
                        </button>
                      ))}
                  </div>
                  {broadcastSelectedIds.size > 0 && (
                    <button
                      onClick={() => { setBroadcastSelectedIds(new Set()); setBroadcastAantal(0) }}
                      className="text-xs text-gray-500 hover:text-gray-700 mt-1"
                    >
                      Selectie wissen
                    </button>
                  )}
                </div>
              )}

              {/* Onderwerp */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Onderwerp</label>
                <input
                  type="text"
                  value={broadcastOnderwerp}
                  onChange={e => setBroadcastOnderwerp(e.target.value)}
                  placeholder="Onderwerp van de e-mail..."
                  className="w-full px-3 py-2 text-sm border border-gray-200 rounded-md focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
                />
              </div>

              {/* Bericht */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Bericht</label>
                <textarea
                  value={broadcastBericht}
                  onChange={e => setBroadcastBericht(e.target.value)}
                  placeholder="Typ je bericht..."
                  rows={6}
                  className="w-full px-3 py-2 text-sm border border-gray-200 rounded-md focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary resize-y"
                />
                <p className="text-xs text-gray-400 mt-1">Wordt opgemaakt in de Rebu e-mail template</p>
              </div>
            </div>
            <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-gray-200 bg-gray-50 rounded-b-xl">
              <Button size="sm" variant="secondary" onClick={() => setBroadcastOpen(false)} disabled={broadcastLoading}>
                Annuleren
              </Button>
              <Button
                size="sm"
                onClick={handleSendBroadcast}
                disabled={broadcastLoading || !broadcastOnderwerp.trim() || !broadcastBericht.trim() || (broadcastType === 'selectie' ? broadcastSelectedIds.size === 0 : broadcastAantal === 0)}
              >
                {broadcastLoading ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Verzenden...
                  </>
                ) : (
                  <>
                    <Send className="h-4 w-4" />
                    Verzenden naar {broadcastType === 'selectie' ? broadcastSelectedIds.size : (broadcastAantal ?? 0)} ontvanger(s)
                  </>
                )}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
