'use client'

import { useRouter } from 'next/navigation'
import { useState } from 'react'
import { saveFactuur, deleteFactuur, getFactuurEmailDefaults, sendFactuurEmail, generateBetaallink, crediteerFactuur } from '@/lib/actions'
import { useBackNav } from '@/lib/hooks/use-back-nav'
import { RichTextEditor, plainTextToHtml } from '@/components/ui/rich-text-editor'
import { PageHeader } from '@/components/ui/page-header'
import { Card, CardContent, CardFooter } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Select } from '@/components/ui/select'
import { Button } from '@/components/ui/button'
import { Dialog } from '@/components/ui/dialog'
import { formatCurrency, handleNumberPaste } from '@/lib/utils'
import { Save, Trash2, ArrowLeft, Plus, X, Download, Send, Mail, Paperclip, Loader2, Link2, Copy } from 'lucide-react'
import { AuditLogTab } from '@/components/audit-log/audit-log-tab'

interface Regel {
  omschrijving: string
  aantal: number
  prijs: number
  btw_percentage: number
  product_id?: string
}

export function FactuurForm({ factuur, relaties, producten }: {
  factuur: Record<string, unknown> | null
  relaties: { id: string; bedrijfsnaam: string }[]
  producten: { id: string; naam: string; prijs: number; btw_percentage: number }[]
}) {
  const router = useRouter()
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const isNew = !factuur
  const { navigateBack } = useBackNav(`factuur-${(factuur?.id as string) || 'nieuw'}`)

  const [regels, setRegels] = useState<Regel[]>(
    (factuur?.regels as Regel[]) || [{ omschrijving: '', aantal: 1, prijs: 0, btw_percentage: 21 }]
  )

  // Email state
  const [showEmailDialog, setShowEmailDialog] = useState(false)
  const [emailTo, setEmailTo] = useState('')
  const [emailSubject, setEmailSubject] = useState('')
  const [emailBody, setEmailBody] = useState('')
  const [emailAttachments, setEmailAttachments] = useState<File[]>([])
  const [sending, setSending] = useState(false)
  const [showEmailResult, setShowEmailResult] = useState<string | null>(null)
  const [betaalLink, setBetaalLink] = useState<string | null>((factuur?.betaal_link as string) || null)
  const [generatingLink, setGeneratingLink] = useState(false)

  function addRegel() { setRegels([...regels, { omschrijving: '', aantal: 1, prijs: 0, btw_percentage: 21 }]) }
  function removeRegel(index: number) { setRegels(regels.filter((_, i) => i !== index)) }
  function updateRegel(index: number, field: keyof Regel, value: string | number) {
    const updated = [...regels]; updated[index] = { ...updated[index], [field]: value }; setRegels(updated)
  }
  function selectProduct(index: number, productId: string) {
    const product = producten.find(p => p.id === productId)
    if (product) {
      const updated = [...regels]
      updated[index] = { ...updated[index], product_id: productId, omschrijving: product.naam, prijs: product.prijs, btw_percentage: product.btw_percentage }
      setRegels(updated)
    }
  }

  const subtotaal = regels.reduce((sum, r) => sum + r.aantal * r.prijs, 0)
  const btwTotaal = regels.reduce((sum, r) => sum + (r.aantal * r.prijs * r.btw_percentage) / 100, 0)
  const totaal = subtotaal + btwTotaal

  async function handleSubmit(formData: FormData) {
    setLoading(true); setError('')
    if (factuur) formData.set('id', factuur.id as string)
    formData.set('regels', JSON.stringify(regels))
    const result = await saveFactuur(formData)
    if (result.error) { setError(result.error); setLoading(false) }
    else navigateBack('/facturatie')
  }

  async function handleDelete() {
    if (!factuur || !confirm('Weet u zeker dat u deze factuur wilt verwijderen?')) return
    const result = await deleteFactuur(factuur.id as string)
    if (result.error) setError(result.error)
    else navigateBack('/facturatie')
  }

  async function handleCrediteer() {
    if (!factuur) return
    const reden = prompt('Reden voor crediteren (optioneel):') || ''
    if (reden === null) return
    if (!confirm(`Creditnota maken voor ${factuur.factuurnummer}? Dit maakt een nieuwe factuur met negatief totaal aan en synct met SnelStart.`)) return
    setLoading(true)
    const result = await crediteerFactuur(factuur.id as string, reden)
    setLoading(false)
    if (result.error) setError(result.error)
    else if (result.creditnotaId) {
      router.push(`/facturatie/${result.creditnotaId}`)
    }
  }

  async function openEmailDialog() {
    setLoading(true)
    // Eerst auto-opslaan zodat eventuele wijzigingen worden meegenomen in de mail
    if (factuur) {
      const fd = new FormData()
      const form = document.querySelector('form[data-factuur-form]') as HTMLFormElement | null
      if (form) {
        for (const el of Array.from(form.elements) as HTMLInputElement[]) {
          if (el.name) fd.set(el.name, el.value)
        }
      }
      fd.set('id', factuur.id as string)
      fd.set('regels', JSON.stringify(regels))
      const saveRes = await saveFactuur(fd)
      if (saveRes.error) setError(`Opslaan mislukt: ${saveRes.error}`)
    }
    // Probeer email-defaults te laden; bij fout open toch de dialog zodat user
    // handmatig adres/onderwerp/body kan invullen voor review.
    try {
      const defaults = await getFactuurEmailDefaults(factuur!.id as string)
      setEmailTo(defaults.to || '')
      setEmailSubject(defaults.subject || '')
      setEmailBody(plainTextToHtml(defaults.body || ''))
      if (defaults.error) setError(defaults.error)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Kon email-defaults niet laden')
    }
    setEmailAttachments([])
    setShowEmailDialog(true)
    setLoading(false)
  }

  async function handleGenerateBetaallink() {
    if (!factuur) return
    setGeneratingLink(true)
    const result = await generateBetaallink(factuur.id as string)
    if (result.error) setError(result.error)
    else if (result.betaalLink) {
      setBetaalLink(result.betaalLink)
      setShowEmailResult('Betaallink aangemaakt!')
    }
    setGeneratingLink(false)
  }

  async function handleSendEmail() {
    setSending(true)
    const extraBijlagen: { filename: string; content: string }[] = []
    for (const file of emailAttachments) {
      const base64 = await new Promise<string>((resolve) => {
        const reader = new FileReader()
        reader.onload = () => resolve((reader.result as string).split(',')[1])
        reader.readAsDataURL(file)
      })
      extraBijlagen.push({ filename: file.name, content: base64 })
    }
    const result = await sendFactuurEmail(factuur!.id as string, {
      to: emailTo, subject: emailSubject, body: emailBody,
      extraBijlagen: extraBijlagen.length > 0 ? extraBijlagen : undefined,
    })
    setSending(false)
    setShowEmailDialog(false)
    if (result.error) setShowEmailResult(result.error)
    else setShowEmailResult('Factuur verstuurd!')
  }

  return (
    <div>
      <PageHeader
        title={isNew ? 'Nieuwe factuur' : `Factuur ${factuur?.factuurnummer}`}
        actions={
          <div className="flex gap-2">
            <Button variant="ghost" onClick={() => router.back()}><ArrowLeft className="h-4 w-4" />Terug</Button>
            <Button
              variant="secondary"
              onClick={() => {
                const form = document.querySelector('form[data-factuur-form]') as HTMLFormElement | null
                form?.requestSubmit()
              }}
              disabled={loading}
            >
              <Save className="h-4 w-4" />
              {loading ? 'Opslaan...' : 'Opslaan'}
            </Button>
            {!isNew && (
              <>
                <a href={`/api/pdf/factuur/${factuur?.id}`} target="_blank" rel="noopener noreferrer">
                  <Button variant="secondary"><Download className="h-4 w-4" />PDF</Button>
                </a>
                <Button variant="secondary" onClick={handleGenerateBetaallink} disabled={loading || generatingLink}>
                  <Link2 className="h-4 w-4" />
                  {generatingLink ? 'Genereren...' : betaalLink ? 'Link vernieuwen' : 'Betaallink'}
                </Button>
                <Button onClick={openEmailDialog} disabled={loading}>
                  <Send className="h-4 w-4" />
                  Versturen
                </Button>
              </>
            )}
          </div>
        }
      />

      {error && <div className="bg-red-50 text-red-600 text-sm p-3 rounded-md mb-4">{error}</div>}

      {/* Email resultaat */}
      {showEmailResult && (
        <div className={`${showEmailResult === 'Factuur verstuurd!' ? 'bg-green-50 border-green-200' : 'bg-red-50 border-red-200'} border p-4 rounded-lg mb-4`}>
          <p className={`text-sm font-medium ${showEmailResult === 'Factuur verstuurd!' ? 'text-green-800' : 'text-red-800'}`}>{showEmailResult}</p>
          <button onClick={() => setShowEmailResult(null)} className="text-xs underline mt-1 text-gray-500">Sluiten</button>
        </div>
      )}

      {/* Betaallink */}
      {betaalLink && (
        <div className="bg-blue-50 border border-blue-200 p-4 rounded-lg mb-4">
          <p className="text-sm font-medium text-blue-800 mb-2">Betaallink</p>
          <div className="flex items-center gap-2">
            <a href={betaalLink} target="_blank" rel="noopener noreferrer" className="text-sm text-blue-600 hover:text-blue-800 underline break-all flex-1">
              {betaalLink}
            </a>
            <button
              onClick={() => { navigator.clipboard.writeText(betaalLink); setShowEmailResult('Link gekopieerd!') }}
              className="shrink-0 p-1.5 rounded hover:bg-blue-100 text-blue-600"
              title="Kopieer link"
            >
              <Copy className="h-4 w-4" />
            </button>
          </div>
        </div>
      )}

      {/* Email compose dialog */}
      <Dialog open={showEmailDialog} onClose={() => setShowEmailDialog(false)} title="Factuur versturen" className="max-w-2xl">
        <div className="space-y-4">
          <div>
            <label htmlFor="email_to" className="block text-sm font-medium text-gray-700 mb-1"><Mail className="h-3.5 w-3.5 inline mr-1" />Aan</label>
            <input id="email_to" type="email" value={emailTo} onChange={e => setEmailTo(e.target.value)} className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent" placeholder="E-mailadres ontvanger" />
          </div>
          <div>
            <label htmlFor="email_subject" className="block text-sm font-medium text-gray-700 mb-1">Onderwerp</label>
            <input id="email_subject" type="text" value={emailSubject} onChange={e => setEmailSubject(e.target.value)} className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent" />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Bericht</label>
            <RichTextEditor value={emailBody} onChange={setEmailBody} minHeight={260} />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2"><Paperclip className="h-3.5 w-3.5 inline mr-1" />Bijlagen</label>
            <div className="space-y-2">
              <div className="flex items-center gap-2 px-3 py-2 bg-blue-50 border border-blue-200 rounded-md text-sm">
                <Download className="h-4 w-4 text-blue-600 flex-shrink-0" />
                <span className="text-blue-800 flex-1">Factuur-{String(factuur?.factuurnummer)}.pdf</span>
                {factuur?.id && (
                  <button
                    type="button"
                    onClick={() => window.open(`/api/pdf/factuur/${factuur.id}`, '_blank')}
                    className="text-xs text-blue-700 hover:text-blue-900 underline"
                  >
                    Voorbeeld
                  </button>
                )}
                <span className="text-xs text-blue-500">Automatisch bijgevoegd</span>
              </div>
              {emailAttachments.map((file, i) => (
                <div key={i} className="flex items-center gap-2 px-3 py-2 bg-gray-50 border border-gray-200 rounded-md text-sm">
                  <Paperclip className="h-4 w-4 text-gray-500 flex-shrink-0" />
                  <span className="text-gray-700 flex-1 truncate">{file.name}</span>
                  <span className="text-xs text-gray-400">{(file.size / 1024).toFixed(0)} KB</span>
                  <button type="button" onClick={() => setEmailAttachments(prev => prev.filter((_, idx) => idx !== i))} className="text-gray-400 hover:text-red-500"><X className="h-4 w-4" /></button>
                </div>
              ))}
              <label className="flex items-center gap-2 px-3 py-2 border-2 border-dashed border-gray-300 rounded-md text-sm text-gray-500 hover:border-primary hover:text-primary cursor-pointer transition-colors">
                <Plus className="h-4 w-4" /><span>Extra bijlage toevoegen</span>
                <input type="file" accept=".pdf,.png,.jpg,.jpeg" multiple onChange={(e) => { setEmailAttachments(prev => [...prev, ...Array.from(e.target.files || [])]); e.target.value = '' }} className="hidden" />
              </label>
            </div>
          </div>
          <div className="flex justify-end gap-2 pt-2 border-t border-gray-200">
            <Button variant="ghost" onClick={() => setShowEmailDialog(false)} disabled={sending}>Annuleren</Button>
            <Button onClick={handleSendEmail} disabled={sending || !emailTo}>
              {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
              {sending ? 'Verzenden...' : 'Versturen'}
            </Button>
          </div>
        </div>
      </Dialog>

      <form action={handleSubmit} data-factuur-form className="space-y-4">
        <Card>
          <CardContent className="space-y-4 pt-6">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <Input id="factuurnummer" name="factuurnummer" label="Factuurnummer *" defaultValue={(factuur?.factuurnummer as string) || ''} required />
              <Input id="datum" name="datum" label="Datum *" type="date" defaultValue={(factuur?.datum as string) || new Date().toISOString().split('T')[0]} required />
              <Input id="vervaldatum" name="vervaldatum" label="Vervaldatum" type="date" defaultValue={(factuur?.vervaldatum as string) || ''} />
            </div>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <Select id="relatie_id" name="relatie_id" label="Relatie" defaultValue={(factuur?.relatie_id as string) || ''} placeholder="Selecteer relatie..." options={relaties.map(r => ({ value: r.id, label: r.bedrijfsnaam }))} />
              <Select id="status" name="status" label="Status" defaultValue={(factuur?.status as string) || 'concept'} options={[
                { value: 'concept', label: 'Concept' }, { value: 'verzonden', label: 'Verzonden' },
                { value: 'betaald', label: 'Betaald' }, { value: 'deels_betaald', label: 'Deels betaald' },
                { value: 'vervallen', label: 'Vervallen' }, { value: 'gecrediteerd', label: 'Gecrediteerd' },
              ]} />
              <Input id="betaald_bedrag" name="betaald_bedrag" label="Betaald bedrag" type="number" step="0.01" defaultValue={(factuur?.betaald_bedrag as number) || 0} />
            </div>
            <Input id="onderwerp" name="onderwerp" label="Onderwerp" defaultValue={(factuur?.onderwerp as string) || ''} />
          </CardContent>
        </Card>

        <Card>
          <div className="px-6 py-4 border-b border-gray-200 flex items-center justify-between">
            <h3 className="font-semibold text-gray-900">Regelitems</h3>
            <Button type="button" variant="secondary" size="sm" onClick={addRegel}><Plus className="h-3 w-3" />Regel toevoegen</Button>
          </div>
          <CardContent>
            <div className="space-y-3">
              {regels.map((regel, i) => (
                <div key={i} className="grid grid-cols-12 gap-2 items-end">
                  <div className="col-span-1"><select className="w-full px-2 py-2 border border-gray-300 rounded-md text-xs" value={regel.product_id || ''} onChange={(e) => selectProduct(i, e.target.value)}><option value="">--</option>{producten.map(p => <option key={p.id} value={p.id}>{p.naam}</option>)}</select></div>
                  <div className="col-span-4"><input placeholder="Omschrijving" className="w-full px-2 py-2 border border-gray-300 rounded-md text-sm" value={regel.omschrijving} onChange={(e) => updateRegel(i, 'omschrijving', e.target.value)} required /></div>
                  <div className="col-span-2"><input type="number" step="0.01" className="w-full px-2 py-2 border border-gray-300 rounded-md text-sm" value={regel.aantal} onChange={(e) => updateRegel(i, 'aantal', parseFloat(e.target.value) || 0)} onPaste={(e) => handleNumberPaste(e, (v) => updateRegel(i, 'aantal', parseFloat(v) || 0))} /></div>
                  <div className="col-span-2"><input type="number" step="0.01" className="w-full px-2 py-2 border border-gray-300 rounded-md text-sm" value={regel.prijs} onChange={(e) => updateRegel(i, 'prijs', parseFloat(e.target.value) || 0)} onPaste={(e) => handleNumberPaste(e, (v) => updateRegel(i, 'prijs', parseFloat(v) || 0))} /></div>
                  <div className="col-span-1"><select className="w-full px-2 py-2 border border-gray-300 rounded-md text-xs" value={regel.btw_percentage} onChange={(e) => updateRegel(i, 'btw_percentage', parseInt(e.target.value))}><option value={0}>0%</option><option value={9}>9%</option><option value={21}>21%</option></select></div>
                  <div className="col-span-1 text-right text-sm font-medium">{formatCurrency(regel.aantal * regel.prijs)}</div>
                  <div className="col-span-1"><button type="button" onClick={() => removeRegel(i)} className="p-1 text-gray-400 hover:text-red-500"><X className="h-4 w-4" /></button></div>
                </div>
              ))}
            </div>
            <div className="mt-6 flex justify-end">
              <div className="w-64 space-y-1 text-sm">
                <div className="flex justify-between"><span>Subtotaal:</span><span>{formatCurrency(subtotaal)}</span></div>
                <div className="flex justify-between"><span>BTW:</span><span>{formatCurrency(btwTotaal)}</span></div>
                <div className="flex justify-between font-bold text-base border-t pt-1"><span>Totaal:</span><span>{formatCurrency(totaal)}</span></div>
              </div>
            </div>
          </CardContent>
          <CardFooter className="flex justify-between">
            <div className="flex gap-2">
              {!isNew && <Button type="button" variant="danger" onClick={handleDelete}><Trash2 className="h-4 w-4" />Verwijderen</Button>}
              {!isNew && factuur?.status !== 'concept' && factuur?.status !== 'gecrediteerd' && factuur?.factuur_type !== 'credit' && (
                <Button type="button" variant="secondary" onClick={handleCrediteer} disabled={loading}>Crediteren</Button>
              )}
            </div>
            {!isNew ? (
              <Button type="button" onClick={openEmailDialog} disabled={loading}>
                <Send className="h-4 w-4" />
                {loading ? 'Versturen...' : 'Versturen'}
              </Button>
            ) : (
              <Button type="submit" disabled={loading}><Save className="h-4 w-4" />{loading ? 'Opslaan...' : 'Opslaan'}</Button>
            )}
          </CardFooter>
        </Card>
      </form>

      {!isNew && factuur?.id && (
        <Card className="mt-4">
          <CardContent className="pt-6">
            <h3 className="text-sm font-semibold text-gray-900 mb-3">Wijzigingsgeschiedenis</h3>
            <AuditLogTab entiteitType="factuur" entiteitId={factuur.id as string} />
          </CardContent>
        </Card>
      )}
    </div>
  )
}
