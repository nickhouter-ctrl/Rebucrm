'use client'

import { useState, useEffect } from 'react'
import { getOfferteEmailDefaults, sendOfferteEmail } from '@/lib/actions'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { RichTextEditor, plainTextToHtml } from '@/components/ui/rich-text-editor'
import { Send, Download, Mail, Paperclip, Plus, X, Loader2, CheckCircle, Link2, ArrowLeft, FileText } from 'lucide-react'

export function StapVersturen({
  offerteId,
  offerteType,
  onBack,
  onDone,
}: {
  offerteId: string
  offerteType?: 'particulier' | 'zakelijk' | null
  onBack: () => void
  onDone: () => void
}) {
  const [loading, setLoading] = useState(true)
  const [sending, setSending] = useState(false)
  const [emailTo, setEmailTo] = useState('')
  const [emailSubject, setEmailSubject] = useState('')
  const [emailBody, setEmailBody] = useState('')
  const [emailAttachments, setEmailAttachments] = useState<File[]>([])
  const [sent, setSent] = useState(false)
  const [sentLink, setSentLink] = useState('')
  const [error, setError] = useState('')

  useEffect(() => {
    getOfferteEmailDefaults(offerteId).then(defaults => {
      if (defaults.error) {
        setError(defaults.error)
      } else {
        setEmailTo(defaults.to || '')
        setEmailSubject(defaults.subject || '')
        setEmailBody(plainTextToHtml(defaults.body || ''))
      }
      setLoading(false)
    })
  }, [offerteId])

  async function handleSendEmail() {
    setSending(true)
    setError('')

    const extraBijlagen: { filename: string; content: string }[] = []
    for (const file of emailAttachments) {
      const base64 = await new Promise<string>((resolve) => {
        const reader = new FileReader()
        reader.onload = () => {
          const result = reader.result as string
          resolve(result.split(',')[1])
        }
        reader.readAsDataURL(file)
      })
      extraBijlagen.push({ filename: file.name, content: base64 })
    }

    const result = await sendOfferteEmail(offerteId, {
      to: emailTo,
      subject: emailSubject,
      body: emailBody,
      extraBijlagen: extraBijlagen.length > 0 ? extraBijlagen : undefined,
    })

    setSending(false)

    if (result.error) {
      setError(result.error)
      if (result.link) setSentLink(result.link)
    } else {
      setSent(true)
      if (result.link) setSentLink(result.link)
    }
  }

  function handleFileUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files || [])
    setEmailAttachments(prev => [...prev, ...files])
    e.target.value = ''
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16 text-gray-500">
        <Loader2 className="h-5 w-5 animate-spin mr-2" />
        Email voorbereiden...
      </div>
    )
  }

  if (sent) {
    return (
      <div className="max-w-2xl mx-auto text-center py-8">
        <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-green-100 mb-4">
          <CheckCircle className="h-8 w-8 text-green-600" />
        </div>
        <h2 className="text-xl font-semibold text-gray-900 mb-2">Offerte verstuurd!</h2>
        <p className="text-gray-600 mb-6">De offerte is succesvol verzonden naar {emailTo}</p>

        {sentLink && (
          <div className="bg-gray-50 rounded-lg p-4 mb-6 inline-block">
            <p className="text-xs text-gray-500 mb-2">Publieke link voor de klant:</p>
            <div className="flex items-center gap-2">
              <input readOnly value={sentLink} className="text-xs bg-white border rounded px-3 py-1.5 w-80" />
              <Button variant="ghost" size="sm" onClick={() => navigator.clipboard.writeText(sentLink)}>
                <Link2 className="h-3 w-3" />
                Kopieer
              </Button>
            </div>
          </div>
        )}

        <div className="flex gap-3 justify-center flex-wrap">
          <a href={`/api/pdf/offerte/${offerteId}`} target="_blank" rel="noopener noreferrer">
            <Button variant="secondary">
              <Download className="h-4 w-4" />
              PDF downloaden
            </Button>
          </a>
          {offerteType === 'zakelijk' && (
            <a href={`/api/pdf/offerte/${offerteId}/tekeningen`} target="_blank" rel="noopener noreferrer">
              <Button variant="secondary">
                <FileText className="h-4 w-4" />
                Tekeningen PDF (zonder prijzen)
              </Button>
            </a>
          )}
          <Button onClick={onDone}>
            Ga naar offertes
          </Button>
        </div>
      </div>
    )
  }

  return (
    <div className="max-w-3xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-xl font-semibold text-gray-900">Offerte versturen</h2>
          <p className="text-sm text-gray-500 mt-1">Controleer de PDF en verstuur de offerte per email</p>
        </div>
        <Button variant="ghost" onClick={onBack}>
          <ArrowLeft className="h-4 w-4" />
          Terug
        </Button>
      </div>

      {error && <div className="bg-red-50 text-red-600 text-sm p-3 rounded-md mb-4">{error}</div>}

      {/* PDF Preview/Download */}
      <Card className="mb-4">
        <CardContent className="pt-6">
          <h3 className="font-semibold text-gray-900 mb-3">PDF controleren</h3>
          <div className="flex items-center gap-4 bg-gray-50 rounded-lg p-4">
            <Download className="h-8 w-8 text-gray-400" />
            <div className="flex-1">
              <p className="text-sm font-medium text-gray-900">Offerte PDF</p>
              <p className="text-xs text-gray-500">Download en controleer de offerte voordat je verstuurt</p>
            </div>
            <a href={`/api/pdf/offerte/${offerteId}`} target="_blank" rel="noopener noreferrer">
              <Button variant="secondary">
                <Download className="h-4 w-4" />
                PDF bekijken
              </Button>
            </a>
          </div>
        </CardContent>
      </Card>

      {/* Tekeningen PDF (zakelijk only) */}
      {offerteType === 'zakelijk' && (
        <Card className="mb-4">
          <CardContent className="pt-6">
            <h3 className="font-semibold text-gray-900 mb-3">Tekeningen PDF (zonder prijzen)</h3>
            <div className="flex items-center gap-4 bg-orange-50 border border-orange-200 rounded-lg p-4">
              <FileText className="h-8 w-8 text-orange-500" />
              <div className="flex-1">
                <p className="text-sm font-medium text-gray-900">Tekeningen-only PDF</p>
                <p className="text-xs text-gray-500">PDF met alleen kozijntekeningen en specificaties, zonder prijzen. Geschikt om door te sturen naar de eindklant.</p>
              </div>
              <a href={`/api/pdf/offerte/${offerteId}/tekeningen`} target="_blank" rel="noopener noreferrer">
                <Button variant="secondary">
                  <Download className="h-4 w-4" />
                  Tekeningen PDF
                </Button>
              </a>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Email compose */}
      <Card>
        <CardContent className="pt-6 space-y-4">
          <h3 className="font-semibold text-gray-900">Email samenstellen</h3>

          <div>
            <label htmlFor="email_to" className="block text-sm font-medium text-gray-700 mb-1">
              <Mail className="h-3.5 w-3.5 inline mr-1" />
              Aan
            </label>
            <input
              id="email_to"
              type="email"
              value={emailTo}
              onChange={e => setEmailTo(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent"
              placeholder="E-mailadres ontvanger"
            />
          </div>

          <div>
            <label htmlFor="email_subject" className="block text-sm font-medium text-gray-700 mb-1">Onderwerp</label>
            <input
              id="email_subject"
              type="text"
              value={emailSubject}
              onChange={e => setEmailSubject(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Bericht</label>
            <RichTextEditor value={emailBody} onChange={setEmailBody} minHeight={240} />
            <p className="text-xs text-gray-400 mt-1">De acceptatielink en handtekening worden automatisch onder het bericht geplaatst.</p>
          </div>

          {/* Bijlagen */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              <Paperclip className="h-3.5 w-3.5 inline mr-1" />
              Bijlagen
            </label>
            <div className="space-y-2">
              <div className="flex items-center gap-2 px-3 py-2 bg-blue-50 border border-blue-200 rounded-md text-sm">
                <Download className="h-4 w-4 text-blue-600 flex-shrink-0" />
                <span className="text-blue-800 flex-1">Offerte PDF</span>
                <span className="text-xs text-blue-500">Automatisch bijgevoegd</span>
              </div>

              {emailAttachments.map((file, i) => (
                <div key={i} className="flex items-center gap-2 px-3 py-2 bg-gray-50 border border-gray-200 rounded-md text-sm">
                  <Paperclip className="h-4 w-4 text-gray-500 flex-shrink-0" />
                  <span className="text-gray-700 flex-1 truncate">{file.name}</span>
                  <span className="text-xs text-gray-400">{(file.size / 1024).toFixed(0)} KB</span>
                  <button type="button" onClick={() => setEmailAttachments(prev => prev.filter((_, idx) => idx !== i))} className="text-gray-400 hover:text-red-500">
                    <X className="h-4 w-4" />
                  </button>
                </div>
              ))}

              <label className="flex items-center gap-2 px-3 py-2 border-2 border-dashed border-gray-300 rounded-md text-sm text-gray-500 hover:border-primary hover:text-primary cursor-pointer transition-colors">
                <Plus className="h-4 w-4" />
                <span>Extra bijlage toevoegen</span>
                <input type="file" accept=".pdf,.png,.jpg,.jpeg" multiple onChange={handleFileUpload} className="hidden" />
              </label>
            </div>
          </div>

          <div className="flex justify-end gap-2 pt-4 border-t border-gray-200">
            <Button onClick={handleSendEmail} disabled={sending || !emailTo}>
              {sending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Send className="h-4 w-4" />
              )}
              {sending ? 'Verzenden...' : 'Offerte versturen'}
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
