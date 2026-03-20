'use client'

import { useState, useEffect, useRef } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { FileText, User, FolderOpen, Trash2, Mail, Loader2, Download, X, MoreVertical } from 'lucide-react'
import { formatCurrency } from '@/lib/utils'
import { format } from 'date-fns'
import { nl } from 'date-fns/locale'
import { deleteOfferte, getEmailForOfferte, getEmailAttachments } from '@/lib/actions'

interface ConceptOfferteRaw {
  id: string
  offertenummer: string
  datum: string
  onderwerp: string | null
  totaal: number
  created_at: string
  relatie: { id: string; bedrijfsnaam: string }[] | { id: string; bedrijfsnaam: string } | null
  project: { id: string; naam: string }[] | { id: string; naam: string } | null
}

function normalize(val: { [key: string]: unknown }[] | { [key: string]: unknown } | null) {
  if (!val) return null
  if (Array.isArray(val)) return val[0] || null
  return val
}

interface EmailData {
  id: string
  van_naam: string | null
  van_email: string
  onderwerp: string | null
  body_text: string | null
  body_html: string | null
  datum: string
}

interface AttachmentData {
  filename: string
  contentType: string
  size: number
  data: string
}

export function ConceptOffertesList({ offertes: raw }: { offertes: ConceptOfferteRaw[] }) {
  const router = useRouter()
  const [deleting, setDeleting] = useState<string | null>(null)
  const [menuOpen, setMenuOpen] = useState<string | null>(null)
  const menuRef = useRef<HTMLDivElement>(null)
  const [emailDialog, setEmailDialog] = useState<{ offerteId: string; loading: boolean; email: EmailData | null; attachments: AttachmentData[] | null; error: string | null } | null>(null)

  const offertes = raw.map(o => ({
    ...o,
    relatie: normalize(o.relatie) as { id: string; bedrijfsnaam: string } | null,
    project: normalize(o.project) as { id: string; naam: string } | null,
  }))

  // Close menu on outside click
  useEffect(() => {
    if (!menuOpen) return
    function handleClick(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpen(null)
      }
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [menuOpen])

  async function handleDelete(offerteId: string) {
    setMenuOpen(null)
    if (!window.confirm('Weet u zeker dat u deze concept offerte wilt verwijderen?')) return
    setDeleting(offerteId)
    const result = await deleteOfferte(offerteId)
    if (result.error) {
      alert(result.error)
      setDeleting(null)
    } else {
      router.refresh()
    }
  }

  async function handleOpenEmail(offerteId: string) {
    setMenuOpen(null)
    setEmailDialog({ offerteId, loading: true, email: null, attachments: null, error: null })
    try {
      const email = await getEmailForOfferte(offerteId)
      if (!email) {
        setEmailDialog(prev => prev ? { ...prev, loading: false, error: 'Geen email gevonden voor deze offerte' } : null)
        return
      }
      setEmailDialog(prev => prev ? { ...prev, email, loading: false } : null)
      const attachments = await getEmailAttachments(email.id)
      setEmailDialog(prev => prev ? { ...prev, attachments } : null)
    } catch {
      setEmailDialog(prev => prev ? { ...prev, loading: false, error: 'Fout bij ophalen email' } : null)
    }
  }

  function downloadAttachment(attachment: AttachmentData) {
    const byteCharacters = atob(attachment.data)
    const byteNumbers = new Array(byteCharacters.length)
    for (let i = 0; i < byteCharacters.length; i++) {
      byteNumbers[i] = byteCharacters.charCodeAt(i)
    }
    const byteArray = new Uint8Array(byteNumbers)
    const blob = new Blob([byteArray], { type: attachment.contentType })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = attachment.filename
    a.click()
    URL.revokeObjectURL(url)
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Concept offertes</h1>
          <p className="text-sm text-gray-500 mt-1">
            Offertes die nog afgemaakt en verstuurd moeten worden
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Link href="/offertes">
            <Button variant="secondary" size="sm">
              Alle offertes
            </Button>
          </Link>
          <Link href="/offertes/nieuw">
            <Button size="sm">
              Nieuwe offerte
            </Button>
          </Link>
        </div>
      </div>

      {offertes.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center">
            <FileText className="h-12 w-12 text-gray-300 mx-auto mb-3" />
            <p className="text-gray-500">Geen concept offertes</p>
            <p className="text-sm text-gray-400 mt-1">Nieuwe aanvragen verschijnen hier automatisch</p>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <div className="divide-y divide-gray-100">
            {offertes.map(offerte => (
              <Link
                key={offerte.id}
                href={`/offertes/${offerte.id}?wizard=concept`}
                className="flex items-center gap-4 px-5 py-3.5 hover:bg-gray-50 transition-colors"
              >
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-0.5">
                    <span className="text-sm font-medium text-gray-900 truncate">
                      {offerte.onderwerp || offerte.offertenummer}
                    </span>
                    <Badge status="concept" className="flex-shrink-0 text-[10px]">
                      {offerte.offertenummer}
                    </Badge>
                  </div>
                  <div className="flex items-center gap-3 text-xs text-gray-500">
                    {offerte.relatie && (
                      <span className="flex items-center gap-1">
                        <User className="h-3 w-3" />
                        {offerte.relatie.bedrijfsnaam}
                      </span>
                    )}
                    {offerte.project && (
                      <span className="flex items-center gap-1">
                        <FolderOpen className="h-3 w-3" />
                        {offerte.project.naam}
                      </span>
                    )}
                    <span>{format(new Date(offerte.created_at), 'd MMM yyyy', { locale: nl })}</span>
                  </div>
                </div>

                <div className="flex items-center gap-3 flex-shrink-0">
                  <span className="text-sm font-medium text-gray-700">
                    {offerte.totaal > 0 ? formatCurrency(offerte.totaal) : '—'}
                  </span>
                  <div className="relative" ref={menuOpen === offerte.id ? menuRef : undefined}>
                    <button
                      onClick={(e) => { e.preventDefault(); e.stopPropagation(); setMenuOpen(menuOpen === offerte.id ? null : offerte.id) }}
                      className="p-1.5 rounded-md text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-colors"
                    >
                      {deleting === offerte.id ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <MoreVertical className="h-4 w-4" />
                      )}
                    </button>
                    {menuOpen === offerte.id && (
                      <div className="absolute right-0 top-full mt-1 bg-white border border-gray-200 rounded-lg shadow-lg py-1 z-10 w-44">
                        <button
                          onClick={(e) => { e.preventDefault(); e.stopPropagation(); handleOpenEmail(offerte.id) }}
                          className="flex items-center gap-2 w-full px-3 py-2 text-sm text-gray-700 hover:bg-gray-50 transition-colors"
                        >
                          <Mail className="h-3.5 w-3.5" />
                          Email bekijken
                        </button>
                        <button
                          onClick={(e) => { e.preventDefault(); e.stopPropagation(); handleDelete(offerte.id) }}
                          className="flex items-center gap-2 w-full px-3 py-2 text-sm text-red-600 hover:bg-red-50 transition-colors"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                          Verwijderen
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              </Link>
            ))}
          </div>
        </Card>
      )}

      {/* Email dialog */}
      {emailDialog && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={() => setEmailDialog(null)}>
          <div className="bg-white rounded-xl shadow-xl max-w-2xl w-full mx-4 max-h-[80vh] flex flex-col" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200">
              <h3 className="text-lg font-semibold text-gray-900">Origineel emailbericht</h3>
              <button onClick={() => setEmailDialog(null)} className="text-gray-400 hover:text-gray-600">
                <X className="h-5 w-5" />
              </button>
            </div>
            <div className="flex-1 overflow-y-auto px-6 py-4">
              {emailDialog.loading ? (
                <div className="flex items-center justify-center py-12 text-gray-500">
                  <Loader2 className="h-5 w-5 animate-spin mr-2" />
                  Email ophalen...
                </div>
              ) : emailDialog.error ? (
                <div className="text-center py-12">
                  <Mail className="h-10 w-10 text-gray-300 mx-auto mb-3" />
                  <p className="text-gray-500">{emailDialog.error}</p>
                </div>
              ) : emailDialog.email ? (
                <div className="space-y-4">
                  <div className="space-y-2 text-sm">
                    <div className="flex gap-2">
                      <span className="font-medium text-gray-500 w-16">Van:</span>
                      <span className="text-gray-900">
                        {emailDialog.email.van_naam && <>{emailDialog.email.van_naam} &lt;</>}
                        {emailDialog.email.van_email}
                        {emailDialog.email.van_naam && <>&#62;</>}
                      </span>
                    </div>
                    <div className="flex gap-2">
                      <span className="font-medium text-gray-500 w-16">Datum:</span>
                      <span className="text-gray-900">
                        {format(new Date(emailDialog.email.datum), "d MMMM yyyy 'om' HH:mm", { locale: nl })}
                      </span>
                    </div>
                    {emailDialog.email.onderwerp && (
                      <div className="flex gap-2">
                        <span className="font-medium text-gray-500 w-16">Betreft:</span>
                        <span className="text-gray-900 font-medium">{emailDialog.email.onderwerp}</span>
                      </div>
                    )}
                  </div>

                  <div className="border-t border-gray-200 pt-4">
                    {emailDialog.email.body_html ? (
                      <div
                        className="prose prose-sm max-w-none text-gray-700"
                        dangerouslySetInnerHTML={{ __html: emailDialog.email.body_html }}
                      />
                    ) : emailDialog.email.body_text ? (
                      <pre className="text-sm text-gray-700 whitespace-pre-wrap font-sans leading-relaxed">
                        {emailDialog.email.body_text}
                      </pre>
                    ) : (
                      <p className="text-gray-400 italic">Geen berichtinhoud beschikbaar</p>
                    )}
                  </div>

                  {/* Attachments */}
                  {emailDialog.attachments === null ? (
                    <div className="border-t border-gray-200 pt-4">
                      <div className="flex items-center text-sm text-gray-400">
                        <Loader2 className="h-3.5 w-3.5 animate-spin mr-2" />
                        Bijlages laden...
                      </div>
                    </div>
                  ) : emailDialog.attachments.length > 0 ? (
                    <div className="border-t border-gray-200 pt-4">
                      <h4 className="text-sm font-medium text-gray-700 mb-2">Bijlages ({emailDialog.attachments.length})</h4>
                      <div className="space-y-1.5">
                        {emailDialog.attachments.map((att, i) => (
                          <button
                            key={i}
                            onClick={() => downloadAttachment(att)}
                            className="flex items-center gap-2 w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-md text-sm hover:bg-gray-100 transition-colors"
                          >
                            <Download className="h-4 w-4 text-gray-500 flex-shrink-0" />
                            <span className="text-gray-700 flex-1 text-left truncate">{att.filename}</span>
                            <span className="text-xs text-gray-400">{(att.size / 1024).toFixed(0)} KB</span>
                          </button>
                        ))}
                      </div>
                    </div>
                  ) : null}
                </div>
              ) : null}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
