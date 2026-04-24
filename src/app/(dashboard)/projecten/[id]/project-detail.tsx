'use client'

import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { useState } from 'react'
import { saveProject, deleteProject, duplicateOfferte, deleteOfferte, deleteTaak, deleteFactuur, deleteEmailLog, updateOfferteOnderwerp, getEmailBody, getDocumentUrl, setProjectStatus, factureerVerkoopkans } from '@/lib/actions'
import type { TimelineItem } from '@/lib/actions'
import { useBackNav } from '@/lib/hooks/use-back-nav'
import { EmailLogDialog } from '@/components/email-log-dialog'
import { Receipt } from 'lucide-react'
import { showToast } from '@/components/ui/toast'
import type { ProjectTimeline } from '@/lib/actions'
import { PageHeader } from '@/components/ui/page-header'
import { Card, CardContent, CardFooter } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Select } from '@/components/ui/select'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Dialog } from '@/components/ui/dialog'
import { Pipeline } from '@/components/verkoopkans/pipeline'
import { Timeline } from '@/components/verkoopkans/timeline'
import { formatCurrency, formatDateShort } from '@/lib/utils'
import { Save, Trash2, ArrowLeft, Plus, Pencil, X, User, CalendarDays, Banknote, TrendingUp, Mail, Paperclip, ArrowDownLeft, ArrowUpRight, FileText, Download } from 'lucide-react'
import { RecentTracker } from '@/components/layout/recent-tracker'

interface ProjectEmail {
  id: string
  van_email: string
  van_naam: string | null
  aan_email: string
  onderwerp: string | null
  datum: string
  richting: 'inkomend' | 'uitgaand'
  labels: string[]
}

interface ProjectDocument {
  id: string
  naam: string
  bestandsnaam: string
  bestandstype: string
  bestandsgrootte: number
  storage_path: string
  created_at: string
}

interface VerstuurdeEmail {
  id: string
  aan: string
  onderwerp: string | null
  bijlagen: { filename: string }[] | null
  verstuurd_op: string
  offertenummer?: string | null
}

