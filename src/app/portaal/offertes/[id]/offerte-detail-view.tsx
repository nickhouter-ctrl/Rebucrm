'use client'

import { useState, useRef, useEffect } from 'react'
import { Card, CardContent, CardHeader } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { PageHeader } from '@/components/ui/page-header'
import { formatCurrency, formatDateShort } from '@/lib/utils'
import { sendBericht, getBerichten, acceptOffertePortaal } from '@/lib/portaal-actions'
import { Download, Send, Check, ArrowLeft } from 'lucide-react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function OfferteDetailView({ offerte }: { offerte: any }) {
  const router = useRouter()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [berichten, setBerichten] = useState<any[]>(offerte.berichten || [])
  const [nieuwBericht, setNieuwBericht] = useState('')
  const [sending, setSending] = useState(false)
  const [accepting, setAccepting] = useState(false)
  const [accepted, setAccepted] = useState(offerte.status === 'geaccepteerd')
  const chatEndRef = useRef<HTMLDivElement>(null)

  const regels = offerte.regels || []
  const relatie = offerte.relatie as { bedrijfsnaam: string; contactpersoon?: string } | null

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [berichten])

  // Refresh berichten periodically
  useEffect(() => {
    const interval = setInterval(async () => {
      const fresh = await getBerichten(offerte.id)
      setBerichten(fresh)
    }, 15000)
    return () => clearInterval(interval)
  }, [offerte.id])

  async function handleSend() {
    if (!nieuwBericht.trim() || sending) return
    setSending(true)
    const result = await sendBericht(offerte.id, nieuwBericht)
    if (result.success) {
      setNieuwBericht('')
      const fresh = await getBerichten(offerte.id)
      setBerichten(fresh)
    }
    setSending(false)
  }

  async function handleAccept() {
    if (accepting) return
    setAccepting(true)
    const result = await acceptOffertePortaal(offerte.id)
    if (result.success) {
      setAccepted(true)
      router.refresh()
    } else {
      alert(result.error || 'Er ging iets mis')
    }
    setAccepting(false)
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSend()
    }
  }

  return (
    <div>
      <PageHeader
        title={`Offerte ${offerte.offertenummer}`}
        description={offerte.onderwerp || undefined}
        actions={
          <Link href="/portaal/offertes">
            <Button variant="secondary" size="sm">
              <ArrowLeft className="h-4 w-4" />
              Terug naar offertes
            </Button>
          </Link>
        }
      />

      {/* Offerte info card */}
      <Card className="mb-6">
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-500">Relatie</p>
              <p className="text-base font-medium text-gray-900">
                {relatie?.bedrijfsnaam || '-'}
                {relatie?.contactpersoon && (
                  <span className="text-gray-500 font-normal"> - {relatie.contactpersoon}</span>
                )}
              </p>
            </div>
            <Badge status={accepted ? 'geaccepteerd' : offerte.status} />
          </div>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
            <div>
              <p className="text-xs text-gray-500">Offertenummer</p>
              <p className="text-sm font-medium">{offerte.offertenummer}</p>
            </div>
            <div>
              <p className="text-xs text-gray-500">Datum</p>
              <p className="text-sm font-medium">{formatDateShort(offerte.datum)}</p>
            </div>
            <div>
              <p className="text-xs text-gray-500">Geldig tot</p>
              <p className="text-sm font-medium">{offerte.geldig_tot ? formatDateShort(offerte.geldig_tot) : '-'}</p>
            </div>
            <div>
              <p className="text-xs text-gray-500">Status</p>
              <Badge status={accepted ? 'geaccepteerd' : offerte.status} />
            </div>
          </div>

          {/* Regels tabel */}
          {regels.length > 0 && (
            <div className="overflow-x-auto mb-4">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-200 bg-gray-50">
                    <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Omschrijving</th>
                    <th className="px-4 py-2 text-right text-xs font-medium text-gray-500 uppercase">Aantal</th>
                    <th className="px-4 py-2 text-right text-xs font-medium text-gray-500 uppercase">Prijs</th>
                    <th className="px-4 py-2 text-right text-xs font-medium text-gray-500 uppercase">BTW</th>
                    <th className="px-4 py-2 text-right text-xs font-medium text-gray-500 uppercase">Totaal</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {regels.map((regel: { id: string; omschrijving: string; aantal: number; prijs: number; btw_percentage: number; totaal: number }) => (
                    <tr key={regel.id}>
                      <td className="px-4 py-2 text-gray-900">{regel.omschrijving}</td>
                      <td className="px-4 py-2 text-right text-gray-600">{regel.aantal}</td>
                      <td className="px-4 py-2 text-right text-gray-600">{formatCurrency(regel.prijs)}</td>
                      <td className="px-4 py-2 text-right text-gray-600">{regel.btw_percentage}%</td>
                      <td className="px-4 py-2 text-right font-medium text-gray-900">{formatCurrency(regel.totaal)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {/* Totalen */}
          <div className="flex justify-end">
            <div className="w-64 space-y-1">
              <div className="flex justify-between text-sm">
                <span className="text-gray-500">Subtotaal</span>
                <span className="text-gray-900">{formatCurrency(offerte.subtotaal || 0)}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-gray-500">BTW</span>
                <span className="text-gray-900">{formatCurrency(offerte.btw_totaal || 0)}</span>
              </div>
              <div className="flex justify-between text-sm font-semibold border-t border-gray-200 pt-1">
                <span className="text-gray-900">Totaal</span>
                <span className="text-gray-900">{formatCurrency(offerte.totaal || 0)}</span>
              </div>
            </div>
          </div>

          {/* Actions */}
          <div className="flex items-center gap-3 mt-6 pt-4 border-t border-gray-200">
            {offerte.status === 'verzonden' && !accepted && (
              <Button onClick={handleAccept} disabled={accepting}>
                <Check className="h-4 w-4" />
                {accepting ? 'Bezig...' : 'Offerte accepteren'}
              </Button>
            )}
            <a href={`/api/pdf/offerte/${offerte.id}`} target="_blank" rel="noopener noreferrer">
              <Button variant="secondary">
                <Download className="h-4 w-4" />
                PDF downloaden
              </Button>
            </a>
          </div>
        </CardContent>
      </Card>

      {/* Chat / Berichten section */}
      <Card>
        <CardHeader>
          <h2 className="text-base font-semibold text-gray-900">Berichten</h2>
        </CardHeader>
        <CardContent>
          {/* Messages */}
          <div className="space-y-3 max-h-96 overflow-y-auto mb-4">
            {berichten.length === 0 ? (
              <p className="text-sm text-gray-500 text-center py-8">
                Nog geen berichten. Stel een vraag over deze offerte.
              </p>
            ) : (
              berichten.map((bericht: { id: string; afzender_type: string; afzender_naam: string; tekst: string; created_at: string }) => (
                <div
                  key={bericht.id}
                  className={`flex ${bericht.afzender_type === 'klant' ? 'justify-end' : 'justify-start'}`}
                >
                  <div
                    className={`max-w-[75%] rounded-lg px-4 py-2.5 ${
                      bericht.afzender_type === 'klant'
                        ? 'bg-green-100 text-green-900'
                        : 'bg-gray-100 text-gray-900'
                    }`}
                  >
                    <p className="text-xs font-medium mb-1 opacity-70">{bericht.afzender_naam}</p>
                    <p className="text-sm whitespace-pre-wrap">{bericht.tekst}</p>
                    <p className="text-[10px] mt-1 opacity-50">
                      {formatDateShort(bericht.created_at)}
                    </p>
                  </div>
                </div>
              ))
            )}
            <div ref={chatEndRef} />
          </div>

          {/* Input */}
          <div className="flex gap-2">
            <textarea
              value={nieuwBericht}
              onChange={(e) => setNieuwBericht(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Typ uw bericht..."
              rows={2}
              className="flex-1 border border-gray-300 rounded-md px-3 py-2 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent"
            />
            <Button onClick={handleSend} disabled={sending || !nieuwBericht.trim()}>
              <Send className="h-4 w-4" />
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
