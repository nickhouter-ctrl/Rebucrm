'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Mail, CheckCircle, Clock, FileText, AlertTriangle, Hourglass, Loader2, Send } from 'lucide-react'
import { format } from 'date-fns'
import { nl } from 'date-fns/locale'
import { updateAanvraagStatus, wijzigAanvraagToewijzing, verlengAanvraagSla } from '@/lib/actions'
import { showToast } from '@/components/ui/toast'

interface Aanvraag {
  id: string
  titel: string
  omschrijving: string | null
  status: string
  prioriteit: string
  created_at: string
  relatie_id: string | null
  relatie_naam: string | null
  offerte_id: string | null
  toegewezen_aan: string | null
  toegewezen_naam: string | null
  sla_deadline: string | null
  sla_verlengd: boolean | null
  teruggestuurd_op: string | null
}

interface Gebruiker { id: string; naam: string }

// SLA-status bepalen vanuit deadline + teruggestuurd-stempel.
type SlaKey = 'gehaald' | 'telaat_klaar' | 'afgerond' | 'te_laat' | 'risico' | 'op_tijd' | 'geen_sla'
function bepaalSla(a: Aanvraag, nu: number): { key: SlaKey; label: string; kleur: string; resterendMs: number | null } {
  if (a.teruggestuurd_op) {
    const opTijd = !a.sla_deadline || new Date(a.teruggestuurd_op).getTime() <= new Date(a.sla_deadline).getTime()
    return opTijd
      ? { key: 'gehaald', label: 'Op tijd teruggestuurd', kleur: 'text-emerald-600', resterendMs: null }
      : { key: 'telaat_klaar', label: 'Te laat teruggestuurd', kleur: 'text-red-600', resterendMs: null }
  }
  if (a.status === 'afgerond') return { key: 'afgerond', label: 'Afgerond', kleur: 'text-gray-500', resterendMs: null }
  if (!a.sla_deadline) return { key: 'geen_sla', label: 'Geen SLA', kleur: 'text-gray-400', resterendMs: null }
  const rem = new Date(a.sla_deadline).getTime() - nu
  if (rem < 0) return { key: 'te_laat', label: 'Te laat', kleur: 'text-red-600', resterendMs: rem }
  if (rem < 4 * 3600 * 1000) return { key: 'risico', label: 'Bijna te laat', kleur: 'text-amber-600', resterendMs: rem }
  return { key: 'op_tijd', label: 'Op schema', kleur: 'text-emerald-600', resterendMs: rem }
}

function formatDuur(ms: number): string {
  const abs = Math.abs(ms)
  const u = Math.floor(abs / 3600000)
  const m = Math.floor((abs % 3600000) / 60000)
  const tekst = u >= 1 ? `${u}u ${m}m` : `${m}m`
  return ms < 0 ? `${tekst} te laat` : `nog ${tekst}`
}