export function ProjectDetail({ timeline, relaties, isNew, emails = [], documenten = [], verstuurdeEmails = [] }: {
  timeline: ProjectTimeline | null
  relaties: { id: string; bedrijfsnaam: string }[]
  isNew: boolean
  emails?: ProjectEmail[]
  documenten?: ProjectDocument[]
  verstuurdeEmails?: VerstuurdeEmail[]
}) {
  const router = useRouter()
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [editing, setEditing] = useState(false)
  const { navigateBack } = useBackNav(`project-${(timeline?.project?.id as string) || 'nieuw'}`)
  const [openEmailLogId, setOpenEmailLogId] = useState<string | null>(null)
  const [inboxEmailDetail, setInboxEmailDetail] = useState<{
    onderwerp: string | null
    van: string
    aan: string
    datum: string
    body_html: string | null
    body_text: string | null
  } | null>(null)
  const [inboxEmailLoading, setInboxEmailLoading] = useState(false)

  function handleEmailClick(emailLogId: string) {
    setOpenEmailLogId(emailLogId)
  }

  function handleTimelineEdit(item: TimelineItem) {
    if (item.link) router.push(item.link)
  }

  async function handleTimelineDelete(item: TimelineItem) {
    if (!confirm(`Weet je zeker dat je "${item.titel}" wilt verwijderen?`)) return
    let result: { error?: string } = {}
    if (item.type.startsWith('offerte_')) result = await deleteOfferte(item.id)
    else if (item.type.startsWith('factuur_')) result = await deleteFactuur(item.id)
    else if (item.type === 'taak') result = await deleteTaak(item.id)
    else if (item.type === 'email_verstuurd' && item.meta?.emailLogId) result = await deleteEmailLog(item.meta.emailLogId as string)
    if (result.error) setError(result.error)
    else router.refresh()
  }

  async function handleTimelineInlineRename(item: TimelineItem, nieuweTitel: string) {
    if (!item.type.startsWith('offerte_')) return { error: 'Alleen offertes kunnen hernoemd worden' }
    const result = await updateOfferteOnderwerp(item.id, nieuweTitel)
    if (!result.error) router.refresh()
    return result
  }

  async function handleInboxEmailClick(em: ProjectEmail) {
    setInboxEmailLoading(true)
    const body = await getEmailBody(em.id)
    setInboxEmailDetail({
      onderwerp: em.onderwerp,
      van: em.van_naam || em.van_email,
      aan: em.aan_email,
      datum: em.datum,
      body_html: body.html || null,
      body_text: body.text || null,
    })
    setInboxEmailLoading(false)
  }

  const project = timeline?.project

  async function handleSubmit(formData: FormData) {
    if (loading) return // double-submit guard
    setLoading(true); setError('')
    if (project) formData.set('id', project.id as string)
    const result = await saveProject(formData)
    if (result.error) { setError(result.error); setLoading(false); return }
    showToast('Verkoopkans opgeslagen')
    if (isNew) navigateBack('/projecten')
    else { setEditing(false); setLoading(false); router.refresh() }
  }

  async function handleDelete() {
    if (!project || !confirm('Weet u zeker dat u deze verkoopkans wilt verwijderen?')) return
    const result = await deleteProject(project.id as string)
    if (result.error) setError(result.error)
    else navigateBack('/projecten')
  }

  // Nieuw project: toon alleen het formulier
  if (isNew) {
    return (
      <div>
        <PageHeader title="Nieuwe verkoopkans" actions={<Button variant="ghost" onClick={() => router.back()}><ArrowLeft className="h-4 w-4" />Terug</Button>} />
        {error && <div className="bg-red-50 text-red-600 text-sm p-3 rounded-md mb-4">{error}</div>}
        <form action={handleSubmit}>
          <Card>
            <CardContent className="space-y-4 pt-6">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <Input id="naam" name="naam" label="Naam verkoopkans *" required />
                <Select id="relatie_id" name="relatie_id" label="Klant" placeholder="Selecteer klant..." options={relaties.map(r => ({ value: r.id, label: r.bedrijfsnaam }))} />
                <Select id="status" name="status" label="Status" defaultValue="actief" options={[
                  { value: 'actief', label: 'Actief' },
                  { value: 'gewonnen', label: 'Gewonnen' },
                  { value: 'verloren', label: 'Verloren' },
                  { value: 'vervallen', label: 'Vervallen' },
                  { value: 'on_hold', label: 'On hold' },
                  { value: 'afgerond', label: 'Afgerond' },
                  { value: 'geannuleerd', label: 'Geannuleerd' },
                ]} />
                <Input id="budget" name="budget" label="Budget" type="number" step="0.01" />
                <Input id="uurtarief" name="uurtarief" label="Uurtarief" type="number" step="0.01" />
                <Input id="startdatum" name="startdatum" label="Startdatum" type="date" />
                <Input id="einddatum" name="einddatum" label="Einddatum" type="date" />
              </div>
              <div>
                <label htmlFor="omschrijving" className="block text-sm font-medium text-gray-700 mb-1">Omschrijving</label>
                <textarea id="omschrijving" name="omschrijving" rows={3} className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent" />
              </div>
            </CardContent>
            <CardFooter className="flex justify-end">
              <Button type="submit" disabled={loading}><Save className="h-4 w-4" />{loading ? 'Opslaan...' : 'Opslaan'}</Button>
            </CardFooter>
          </Card>
        </form>
      </div>
    )
  }

  if (!project || !timeline) {
    return (
      <div>
        <PageHeader title="Verkoopkans niet gevonden" actions={<Button variant="ghost" onClick={() => router.back()}><ArrowLeft className="h-4 w-4" />Terug</Button>} />
      </div>
    )
  }

  const projectNaam = (project.naam as string) || 'Project'
  const projectStatus = (project.status as string) || 'actief'
  const relatieId = project.relatie_id as string | null
  const relatieNaam = (project.relatie as { bedrijfsnaam: string } | null)?.bedrijfsnaam

  const projectTotaal = (project as Record<string, unknown>).totaal as number | null | undefined

  return (
    <div>
      <RecentTracker
        type="verkoopkans"
        id={project.id as string}
        label={projectNaam}
        sub={relatieNaam || null}
        status={projectStatus}
        bedrag={typeof projectTotaal === 'number' ? projectTotaal : null}
        href={`/projecten/${project.id}`}
      />
      <PageHeader
        title={projectNaam}
        actions={
          <div className="flex gap-2 flex-wrap items-center">
            {projectStatus === 'actief' && (
              <>
                <Button variant="secondary" size="sm" onClick={async () => { await setProjectStatus(project.id as string, 'gewonnen'); router.refresh() }} className="!bg-emerald-50 !text-emerald-700 hover:!bg-emerald-100">
                  Gewonnen
                </Button>
                <Button variant="secondary" size="sm" onClick={async () => { await setProjectStatus(project.id as string, 'verloren'); router.refresh() }} className="!bg-red-50 !text-red-700 hover:!bg-red-100">
                  Verloren
                </Button>
                <Button variant="secondary" size="sm" onClick={async () => { await setProjectStatus(project.id as string, 'vervallen'); router.refresh() }} className="!bg-gray-100 !text-gray-700 hover:!bg-gray-200">
                  Vervallen
                </Button>
              </>
            )}
            {projectStatus !== 'actief' && (
              <Button variant="secondary" size="sm" onClick={async () => { await setProjectStatus(project.id as string, 'actief'); router.refresh() }}>
                Heropenen
              </Button>
            )}
            <Button variant="ghost" onClick={() => router.back()}>
              <ArrowLeft className="h-4 w-4" />
              Terug
            </Button>
          </div>
        }
      />

      {error && <div className="bg-red-50 text-red-600 text-sm p-3 rounded-md mb-4">{error}</div>}

      <div className="flex flex-col lg:flex-row gap-6">
        {/* Zijbalk */}
        <div className="lg:w-72 shrink-0 space-y-4">
          <Card>
            <CardContent className="pt-5">
              {editing ? (
                /* Inline edit form */
                <form action={handleSubmit} className="space-y-3">
                  <Input id="naam" name="naam" label="Naam verkoopkans *" defaultValue={project.naam as string} required />
                  <Select id="relatie_id" name="relatie_id" label="Klant" defaultValue={relatieId || ''} placeholder="Selecteer klant..." options={relaties.map(r => ({ value: r.id, label: r.bedrijfsnaam }))} />
                  <Select id="status" name="status" label="Status" defaultValue={projectStatus} options={[
                    { value: 'actief', label: 'Actief' },
                    { value: 'gewonnen', label: 'Gewonnen' },
                    { value: 'verloren', label: 'Verloren' },
                    { value: 'vervallen', label: 'Vervallen' },
                    { value: 'on_hold', label: 'On hold' },
                    { value: 'afgerond', label: 'Afgerond' },
                    { value: 'geannuleerd', label: 'Geannuleerd' },
                  ]} />
                  <Input id="budget" name="budget" label="Budget" type="number" step="0.01" defaultValue={(project.budget as number) || ''} />
                  <Input id="uurtarief" name="uurtarief" label="Uurtarief" type="number" step="0.01" defaultValue={(project.uurtarief as number) || ''} />
                  <Input id="startdatum" name="startdatum" label="Startdatum" type="date" defaultValue={(project.startdatum as string) || ''} />
                  <Input id="einddatum" name="einddatum" label="Einddatum" type="date" defaultValue={(project.einddatum as string) || ''} />
                  <div>
                    <label htmlFor="omschrijving" className="block text-sm font-medium text-gray-700 mb-1">Omschrijving</label>
                    <textarea id="omschrijving" name="omschrijving" rows={2} defaultValue={(project.omschrijving as string) || ''} className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent" />
                  </div>
                  <div className="flex gap-2 pt-1">
                    <Button type="submit" size="sm" disabled={loading} className="flex-1">
                      <Save className="h-3 w-3" />{loading ? 'Opslaan...' : 'Opslaan'}
                    </Button>
                    <Button type="button" variant="ghost" size="sm" onClick={() => setEditing(false)}>
                      <X className="h-3 w-3" />
                    </Button>
                  </div>
                  <Button type="button" variant="danger" size="sm" onClick={handleDelete} className="w-full">
                    <Trash2 className="h-3 w-3" />Verwijderen
                  </Button>
                </form>
              ) : (
                /* Read-only view */
                <div className="space-y-4">
                  <div className="flex items-start justify-between">
                    <h3 className="text-sm font-semibold text-gray-900">Verkoopkansgegevens</h3>
                    <button onClick={() => setEditing(true)} className="text-gray-400 hover:text-gray-600">
                      <Pencil className="h-3.5 w-3.5" />
                    </button>
                  </div>

                  {/* Klant */}
                  <div className="flex items-center gap-2 text-sm">
                    <User className="h-4 w-4 text-gray-400 shrink-0" />
                    {relatieId ? (
                      <Link href={`/relatiebeheer/${relatieId}`} className="text-primary hover:underline">
                        {relatieNaam}
                      </Link>
                    ) : (
                      <span className="text-gray-500">Geen klant</span>
                    )}
                  </div>

                  {/* Fase */}
                  <div className="flex items-center gap-2">
                    <Badge status={projectStatus} />
                  </div>

                  {/* Planning */}
                  {!!(project.startdatum || project.einddatum) && (
                    <div className="flex items-center gap-2 text-sm text-gray-600">
                      <CalendarDays className="h-4 w-4 text-gray-400 shrink-0" />
                      <span>
                        {project.startdatum ? formatDateShort(project.startdatum as string) : '–'}
                        {' → '}
                        {project.einddatum ? formatDateShort(project.einddatum as string) : '–'}
                      </span>
                    </div>
                  )}

                  {/* Budget */}
                  {!!project.budget && (
                    <div className="flex items-center gap-2 text-sm text-gray-600">
                      <Banknote className="h-4 w-4 text-gray-400 shrink-0" />
                      <span>Budget: {formatCurrency(project.budget as number)}</span>
                    </div>
                  )}

                  {/* Facturatie samenvatting */}
                  <div className="border-t border-gray-100 pt-3 space-y-2">
                    <div className="flex items-center gap-2 mb-2">
                      <TrendingUp className="h-4 w-4 text-gray-400" />
                      <span className="text-sm font-semibold text-gray-900">Facturatie</span>
                    </div>
                    <div className="grid grid-cols-2 gap-2 text-xs">
                      <div className="bg-blue-50 rounded-md p-2">
                        <div className="text-blue-600 font-medium">Geoffreerd</div>
                        <div className="text-blue-900 font-semibold">{formatCurrency(project.geoffreerd)}</div>
                      </div>
                      <div className="bg-purple-50 rounded-md p-2">
                        <div className="text-purple-600 font-medium">Gefactureerd</div>
                        <div className="text-purple-900 font-semibold">{formatCurrency(project.gefactureerd)}</div>
                      </div>
                      <div className="bg-green-50 rounded-md p-2">
                        <div className="text-green-600 font-medium">Betaald</div>
                        <div className="text-green-900 font-semibold">{formatCurrency(project.betaald)}</div>
                      </div>
                      <div className="bg-orange-50 rounded-md p-2">
                        <div className="text-orange-600 font-medium">Openstaand</div>
                        <div className="text-orange-900 font-semibold">{formatCurrency(project.openstaand)}</div>
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Acties */}
          {!editing && (
            <div className="space-y-2">
              <Button
                className="w-full"
                disabled={loading}
                onClick={async () => {
                  if (timeline.laatsteOfferteId) {
                    setLoading(true)
                    const result = await duplicateOfferte(timeline.laatsteOfferteId)
                    if (result.error) { setError(result.error); setLoading(false) }
                    else router.push(`/offertes/${result.id}?wizard=true`)
                  } else {
                    router.push(`/offertes/nieuw?project_id=${project.id}&relatie_id=${relatieId || ''}`)
                  }
                }}
              >
                <Plus className="h-4 w-4" />
                {timeline.laatsteOfferteId ? 'Nieuwe versie offerte' : 'Nieuwe offerte'}
              </Button>

              {/* Factureer-knop: voor verkoopkansen met geaccepteerde offerte of met bedrag */}
              <Button
                className="w-full"
                variant="secondary"
                disabled={loading}
                onClick={async () => {
                  const input = prompt('Factuurbedrag incl. BTW (laat leeg om offerte-totaal te gebruiken):')
                  if (input === null) return
                  const bedrag = input.trim() ? parseFloat(input.replace(',', '.')) : undefined
                  if (input.trim() && (!bedrag || bedrag <= 0)) {
                    alert('Ongeldig bedrag')
                    return
                  }
                  setLoading(true)
                  const result = await factureerVerkoopkans(project.id as string, { bedrag })
                  setLoading(false)
                  if (result.error) { setError(result.error) }
                  else if (result.factuurId) router.push(`/facturatie/${result.factuurId}`)
                }}
              >
                <Receipt className="h-4 w-4" />
                Factuur maken
              </Button>
            </div>
          )}
        </div>

        {/* Rechts: Pipeline + Timeline */}
        <div className="flex-1 min-w-0 space-y-6">
          {/* Pipeline voortgangsbalk */}
          <Card>
            <CardContent className="py-5">
              <Pipeline stages={timeline.pipeline} />
            </CardContent>
          </Card>

          {/* Timeline */}
          <Timeline
            items={timeline.items}
            onEmailClick={handleEmailClick}
            onEdit={handleTimelineEdit}
            onDelete={handleTimelineDelete}
            onInlineRename={handleTimelineInlineRename}
          />

          {/* Verstuurde offerte-mails (via email_log, met bijlagen) */}
          {verstuurdeEmails.length > 0 && (
            <Card>
              <CardContent className="pt-5">
                <div className="flex items-center gap-2 mb-4">
                  <Mail className="h-4 w-4 text-gray-400" />
                  <h3 className="text-sm font-semibold text-gray-900">Verstuurde offerte-mails ({verstuurdeEmails.length})</h3>
                </div>
                <div className="space-y-2">
                  {verstuurdeEmails.map(e => {
                    const bijlagen = e.bijlagen || []
                    return (
                      <div
                        key={e.id}
                        className="rounded-lg border border-gray-200 px-3 py-2 bg-white hover:bg-gray-50 cursor-pointer transition-colors"
                        onClick={() => setOpenEmailLogId(e.id)}
                      >
                        <div className="flex items-center gap-2 text-xs text-gray-500 mb-0.5">
                          <ArrowUpRight className="h-3 w-3 text-green-500" />
                          <span>{formatDateShort(e.verstuurd_op)}</span>
                          <span>·</span>
                          <span className="truncate">naar {e.aan}</span>
                          {e.offertenummer && (
                            <>
                              <span>·</span>
                              <span className="text-primary font-medium">{e.offertenummer}</span>
                            </>
                          )}
                        </div>
                        <div className="text-sm font-medium text-gray-900 truncate">{e.onderwerp || '(geen onderwerp)'}</div>
                        {bijlagen.length > 0 && (
                          <div className="flex flex-wrap gap-1.5 mt-1.5">
                            {bijlagen.map((b, i) => (
                              <span key={i} className="inline-flex items-center gap-1 px-2 py-0.5 bg-blue-50 text-blue-700 text-xs rounded border border-blue-200">
                                <Paperclip className="h-3 w-3" />
                                {b.filename}
                              </span>
                            ))}
                          </div>
                        )}
                      </div>
                    )
                  })}
                </div>
              </CardContent>
            </Card>
          )}

          {/* Gekoppelde emails */}
          {emails.length > 0 && (
            <Card>
              <CardContent className="pt-5">
                <div className="flex items-center gap-2 mb-4">
                  <Mail className="h-4 w-4 text-gray-400" />
                  <h3 className="text-sm font-semibold text-gray-900">E-mails ({emails.length})</h3>
                </div>
                <div className="divide-y divide-gray-100">
                  {emails.map(em => (
                    <button
                      key={em.id}
                      onClick={() => handleInboxEmailClick(em)}
                      className="flex items-center gap-3 py-2.5 w-full text-left hover:bg-gray-50 rounded-md px-2 -mx-2 transition-colors"
                    >
                      {em.richting === 'inkomend' ? (
                        <ArrowDownLeft className="h-3.5 w-3.5 text-blue-500 shrink-0" />
                      ) : (
                        <ArrowUpRight className="h-3.5 w-3.5 text-green-500 shrink-0" />
                      )}
                      <div className="flex-1 min-w-0">
                        <p className="text-sm text-gray-900 truncate">{em.onderwerp || '(geen onderwerp)'}</p>
                        <p className="text-xs text-gray-500 truncate">
                          {em.richting === 'inkomend' ? (em.van_naam || em.van_email) : em.aan_email}
                        </p>
                      </div>
                      <span className="text-xs text-gray-400 shrink-0">
                        {formatDateShort(em.datum)}
                      </span>
                    </button>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}

          {/* Documenten */}
          {documenten.length > 0 && (
            <Card>
              <CardContent className="pt-5">
                <div className="flex items-center gap-2 mb-4">
                  <FileText className="h-4 w-4 text-gray-400" />
                  <h3 className="text-sm font-semibold text-gray-900">Documenten ({documenten.length})</h3>
                </div>
                <div className="divide-y divide-gray-100">
                  {documenten.map(doc => (
                    <button
                      key={doc.id}
                      onClick={async () => {
                        const url = await getDocumentUrl(doc.storage_path)
                        if (url) window.open(url, '_blank')
                      }}
                      className="flex items-center gap-3 py-2.5 w-full text-left hover:bg-gray-50 rounded-md px-2 -mx-2 transition-colors"
                    >
                      <FileText className="h-4 w-4 text-red-500 shrink-0" />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm text-gray-900 truncate">{doc.naam || doc.bestandsnaam}</p>
                        <p className="text-xs text-gray-500">
                          {(doc.bestandsgrootte / 1024).toFixed(0)} KB · {formatDateShort(doc.created_at)}
                        </p>
                      </div>
                      <Download className="h-3.5 w-3.5 text-gray-400 shrink-0" />
                    </button>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      </div>

      {/* Email log detail dialog (vanuit timeline én verstuurde-emails sectie) */}
      <EmailLogDialog emailLogId={openEmailLogId} onClose={() => setOpenEmailLogId(null)} />

      {/* Inbox email detail dialog (vanuit gekoppelde emails) */}
      {inboxEmailLoading && (
        <Dialog open onClose={() => setInboxEmailLoading(false)} title="E-mail laden...">
          <div className="py-8 text-center text-gray-400 animate-pulse">Inhoud laden...</div>
        </Dialog>
      )}
      {inboxEmailDetail && !inboxEmailLoading && (
        <Dialog open onClose={() => setInboxEmailDetail(null)} title={inboxEmailDetail.onderwerp || 'E-mail'}>
          <div className="space-y-4">
            <div className="flex flex-wrap items-center gap-4 text-sm text-gray-600">
              <span>Van: {inboxEmailDetail.van}</span>
              <span>Aan: {inboxEmailDetail.aan}</span>
              <span>{new Date(inboxEmailDetail.datum).toLocaleString('nl-NL')}</span>
            </div>
            {inboxEmailDetail.body_html ? (
              <iframe
                sandbox=""
                srcDoc={inboxEmailDetail.body_html}
                className="w-full border border-gray-200 rounded-lg min-h-[200px] bg-white"
                style={{ height: 'auto' }}
                onLoad={(e) => {
                  const frame = e.target as HTMLIFrameElement
                  if (frame.contentDocument) {
                    frame.style.height = frame.contentDocument.body.scrollHeight + 20 + 'px'
                  }
                }}
              />
            ) : (
              <pre className="whitespace-pre-wrap text-sm text-gray-700 font-sans bg-gray-50 rounded-lg p-4 max-h-[60vh] overflow-auto">
                {inboxEmailDetail.body_text || '(geen inhoud)'}
              </pre>
            )}
          </div>
        </Dialog>
      )}
    </div>
  )
}
