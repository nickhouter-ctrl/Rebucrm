'use client'

import { useEffect, useState } from 'react'
import { Dialog } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { getEmailLogDetail, getEmailBijlageUrl, archiveBijlageFromUpload } from '@/lib/actions'
import { Mail, Paperclip, Loader2, ExternalLink, Upload } from 'lucide-react'
import { format } from 'date-fns'
import { nl } from 'date-fns/locale'

interface EmailLogDetail {
  id: string
  aan: string
  onderwerp: string | null
  body_html: string | null
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  bijlagen: any
  verstuurd_op: string
  offerte_id: string | null
  factuur_id?: string | null
  order_id: string | null
}

interface BijlageMeta {
  filename: string
  storage_path?: string
  kind?: 'offerte_pdf' | 'tekeningen_pdf' | 'factuur_pdf' | 'upload'
}

export function EmailLogDialog({ emailLogId, onClose }: { emailLogId: string | null; onClose: () => void }) {
  const [loading, setLoading] = useState(false)
  const [detail, setDetail] = useState<EmailLogDetail | null>(null)
  const [bijlageLoading, setBijlageLoading] = useState<string | null>(null)
  const [uploadingFor, setUploadingFor] = useState<string | null>(null)
  const [error, setError] = useState('')

  async function reloadDetail(id: string) {
    const d = await getEmailLogDetail(id)
    setDetail(d as EmailLogDetail | null)
  }

  useEffect(() => {
    if (!emailLogId) { setDetail(null); return }
    setLoading(true)
    setError('')
    getEmailLogDetail(emailLogId).then(d => {
      setDetail(d as EmailLogDetail | null)
      setLoading(false)
    })
  }, [emailLogId])

  async function handleReupload(filename: string, file: File) {
    if (!detail) return
    setUploadingFor(filename)
    setError('')
    try {
      const base64 = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader()
        reader.onload = () => resolve((reader.result as string).split(',')[1])
        reader.onerror = () => reject(reader.error)
        reader.readAsDataURL(file)
      })
      const result = await archiveBijlageFromUpload(detail.id, filename, base64)
      if (result.error) setError(result.error)
      else await reloadDetail(detail.id)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Upload mislukt')
    } finally {
      setUploadingFor(null)
    }
  }

  async function openBijlage(b: BijlageMeta) {
    if (!detail) return
    setBijlageLoading(b.filename)
    setError('')
    try {
      // Auto-gegenereerde PDFs: direct via /api/pdf/...
      if (b.kind === 'offerte_pdf' && detail.offerte_id) {
        window.open(`/api/pdf/offerte/${detail.offerte_id}`, '_blank')
        return
      }
      if (b.kind === 'tekeningen_pdf' && detail.offerte_id) {
        window.open(`/api/pdf/offerte/${detail.offerte_id}/tekeningen`, '_blank')
        return
      }
      if (b.kind === 'factuur_pdf' && detail.factuur_id) {
        window.open(`/api/pdf/factuur/${detail.factuur_id}`, '_blank')
        return
      }
      // Fallback-detectie op filename (oude rijen zonder `kind`)
      if (b.filename.startsWith('Offerte-') && detail.offerte_id && !b.storage_path) {
        window.open(`/api/pdf/offerte/${detail.offerte_id}`, '_blank')
        return
      }
      if (b.filename.startsWith('Tekeningen-') && detail.offerte_id && !b.storage_path) {
        window.open(`/api/pdf/offerte/${detail.offerte_id}/tekeningen`, '_blank')
        return
      }
      // User-uploaded: signed URL ophalen
      if (b.storage_path) {
        const res = await getEmailBijlageUrl(detail.id, b.filename)
        if (res.error) { setError(res.error); return }
        window.open(res.url, '_blank')
        return
      }
      setError('Deze bijlage is niet meer beschikbaar (oude mail, niet gearchiveerd).')
    } finally {
      setBijlageLoading(null)
    }
  }

  const open = emailLogId !== null
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const bijlagen = (detail?.bijlagen as any[]) || []

  return (
    <Dialog open={open} onClose={onClose} title="Verstuurde e-mail" className="max-w-3xl">
      {loading ? (
        <div className="flex items-center justify-center py-10 text-gray-500">
          <Loader2 className="h-5 w-5 animate-spin mr-2" />
          Mail ophalen...
        </div>
      ) : !detail ? (
        <p className="text-sm text-gray-500 text-center py-6">Geen gegevens</p>
      ) : (
        <div className="space-y-4">
          {error && <div className="bg-red-50 text-red-600 text-sm p-3 rounded-md">{error}</div>}

          <div className="bg-gray-50 border border-gray-200 rounded-lg p-4 space-y-1">
            <div className="flex items-center gap-2 text-sm">
              <Mail className="h-4 w-4 text-gray-400" />
              <span className="text-gray-500">Aan:</span>
              <span className="font-medium text-gray-900">{detail.aan}</span>
            </div>
            <div className="text-sm">
              <span className="text-gray-500">Onderwerp:</span>{' '}
              <span className="font-medium text-gray-900">{detail.onderwerp || '(geen onderwerp)'}</span>
            </div>
            <div className="text-xs text-gray-400">
              Verstuurd op {format(new Date(detail.verstuurd_op), "d MMMM yyyy 'om' HH:mm", { locale: nl })}
            </div>
          </div>

          {bijlagen.length > 0 && (
            <div>
              <h4 className="text-sm font-semibold text-gray-900 mb-2 flex items-center gap-2">
                <Paperclip className="h-4 w-4 text-gray-400" />
                Bijlagen ({bijlagen.length})
              </h4>
              <div className="space-y-1.5">
                {bijlagen.map((b: BijlageMeta, i: number) => {
                  const loadingThis = bijlageLoading === b.filename
                  const uploadingThis = uploadingFor === b.filename
                  const canOpen = !!b.storage_path
                    || b.kind === 'offerte_pdf' || b.kind === 'tekeningen_pdf' || b.kind === 'factuur_pdf'
                    || (b.filename.startsWith('Offerte-') && detail.offerte_id)
                    || (b.filename.startsWith('Tekeningen-') && detail.offerte_id)
                    || (b.filename.startsWith('Factuur-') && detail.factuur_id)
                  return (
                    <div key={i} className="flex items-center gap-2 px-3 py-2 bg-blue-50 border border-blue-200 rounded-md text-sm">
                      <Paperclip className="h-4 w-4 text-blue-600 flex-shrink-0" />
                      <span className="text-blue-800 flex-1 truncate">{b.filename}</span>
                      {canOpen ? (
                        <button
                          type="button"
                          onClick={() => openBijlage(b)}
                          disabled={loadingThis}
                          className="inline-flex items-center gap-1 px-2 py-1 text-xs font-medium text-blue-700 hover:bg-blue-100 rounded transition-colors"
                          title="Bijlage openen"
                        >
                          {loadingThis ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <ExternalLink className="h-3.5 w-3.5" />}
                          Openen
                        </button>
                      ) : (
                        <label className={`inline-flex items-center gap-1 px-2 py-1 text-xs font-medium rounded cursor-pointer transition-colors ${uploadingThis ? 'text-blue-400 bg-blue-100' : 'text-blue-700 hover:bg-blue-100'}`} title="Alsnog archiveren">
                          {uploadingThis ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Upload className="h-3.5 w-3.5" />}
                          {uploadingThis ? 'Uploaden...' : 'Uploaden'}
                          <input
                            type="file"
                            accept=".pdf,.png,.jpg,.jpeg"
                            className="hidden"
                            disabled={uploadingThis}
                            onChange={e => {
                              const file = e.target.files?.[0]
                              e.target.value = ''
                              if (file) handleReupload(b.filename, file)
                            }}
                          />
                        </label>
                      )}
                    </div>
                  )
                })}
              </div>
              {bijlagen.some((b: BijlageMeta) => !b.storage_path && !b.filename.startsWith('Offerte-') && !b.filename.startsWith('Tekeningen-') && !b.filename.startsWith('Factuur-')) && (
                <p className="text-xs text-gray-500 mt-2">
                  Niet gearchiveerde bijlagen komen uit mails verstuurd vóór de CRM-update.
                  Kies hetzelfde bestand opnieuw om het alsnog op te slaan.
                </p>
              )}
            </div>
          )}

          {detail.body_html ? (
            <div>
              <h4 className="text-sm font-semibold text-gray-900 mb-2">Bericht</h4>
              <div
                className="border border-gray-200 rounded-lg overflow-auto bg-white max-h-[60vh]"
                dangerouslySetInnerHTML={{ __html: detail.body_html }}
              />
            </div>
          ) : (
            <p className="text-sm text-gray-500 italic">Geen tekst opgeslagen</p>
          )}

          <div className="flex justify-end pt-2 border-t border-gray-200">
            <Button variant="ghost" onClick={onClose}>Sluiten</Button>
          </div>
        </div>
      )}
    </Dialog>
  )
}