export function AanvragenView({ aanvragen, gebruikers }: { aanvragen: Aanvraag[]; gebruikers: Gebruiker[] }) {
  const router = useRouter()
  const [filter, setFilter] = useState<'open' | 'afgerond' | 'alle'>('open')
  const [loadingId, setLoadingId] = useState<string | null>(null)
  const nu = Date.now()

  const open = aanvragen.filter(a => a.status !== 'afgerond' && !a.teruggestuurd_op)
  const afgerond = aanvragen.filter(a => a.status === 'afgerond' || a.teruggestuurd_op)

  const filtered = filter === 'open' ? open : filter === 'afgerond' ? afgerond : aanvragen

  // KPI's
  const teLaat = open.filter(a => bepaalSla(a, nu).key === 'te_laat').length
  const risico = open.filter(a => bepaalSla(a, nu).key === 'risico').length
  const opSchema = open.filter(a => bepaalSla(a, nu).key === 'op_tijd').length
  // On-time-rate over teruggestuurde aanvragen
  const teruggestuurd = aanvragen.filter(a => a.teruggestuurd_op)
  const opTijdKlaar = teruggestuurd.filter(a => bepaalSla(a, nu).key === 'gehaald').length
  const onTimeRate = teruggestuurd.length > 0 ? Math.round((opTijdKlaar / teruggestuurd.length) * 100) : null

  async function handleStatus(id: string, status: string) {
    setLoadingId(id)
    await updateAanvraagStatus(id, status)
    setLoadingId(null)
    router.refresh()
  }

  async function handleToewijzing(id: string, profielId: string) {
    setLoadingId(id)
    const res = await wijzigAanvraagToewijzing(id, profielId || null)
    setLoadingId(null)
    if (res?.error) showToast(res.error, 'error')
    else { showToast('Toegewezen', 'success'); router.refresh() }
  }

  async function handleVerleng(id: string) {
    setLoadingId(id)
    const res = await verlengAanvraagSla(id)
    setLoadingId(null)
    if (res?.error) { showToast(res.error, 'error'); return }
    if (res?.mailVerstuurd) showToast('Verlengd naar 48u — klant geïnformeerd', 'success')
    else if (res?.geenEmail) showToast('Verlengd naar 48u (geen e-mailadres bekend, klant niet gemaild)', 'success')
    else showToast('Verlengd naar 48u (terugkoppelmail mislukt)', 'error')
    router.refresh()
  }

  const kpis = [
    { label: 'Op schema', waarde: opSchema, icon: CheckCircle, kleur: 'text-emerald-600' },
    { label: 'Bijna te laat', waarde: risico, icon: Hourglass, kleur: 'text-amber-600' },
    { label: 'Te laat', waarde: teLaat, icon: AlertTriangle, kleur: 'text-red-600' },
    { label: 'Op-tijd-rate', waarde: onTimeRate === null ? '—' : `${onTimeRate}%`, icon: Send, kleur: 'text-gray-700' },
  ]

  const filterButtons = [
    { label: `Open (${open.length})`, value: 'open' as const },
    { label: `Afgehandeld (${afgerond.length})`, value: 'afgerond' as const },
    { label: `Alle (${aanvragen.length})`, value: 'alle' as const },
  ]

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Offerte-aanvragen</h1>
        <p className="text-sm text-gray-500 mt-1">Aanvragen uit e-mail — terug naar de klant binnen 20 uur (of 48 uur bij grote offertes)</p>
      </div>

      {/* SLA KPI's */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {kpis.map(k => {
          const Icon = k.icon
          return (
            <Card key={k.label}>
              <CardContent className="py-3">
                <div className="flex items-center gap-2">
                  <Icon className={`h-4 w-4 ${k.kleur}`} />
                  <span className="text-xs text-gray-500">{k.label}</span>
                </div>
                <p className={`text-2xl font-semibold mt-1 ${k.kleur}`}>{k.waarde}</p>
              </CardContent>
            </Card>
          )
        })}
      </div>

      <div className="flex gap-1">
        {filterButtons.map(f => (
          <button
            key={f.value}
            onClick={() => setFilter(f.value)}
            className={`px-3 py-1.5 text-sm rounded-md font-medium transition-colors ${
              filter === f.value ? 'bg-primary text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
            }`}
          >
            {f.label}
          </button>
        ))}
      </div>

      {filtered.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center">
            <Mail className="h-12 w-12 text-gray-300 mx-auto mb-3" />
            <p className="text-gray-500">Geen aanvragen in deze weergave</p>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardContent className="p-0">
            <div className="divide-y divide-gray-100">
              {filtered.map(a => {
                const emailMatch = a.omschrijving?.match(/E-mail (?:ontvangen )?van (.+?): "(.+)"/)
                const afzender = emailMatch?.[1] || 'Onbekend'
                const onderwerp = emailMatch?.[2] || a.omschrijving || '-'
                const sla = bepaalSla(a, nu)
                const verwerkt = !!a.teruggestuurd_op || a.status === 'afgerond'
                return (
                  <div key={a.id} className="px-4 py-3 hover:bg-gray-50 transition-colors">
                    <div className="flex items-start gap-3">
                      <div className="mt-0.5">
                        {sla.key === 'gehaald' || sla.key === 'afgerond' ? <CheckCircle className="h-5 w-5 text-emerald-500" />
                          : sla.key === 'te_laat' || sla.key === 'telaat_klaar' ? <AlertTriangle className="h-5 w-5 text-red-500" />
                          : sla.key === 'risico' ? <Hourglass className="h-5 w-5 text-amber-500" />
                          : <Clock className="h-5 w-5 text-emerald-500" />}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-gray-900 truncate">{onderwerp}</p>
                        <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                          <p className="text-xs text-gray-500">Van: {afzender}</p>
                          {a.relatie_naam && <span className="text-xs font-medium text-primary">→ {a.relatie_naam}</span>}
                          <span className="text-xs text-gray-400">{format(new Date(a.created_at), 'd MMM HH:mm', { locale: nl })}</span>
                        </div>
                        {/* SLA-regel */}
                        <div className="flex items-center gap-2 mt-1.5 flex-wrap">
                          <span className={`text-xs font-medium ${sla.kleur}`}>
                            {sla.label}{sla.resterendMs !== null ? ` · ${formatDuur(sla.resterendMs)}` : ''}
                          </span>
                          {a.sla_verlengd && <Badge status="info">48u</Badge>}
                          {!verwerkt && a.sla_deadline && (
                            <span className="text-[11px] text-gray-400">deadline {format(new Date(a.sla_deadline), 'd MMM HH:mm', { locale: nl })}</span>
                          )}
                        </div>
                      </div>
                    </div>

                    {/* Acties */}
                    {!verwerkt && (
                      <div className="flex items-center gap-2 mt-2 flex-wrap pl-8">
                        {/* Toewijzing */}
                        <select
                          value={a.toegewezen_aan || ''}
                          onChange={(e) => handleToewijzing(a.id, e.target.value)}
                          disabled={loadingId === a.id}
                          className="text-xs border border-gray-300 rounded-md px-2 py-1 bg-white focus:outline-none focus:ring-1 focus:ring-primary"
                          title="Wie maakt de offerte?"
                        >
                          <option value="">Niet toegewezen</option>
                          {gebruikers.map(g => <option key={g.id} value={g.id}>{g.naam}</option>)}
                        </select>

                        {a.relatie_id && (
                          <Button
                            size="sm" variant="ghost"
                            onClick={async () => {
                              await updateAanvraagStatus(a.id, 'in_uitvoering')
                              router.push(a.offerte_id ? `/offertes/${a.offerte_id}` : `/offertes/nieuw?relatie_id=${a.relatie_id}`)
                            }}
                            disabled={loadingId === a.id}
                            className="text-primary hover:bg-primary/5"
                          >
                            <FileText className="h-4 w-4" />
                            {a.offerte_id ? 'Offerte bewerken' : 'Offerte aanmaken'}
                          </Button>
                        )}

                        {!a.sla_verlengd && (
                          <Button
                            size="sm" variant="ghost"
                            onClick={() => handleVerleng(a.id)}
                            disabled={loadingId === a.id}
                            className="text-amber-600 hover:bg-amber-50"
                            title="Grote offerte: verleng naar 48u en informeer de klant automatisch"
                          >
                            {loadingId === a.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <Hourglass className="h-4 w-4" />}
                            Verleng naar 48u
                          </Button>
                        )}

                        <Button
                          size="sm" variant="ghost"
                          onClick={() => handleStatus(a.id, 'afgerond')}
                          disabled={loadingId === a.id}
                          className="text-green-600 hover:bg-green-50"
                        >
                          <CheckCircle className="h-4 w-4" />
                          Afgerond
                        </Button>
                      </div>
                    )}
                    {verwerkt && a.status === 'afgerond' && (
                      <div className="flex items-center gap-2 mt-2 pl-8">
                        {a.toegewezen_naam && <span className="text-xs text-gray-400">door {a.toegewezen_naam}</span>}
                        <Button size="sm" variant="ghost" onClick={() => handleStatus(a.id, 'open')} disabled={loadingId === a.id} className="text-gray-500 hover:text-gray-700">
                          Heropenen
                        </Button>
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  )
}
