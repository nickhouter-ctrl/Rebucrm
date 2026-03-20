'use client'

import { useState, useTransition } from 'react'
import Link from 'next/link'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Mail, MailOpen, ArrowDownLeft, ArrowUpRight, Search, RefreshCw, ChevronDown, ChevronUp, ExternalLink, Clock, EyeOff, Eye } from 'lucide-react'
import { format } from 'date-fns'
import { nl } from 'date-fns/locale'
import { getEmails, markEmailGelezen, getEmailBody, reclassifyExistingEmails } from '@/lib/actions'
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
  gelezen: boolean
  labels: string[]
}

interface SyncStatus {
  laatste_sync: string | null
  status: string
  error_bericht: string | null
}

export function EmailView({
  initialEmails,
  initialTotal,
  syncStatus,
}: {
  initialEmails: Email[]
  initialTotal: number
  syncStatus: SyncStatus | null
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

  const filterButtons: { label: string; value: typeof filter }[] = [
    { label: 'Alle', value: 'alle' },
    { label: 'Inkomend', value: 'inkomend' },
    { label: 'Uitgaand', value: 'uitgaand' },
  ]

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900">E-mail</h1>
        <div className="flex items-center gap-3">
          {syncStatus?.laatste_sync && (
            <span className="text-xs text-gray-400 flex items-center gap-1">
              <Clock className="h-3 w-3" />
              Laatste sync: {format(new Date(syncStatus.laatste_sync), 'd MMM HH:mm', { locale: nl })}
            </span>
          )}
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
                              return <div className="prose prose-sm max-w-none text-gray-700" dangerouslySetInnerHTML={{ __html: bodyHtml }} />
                            }
                            return <pre className="whitespace-pre-wrap text-gray-700 font-sans">{bodyText || '(geen inhoud)'}</pre>
                          })()}
                          <div className="flex gap-2 mt-4 pt-3 border-t border-gray-200">
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
    </div>
  )
}
