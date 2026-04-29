'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { convertAiLeadToRelatie } from '@/lib/actions'
import { PageHeader } from '@/components/ui/page-header'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { ArrowLeft, Sparkles, Loader2, UserPlus, CheckCircle, AlertCircle } from 'lucide-react'

interface ScoutLead {
  bedrijfsnaam: string
  contactpersoon: string
  email: string
  telefoon: string
  postcode: string
  plaats: string
  type_werk: string
  budget_indicatie: string
  urgentie: 'hoog' | 'middel' | 'laag' | 'onbekend'
  relevantie_score: number
  motivatie: string
}

interface BestaandeLead {
  id: string
  bedrijfsnaam: string
  contactpersoon: string | null
  email: string | null
  telefoon: string | null
  plaats: string | null
  status: string
  notities: string | null
  created_at: string
  relatie_id: string | null
}

export function AiScout({ bestaande, embedded = false }: { bestaande: BestaandeLead[]; embedded?: boolean }) {
  const router = useRouter()
  const [tekst, setTekst] = useState('')
  const [bezig, setBezig] = useState(false)
  const [resultaten, setResultaten] = useState<ScoutLead[]>([])
  const [notitie, setNotitie] = useState('')
  const [error, setError] = useState('')
  const [succes, setSucces] = useState('')
  const [opslaan, setOpslaan] = useState(true)
  const [convertingId, setConvertingId] = useState<string | null>(null)

  async function analyseer() {
    if (tekst.trim().length < 30) { setError('Plak minimaal 30 tekens'); return }
    setBezig(true)
    setError('')
    setSucces('')
    setResultaten([])
    try {
      const res = await fetch('/api/ai/scout-lead', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tekst, opslaan }),
      })
      const data = await res.json()
      if (!res.ok) { setError(data.error || 'AI-fout'); return }
      setResultaten(data.leads || [])
      setNotitie(data.notitie || '')
      if (data.opgeslagenIds?.length) {
        setSucces(`${data.opgeslagenIds.length} lead(s) opgeslagen — zie hieronder`)
        // Refresh bestaande lijst
        router.refresh()
      } else if ((data.leads || []).length === 0) {
        setSucces('Geen relevante leads gevonden in de tekst.')
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Netwerkfout')
    } finally {
      setBezig(false)
    }
  }

  async function convertLead(lead: BestaandeLead) {
    setConvertingId(lead.id)
    try {
      const result = await convertAiLeadToRelatie(lead.id)
      if (result.error) { alert(result.error); return }
      if (result.relatieId) router.push(`/relatiebeheer/${result.relatieId}`)
    } finally {
      setConvertingId(null)
    }
  }

  function urgentieKleur(u: string) {
    return u === 'hoog' ? 'bg-red-100 text-red-700'
      : u === 'middel' ? 'bg-amber-100 text-amber-700'
      : u === 'laag' ? 'bg-gray-100 text-gray-600'
      : 'bg-gray-100 text-gray-400'
  }

  function scoreKleur(s: number) {
    return s >= 8 ? 'text-green-700 bg-green-100'
      : s >= 5 ? 'text-amber-700 bg-amber-100'
      : 'text-gray-500 bg-gray-100'
  }

  return (
    <div>
      {!embedded && (
        <PageHeader
          title="AI Lead-Scout"
          description="Plak tekst van Marktplaats, Werkspot, Facebook of een email — de AI extraheert lead-info, scoort relevantie en bewaart hem hier"
          actions={
            <Button variant="ghost" onClick={() => router.push('/relatiebeheer/leads')}>
              <ArrowLeft className="h-4 w-4" />
              Terug naar leads
            </Button>
          }
        />
      )}
      {embedded && (
        <p className="text-sm text-gray-600 mb-4">
          Plak tekst van Marktplaats, Werkspot, Facebook of een email — de AI extraheert lead-info, scoort relevantie en bewaart hem hier.
        </p>
      )}

      <Card className="mb-6">
        <CardContent className="pt-6">
          <label htmlFor="scout-tekst" className="block text-sm font-medium text-gray-700 mb-2">
            Plak hier de tekst
          </label>
          <textarea
            id="scout-tekst"
            value={tekst}
            onChange={(e) => setTekst(e.target.value)}
            placeholder="Bijvoorbeeld een Marktplaats-listing, Werkspot-aanvraag, Facebook-post of binnengekomen e-mail..."
            rows={8}
            className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#00a66e] focus:border-transparent font-mono"
          />
          <div className="mt-3 flex items-center justify-between flex-wrap gap-2">
            <label className="flex items-center gap-2 text-sm text-gray-600">
              <input
                type="checkbox"
                checked={opslaan}
                onChange={(e) => setOpslaan(e.target.checked)}
                className="rounded border-gray-300"
              />
              Opslaan als lead bij relevantie ≥ 4/10
            </label>
            <Button onClick={analyseer} disabled={bezig || tekst.trim().length < 30}>
              {bezig ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
              {bezig ? 'Analyseren...' : 'Analyseer met AI'}
            </Button>
          </div>
          {error && <p className="mt-3 text-sm text-red-600 bg-red-50 px-3 py-2 rounded-md flex items-center gap-2"><AlertCircle className="h-4 w-4" /> {error}</p>}
          {succes && <p className="mt-3 text-sm text-green-700 bg-green-50 px-3 py-2 rounded-md flex items-center gap-2"><CheckCircle className="h-4 w-4" /> {succes}</p>}
        </CardContent>
      </Card>

      {resultaten.length > 0 && (
        <div className="mb-6">
          <h3 className="text-sm font-semibold text-gray-900 mb-3">AI extractie ({resultaten.length})</h3>
          {notitie && <p className="text-xs text-gray-500 mb-3">{notitie}</p>}
          <div className="space-y-2">
            {resultaten.map((r, i) => (
              <Card key={i}>
                <CardContent className="py-3">
                  <div className="flex items-start justify-between gap-3 flex-wrap">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-medium text-gray-900">{r.bedrijfsnaam || r.contactpersoon || 'Onbekend'}</span>
                        <span className={`text-[10px] px-1.5 py-0.5 rounded font-medium ${scoreKleur(r.relevantie_score)}`}>
                          {r.relevantie_score}/10
                        </span>
                        {r.urgentie !== 'onbekend' && (
                          <span className={`text-[10px] px-1.5 py-0.5 rounded font-medium ${urgentieKleur(r.urgentie)}`}>
                            {r.urgentie}
                          </span>
                        )}
                      </div>
                      {r.contactpersoon && r.contactpersoon !== r.bedrijfsnaam && (
                        <p className="text-xs text-gray-600 mt-0.5">{r.contactpersoon}</p>
                      )}
                      <div className="text-xs text-gray-500 mt-1 space-x-2">
                        {r.email && <span>📧 {r.email}</span>}
                        {r.telefoon && <span>📞 {r.telefoon}</span>}
                        {r.plaats && <span>📍 {r.plaats}</span>}
                      </div>
                      {r.type_werk && <p className="text-xs text-gray-700 mt-1"><strong>Werk:</strong> {r.type_werk}</p>}
                      {r.budget_indicatie && <p className="text-xs text-gray-700"><strong>Budget:</strong> {r.budget_indicatie}</p>}
                      <p className="text-xs text-gray-500 mt-1 italic">{r.motivatie}</p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      )}

      <h3 className="text-sm font-semibold text-gray-900 mb-3">Eerder gescoute leads ({bestaande.length})</h3>
      {bestaande.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center text-sm text-gray-400">
            Nog geen AI-gescoute leads. Plak tekst hierboven om te beginnen.
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-2">
          {bestaande.map(lead => (
            <Card key={lead.id}>
              <CardContent className="py-3 flex items-start justify-between gap-3 flex-wrap">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-medium text-gray-900">{lead.bedrijfsnaam}</span>
                    <span className={`text-[10px] px-1.5 py-0.5 rounded font-medium ${
                      lead.status === 'nieuw' ? 'bg-blue-100 text-blue-700'
                      : lead.relatie_id ? 'bg-green-100 text-green-700'
                      : 'bg-gray-100 text-gray-600'
                    }`}>{lead.relatie_id ? 'geconverteerd' : lead.status}</span>
                    <span className="text-[10px] text-gray-400">{new Date(lead.created_at).toLocaleDateString('nl-NL')}</span>
                  </div>
                  {lead.contactpersoon && <p className="text-xs text-gray-600 mt-0.5">{lead.contactpersoon}</p>}
                  <div className="text-xs text-gray-500 mt-1 space-x-2">
                    {lead.email && <span>📧 {lead.email}</span>}
                    {lead.telefoon && <span>📞 {lead.telefoon}</span>}
                    {lead.plaats && <span>📍 {lead.plaats}</span>}
                  </div>
                  {lead.notities && <p className="text-xs text-gray-600 mt-1 whitespace-pre-line">{lead.notities}</p>}
                </div>
                <div className="flex flex-col gap-1">
                  {!lead.relatie_id ? (
                    <Button size="sm" onClick={() => convertLead(lead)} disabled={convertingId === lead.id}>
                      {convertingId === lead.id ? <Loader2 className="h-3 w-3 animate-spin" /> : <UserPlus className="h-3 w-3" />}
                      Maak relatie
                    </Button>
                  ) : (
                    <Button size="sm" variant="ghost" onClick={() => router.push(`/relatiebeheer/${lead.relatie_id}`)}>
                      Open relatie →
                    </Button>
                  )}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  )
}
