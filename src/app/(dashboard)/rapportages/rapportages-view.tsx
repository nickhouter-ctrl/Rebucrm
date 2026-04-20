'use client'

import { useState, useMemo } from 'react'
import { PageHeader } from '@/components/ui/page-header'
import { Card, CardContent } from '@/components/ui/card'
import { formatCurrency } from '@/lib/utils'
import { ChevronDown, ChevronUp, TrendingUp, TrendingDown, ArrowRight } from 'lucide-react'

interface Factuur {
  id: string
  factuurnummer: string
  subtotaal: number
  totaal: number
  btw_totaal: number
  status: string
  datum: string
  factuur_type: string | null
  onderwerp: string | null
  relatie_id: string | null
  relatie: { bedrijfsnaam: string } | null
}

interface InkoopFactuur {
  id: string
  totaal: number
  subtotaal: number
  btw_totaal: number
  status: string
  datum: string
}

interface Uur {
  id: string
  uren: number
  facturabel: boolean
  datum: string
}

const MAAND_NAMEN = ['Jan', 'Feb', 'Mrt', 'Apr', 'Mei', 'Jun', 'Jul', 'Aug', 'Sep', 'Okt', 'Nov', 'Dec']
const KWARTAAL_NAMEN = ['Q1', 'Q2', 'Q3', 'Q4']

export function RapportagesView({ facturen, inkoopfacturen, uren }: {
  facturen: Factuur[]
  inkoopfacturen: InkoopFactuur[]
  uren: Uur[]
}) {
  const [tab, setTab] = useState<'omzet' | 'klanten' | 'btw' | 'uren'>('omzet')

  // Bepaal beschikbare jaren
  const beschikbareJaren = useMemo(() => {
    const jaren = new Set<number>()
    for (const f of facturen) {
      if (f.datum) jaren.add(new Date(f.datum).getFullYear())
    }
    return [...jaren].sort((a, b) => b - a)
  }, [facturen])

  const [jaar, setJaar] = useState<number>(new Date().getFullYear())

  // Filter facturen op geselecteerd jaar (excl. concept)
  const jaarFacturen = useMemo(() => {
    return facturen.filter(f => {
      if (!f.datum || f.status === 'concept') return false
      return new Date(f.datum).getFullYear() === jaar
    })
  }, [facturen, jaar])

  const alleJaarFacturen = useMemo(() => {
    return facturen.filter(f => f.datum && new Date(f.datum).getFullYear() === jaar)
  }, [facturen, jaar])

  // KPI's
  const totaalOmzet = jaarFacturen.reduce((sum, f) => sum + (f.subtotaal || 0), 0)
  const totaalInclBtw = jaarFacturen.reduce((sum, f) => sum + (f.totaal || 0), 0)
  const totaalBtw = jaarFacturen.reduce((sum, f) => sum + (f.btw_totaal || 0), 0)
  const betaaldOmzet = jaarFacturen.filter(f => f.status === 'betaald').reduce((sum, f) => sum + (f.subtotaal || 0), 0)
  const openstaandOmzet = jaarFacturen.filter(f => ['verzonden', 'deels_betaald', 'vervallen'].includes(f.status)).reduce((sum, f) => sum + (f.subtotaal || 0), 0)
  const vervallenOmzet = jaarFacturen.filter(f => f.status === 'vervallen').reduce((sum, f) => sum + (f.subtotaal || 0), 0)

  // Vergelijking vorig jaar
  const vorigJaarFacturen = useMemo(() => {
    return facturen.filter(f => {
      if (!f.datum || f.status === 'concept') return false
      return new Date(f.datum).getFullYear() === jaar - 1
    })
  }, [facturen, jaar])
  const vorigJaarOmzet = vorigJaarFacturen.reduce((sum, f) => sum + (f.subtotaal || 0), 0)
  const omzetVerschil = vorigJaarOmzet > 0 ? ((totaalOmzet - vorigJaarOmzet) / vorigJaarOmzet * 100) : 0

  // Maandoverzicht
  const maandData = useMemo(() => {
    return MAAND_NAMEN.map((naam, i) => {
      const maandFacturen = jaarFacturen.filter(f => new Date(f.datum).getMonth() === i)
      const omzet = maandFacturen.reduce((sum, f) => sum + (f.subtotaal || 0), 0)
      const inclBtw = maandFacturen.reduce((sum, f) => sum + (f.totaal || 0), 0)
      const btw = maandFacturen.reduce((sum, f) => sum + (f.btw_totaal || 0), 0)
      const aantal = maandFacturen.length
      const betaald = maandFacturen.filter(f => f.status === 'betaald').reduce((sum, f) => sum + (f.subtotaal || 0), 0)
      const openstaand = maandFacturen.filter(f => ['verzonden', 'deels_betaald', 'vervallen'].includes(f.status)).reduce((sum, f) => sum + (f.subtotaal || 0), 0)
      return { naam, maand: i, omzet, inclBtw, btw, aantal, betaald, openstaand }
    })
  }, [jaarFacturen])

  // Kwartaaloverzicht
  const kwartaalData = useMemo(() => {
    return KWARTAAL_NAMEN.map((naam, qi) => {
      const qFacturen = jaarFacturen.filter(f => Math.floor(new Date(f.datum).getMonth() / 3) === qi)
      const omzet = qFacturen.reduce((sum, f) => sum + (f.subtotaal || 0), 0)
      const inclBtw = qFacturen.reduce((sum, f) => sum + (f.totaal || 0), 0)
      const btw = qFacturen.reduce((sum, f) => sum + (f.btw_totaal || 0), 0)
      const aantal = qFacturen.length
      return { naam, omzet, inclBtw, btw, aantal }
    })
  }, [jaarFacturen])

  // Facturen per klant (top)
  const klantData = useMemo(() => {
    const map = new Map<string, { naam: string; omzet: number; inclBtw: number; aantal: number; betaald: number; openstaand: number }>()
    for (const f of jaarFacturen) {
      const naam = f.relatie?.bedrijfsnaam || 'Onbekend'
      const key = f.relatie_id || naam
      if (!map.has(key)) map.set(key, { naam, omzet: 0, inclBtw: 0, aantal: 0, betaald: 0, openstaand: 0 })
      const entry = map.get(key)!
      entry.omzet += f.subtotaal || 0
      entry.inclBtw += f.totaal || 0
      entry.aantal++
      if (f.status === 'betaald') entry.betaald += f.subtotaal || 0
      if (['verzonden', 'deels_betaald', 'vervallen'].includes(f.status)) entry.openstaand += f.subtotaal || 0
    }
    return [...map.values()].sort((a, b) => b.omzet - a.omzet)
  }, [jaarFacturen])

  // Facturen per status
  const statusData = useMemo(() => {
    const statussen = ['betaald', 'verzonden', 'deels_betaald', 'vervallen', 'concept']
    const statusLabels: Record<string, string> = { betaald: 'Betaald', verzonden: 'Verzonden', deels_betaald: 'Deels betaald', vervallen: 'Vervallen', concept: 'Concept' }
    return statussen.map(s => {
      const sf = alleJaarFacturen.filter(f => f.status === s)
      return {
        status: s,
        label: statusLabels[s] || s,
        aantal: sf.length,
        omzet: sf.reduce((sum, f) => sum + (f.subtotaal || 0), 0),
        inclBtw: sf.reduce((sum, f) => sum + (f.totaal || 0), 0),
      }
    }).filter(s => s.aantal > 0)
  }, [alleJaarFacturen])

  // BTW per kwartaal
  const btwKwartaal = useMemo(() => {
    const jaarInkoop = inkoopfacturen.filter(f => f.datum && new Date(f.datum).getFullYear() === jaar && f.status !== 'concept')
    return KWARTAAL_NAMEN.map((naam, qi) => {
      const qVerkoop = jaarFacturen.filter(f => Math.floor(new Date(f.datum).getMonth() / 3) === qi)
      const qInkoop = jaarInkoop.filter(f => Math.floor(new Date(f.datum).getMonth() / 3) === qi)
      const afdracht = qVerkoop.reduce((sum, f) => sum + (f.btw_totaal || 0), 0)
      const voorbelasting = qInkoop.reduce((sum, f) => sum + (f.btw_totaal || 0), 0)
      return { naam, afdracht, voorbelasting, saldo: afdracht - voorbelasting }
    })
  }, [jaarFacturen, inkoopfacturen, jaar])

  // Uren per maand
  const urenJaar = useMemo(() => {
    return uren.filter(u => u.datum && new Date(u.datum).getFullYear() === jaar)
  }, [uren, jaar])

  const urenPerMaand = useMemo(() => {
    return MAAND_NAMEN.map((naam, i) => {
      const mu = urenJaar.filter(u => new Date(u.datum).getMonth() === i)
      return {
        naam,
        totaal: mu.reduce((sum, u) => sum + u.uren, 0),
        facturabel: mu.filter(u => u.facturabel).reduce((sum, u) => sum + u.uren, 0),
      }
    })
  }, [urenJaar])

  // Max omzet voor balk-grafiek
  const maxMaandOmzet = Math.max(...maandData.map(m => m.omzet), 1)

  // Huidige maand highlight
  const huidigeMaand = new Date().getMonth()
  const huidigJaar = new Date().getFullYear()

  // Klanten tabel state
  const [toonAlleKlanten, setToonAlleKlanten] = useState(false)
  const getoondKlanten = toonAlleKlanten ? klantData : klantData.slice(0, 20)

  return (
    <div>
      <PageHeader title="Rapportages" description="Financieel overzicht en analyses" />

      {/* Jaar selector + tabs */}
      <div className="flex flex-wrap items-center gap-3 mb-6">
        <div className="flex gap-2">
          {(['omzet', 'klanten', 'btw', 'uren'] as const).map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`px-4 py-2 text-sm rounded-md transition-colors ${tab === t ? 'bg-primary text-white' : 'bg-white text-gray-700 border border-gray-300 hover:bg-gray-50'}`}
            >
              {t === 'omzet' ? 'Omzet' : t === 'klanten' ? 'Top klanten' : t === 'btw' ? 'BTW' : 'Uren'}
            </button>
          ))}
        </div>
        <div className="ml-auto">
          <select
            value={jaar}
            onChange={(e) => setJaar(Number(e.target.value))}
            className="px-3 py-2 text-sm border border-gray-300 rounded-md bg-white"
          >
            {beschikbareJaren.map(j => (
              <option key={j} value={j}>{j}</option>
            ))}
          </select>
        </div>
      </div>

      {/* === OMZET TAB === */}
      {tab === 'omzet' && (
        <div className="space-y-6">
          {/* KPI kaarten */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <Card>
              <CardContent>
                <p className="text-sm text-gray-500">Gefactureerde omzet</p>
                <p className="text-2xl font-bold text-gray-900">{formatCurrency(totaalOmzet)}</p>
                <p className="text-xs text-gray-400 mt-1">excl. BTW</p>
                {vorigJaarOmzet > 0 && (
                  <div className={`flex items-center gap-1 mt-1 text-xs ${omzetVerschil >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                    {omzetVerschil >= 0 ? <TrendingUp className="h-3 w-3" /> : <TrendingDown className="h-3 w-3" />}
                    {omzetVerschil >= 0 ? '+' : ''}{omzetVerschil.toFixed(1)}% t.o.v. {jaar - 1}
                  </div>
                )}
              </CardContent>
            </Card>
            <Card>
              <CardContent>
                <p className="text-sm text-gray-500">Betaald</p>
                <p className="text-2xl font-bold text-green-600">{formatCurrency(betaaldOmzet)}</p>
                <p className="text-xs text-gray-400 mt-1">{jaarFacturen.filter(f => f.status === 'betaald').length} facturen</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent>
                <p className="text-sm text-gray-500">Openstaand</p>
                <p className="text-2xl font-bold text-blue-600">{formatCurrency(openstaandOmzet)}</p>
                <p className="text-xs text-gray-400 mt-1">{jaarFacturen.filter(f => ['verzonden', 'deels_betaald', 'vervallen'].includes(f.status)).length} facturen</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent>
                <p className="text-sm text-gray-500">Incl. BTW totaal</p>
                <p className="text-2xl font-bold text-gray-700">{formatCurrency(totaalInclBtw)}</p>
                <p className="text-xs text-gray-400 mt-1">BTW: {formatCurrency(totaalBtw)}</p>
              </CardContent>
            </Card>
          </div>

          {/* Facturen per status */}
          <Card>
            <CardContent>
              <h3 className="font-semibold text-gray-900 mb-3">Facturen per status</h3>
              <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
                {statusData.map(s => (
                  <div key={s.status} className="p-3 bg-gray-50 rounded-lg">
                    <p className="text-xs text-gray-500">{s.label}</p>
                    <p className="text-lg font-semibold">{s.aantal}</p>
                    <p className="text-sm text-gray-600">{formatCurrency(s.omzet)}</p>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          {/* Maandoverzicht met staafgrafiek */}
          <Card>
            <CardContent>
              <h3 className="font-semibold text-gray-900 mb-4">Maandoverzicht {jaar}</h3>
              {/* Visuele staafgrafiek */}
              <div className="flex items-end gap-2 h-40 mb-6 px-2">
                {maandData.map((m, i) => {
                  const hoogte = maxMaandOmzet > 0 ? (m.omzet / maxMaandOmzet * 100) : 0
                  const isHuidig = jaar === huidigJaar && i === huidigeMaand
                  return (
                    <div key={i} className="flex-1 flex flex-col items-center gap-1">
                      {m.omzet > 0 && (
                        <span className="text-[10px] text-gray-500 whitespace-nowrap">
                          {(m.omzet / 1000).toFixed(0)}k
                        </span>
                      )}
                      <div
                        className={`w-full rounded-t transition-all ${isHuidig ? 'bg-primary' : 'bg-blue-300'} ${m.omzet === 0 ? 'bg-gray-100' : ''}`}
                        style={{ height: `${Math.max(hoogte, 2)}%` }}
                      />
                      <span className={`text-[10px] ${isHuidig ? 'font-bold text-primary' : 'text-gray-500'}`}>{m.naam}</span>
                    </div>
                  )
                })}
              </div>
              {/* Tabel */}
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b text-left text-gray-500">
                      <th className="pb-2 font-medium">Maand</th>
                      <th className="pb-2 font-medium text-right">Aantal</th>
                      <th className="pb-2 font-medium text-right">Omzet (excl.)</th>
                      <th className="pb-2 font-medium text-right">BTW</th>
                      <th className="pb-2 font-medium text-right">Totaal (incl.)</th>
                      <th className="pb-2 font-medium text-right">Betaald</th>
                      <th className="pb-2 font-medium text-right">Openstaand</th>
                    </tr>
                  </thead>
                  <tbody>
                    {maandData.map((m, i) => {
                      const isHuidig = jaar === huidigJaar && i === huidigeMaand
                      return (
                        <tr key={i} className={`border-b border-gray-100 ${isHuidig ? 'bg-blue-50 font-medium' : ''}`}>
                          <td className="py-2">{m.naam} {jaar}</td>
                          <td className="py-2 text-right">{m.aantal}</td>
                          <td className="py-2 text-right">{formatCurrency(m.omzet)}</td>
                          <td className="py-2 text-right text-gray-500">{formatCurrency(m.btw)}</td>
                          <td className="py-2 text-right">{formatCurrency(m.inclBtw)}</td>
                          <td className="py-2 text-right text-green-600">{formatCurrency(m.betaald)}</td>
                          <td className="py-2 text-right text-blue-600">{m.openstaand > 0 ? formatCurrency(m.openstaand) : '-'}</td>
                        </tr>
                      )
                    })}
                    <tr className="border-t-2 border-gray-300 font-semibold">
                      <td className="py-2">Totaal {jaar}</td>
                      <td className="py-2 text-right">{jaarFacturen.length}</td>
                      <td className="py-2 text-right">{formatCurrency(totaalOmzet)}</td>
                      <td className="py-2 text-right text-gray-500">{formatCurrency(totaalBtw)}</td>
                      <td className="py-2 text-right">{formatCurrency(totaalInclBtw)}</td>
                      <td className="py-2 text-right text-green-600">{formatCurrency(betaaldOmzet)}</td>
                      <td className="py-2 text-right text-blue-600">{openstaandOmzet > 0 ? formatCurrency(openstaandOmzet) : '-'}</td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>

          {/* Kwartaaloverzicht */}
          <Card>
            <CardContent>
              <h3 className="font-semibold text-gray-900 mb-3">Kwartaaloverzicht {jaar}</h3>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b text-left text-gray-500">
                      <th className="pb-2 font-medium">Kwartaal</th>
                      <th className="pb-2 font-medium text-right">Aantal</th>
                      <th className="pb-2 font-medium text-right">Omzet (excl.)</th>
                      <th className="pb-2 font-medium text-right">BTW</th>
                      <th className="pb-2 font-medium text-right">Totaal (incl.)</th>
                    </tr>
                  </thead>
                  <tbody>
                    {kwartaalData.map((q, i) => (
                      <tr key={i} className="border-b border-gray-100">
                        <td className="py-2 font-medium">{q.naam} {jaar}</td>
                        <td className="py-2 text-right">{q.aantal}</td>
                        <td className="py-2 text-right">{formatCurrency(q.omzet)}</td>
                        <td className="py-2 text-right text-gray-500">{formatCurrency(q.btw)}</td>
                        <td className="py-2 text-right">{formatCurrency(q.inclBtw)}</td>
                      </tr>
                    ))}
                    <tr className="border-t-2 border-gray-300 font-semibold">
                      <td className="py-2">Totaal</td>
                      <td className="py-2 text-right">{jaarFacturen.length}</td>
                      <td className="py-2 text-right">{formatCurrency(totaalOmzet)}</td>
                      <td className="py-2 text-right text-gray-500">{formatCurrency(totaalBtw)}</td>
                      <td className="py-2 text-right">{formatCurrency(totaalInclBtw)}</td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* === KLANTEN TAB === */}
      {tab === 'klanten' && (
        <div className="space-y-6">
          <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
            <Card>
              <CardContent>
                <p className="text-sm text-gray-500">Unieke klanten</p>
                <p className="text-2xl font-bold text-gray-900">{klantData.length}</p>
                <p className="text-xs text-gray-400 mt-1">met facturen in {jaar}</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent>
                <p className="text-sm text-gray-500">Gem. omzet per klant</p>
                <p className="text-2xl font-bold text-gray-900">{formatCurrency(klantData.length > 0 ? totaalOmzet / klantData.length : 0)}</p>
                <p className="text-xs text-gray-400 mt-1">excl. BTW</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent>
                <p className="text-sm text-gray-500">Gem. facturen per klant</p>
                <p className="text-2xl font-bold text-gray-900">{klantData.length > 0 ? (jaarFacturen.length / klantData.length).toFixed(1) : 0}</p>
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardContent>
              <h3 className="font-semibold text-gray-900 mb-3">Omzet per klant — {jaar}</h3>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b text-left text-gray-500">
                      <th className="pb-2 font-medium w-8">#</th>
                      <th className="pb-2 font-medium">Klant</th>
                      <th className="pb-2 font-medium text-right">Facturen</th>
                      <th className="pb-2 font-medium text-right">Omzet (excl.)</th>
                      <th className="pb-2 font-medium text-right">Incl. BTW</th>
                      <th className="pb-2 font-medium text-right">Betaald</th>
                      <th className="pb-2 font-medium text-right">Openstaand</th>
                    </tr>
                  </thead>
                  <tbody>
                    {getoondKlanten.map((k, i) => (
                      <tr key={i} className="border-b border-gray-100 hover:bg-gray-50">
                        <td className="py-2 text-gray-400">{i + 1}</td>
                        <td className="py-2 font-medium">{k.naam}</td>
                        <td className="py-2 text-right">{k.aantal}</td>
                        <td className="py-2 text-right">{formatCurrency(k.omzet)}</td>
                        <td className="py-2 text-right text-gray-500">{formatCurrency(k.inclBtw)}</td>
                        <td className="py-2 text-right text-green-600">{formatCurrency(k.betaald)}</td>
                        <td className="py-2 text-right text-blue-600">{k.openstaand > 0 ? formatCurrency(k.openstaand) : '-'}</td>
                      </tr>
                    ))}
                    <tr className="border-t-2 border-gray-300 font-semibold">
                      <td className="py-2" colSpan={2}>Totaal ({klantData.length} klanten)</td>
                      <td className="py-2 text-right">{jaarFacturen.length}</td>
                      <td className="py-2 text-right">{formatCurrency(totaalOmzet)}</td>
                      <td className="py-2 text-right text-gray-500">{formatCurrency(totaalInclBtw)}</td>
                      <td className="py-2 text-right text-green-600">{formatCurrency(betaaldOmzet)}</td>
                      <td className="py-2 text-right text-blue-600">{openstaandOmzet > 0 ? formatCurrency(openstaandOmzet) : '-'}</td>
                    </tr>
                  </tbody>
                </table>
              </div>
              {klantData.length > 20 && (
                <button
                  onClick={() => setToonAlleKlanten(!toonAlleKlanten)}
                  className="mt-3 text-sm text-primary hover:underline flex items-center gap-1"
                >
                  {toonAlleKlanten ? (
                    <><ChevronUp className="h-4 w-4" /> Toon top 20</>
                  ) : (
                    <><ChevronDown className="h-4 w-4" /> Toon alle {klantData.length} klanten</>
                  )}
                </button>
              )}
            </CardContent>
          </Card>
        </div>
      )}

      {/* === BTW TAB === */}
      {tab === 'btw' && (
        <div className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <Card>
              <CardContent>
                <p className="text-sm text-gray-500">BTW afdracht (verkoop)</p>
                <p className="text-2xl font-bold text-gray-900">{formatCurrency(totaalBtw)}</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent>
                <p className="text-sm text-gray-500">BTW voorbelasting (inkoop)</p>
                <p className="text-2xl font-bold text-gray-900">
                  {formatCurrency(inkoopfacturen.filter(f => f.datum && new Date(f.datum).getFullYear() === jaar && f.status !== 'concept').reduce((sum, f) => sum + (f.btw_totaal || 0), 0))}
                </p>
              </CardContent>
            </Card>
            <Card>
              <CardContent>
                <p className="text-sm text-gray-500">BTW saldo (te betalen)</p>
                {(() => {
                  const saldo = totaalBtw - inkoopfacturen.filter(f => f.datum && new Date(f.datum).getFullYear() === jaar && f.status !== 'concept').reduce((sum, f) => sum + (f.btw_totaal || 0), 0)
                  return <p className={`text-2xl font-bold ${saldo >= 0 ? 'text-red-600' : 'text-green-600'}`}>{formatCurrency(saldo)}</p>
                })()}
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardContent>
              <h3 className="font-semibold text-gray-900 mb-3">BTW per kwartaal — {jaar}</h3>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b text-left text-gray-500">
                      <th className="pb-2 font-medium">Kwartaal</th>
                      <th className="pb-2 font-medium text-right">BTW afdracht</th>
                      <th className="pb-2 font-medium text-right">BTW voorbelasting</th>
                      <th className="pb-2 font-medium text-right">Saldo</th>
                    </tr>
                  </thead>
                  <tbody>
                    {btwKwartaal.map((q, i) => (
                      <tr key={i} className="border-b border-gray-100">
                        <td className="py-2 font-medium">{q.naam} {jaar}</td>
                        <td className="py-2 text-right">{formatCurrency(q.afdracht)}</td>
                        <td className="py-2 text-right">{formatCurrency(q.voorbelasting)}</td>
                        <td className={`py-2 text-right font-medium ${q.saldo >= 0 ? 'text-red-600' : 'text-green-600'}`}>
                          {formatCurrency(q.saldo)}
                        </td>
                      </tr>
                    ))}
                    {(() => {
                      const totAfdracht = btwKwartaal.reduce((s, q) => s + q.afdracht, 0)
                      const totVoor = btwKwartaal.reduce((s, q) => s + q.voorbelasting, 0)
                      const totSaldo = totAfdracht - totVoor
                      return (
                        <tr className="border-t-2 border-gray-300 font-semibold">
                          <td className="py-2">Totaal {jaar}</td>
                          <td className="py-2 text-right">{formatCurrency(totAfdracht)}</td>
                          <td className="py-2 text-right">{formatCurrency(totVoor)}</td>
                          <td className={`py-2 text-right ${totSaldo >= 0 ? 'text-red-600' : 'text-green-600'}`}>{formatCurrency(totSaldo)}</td>
                        </tr>
                      )
                    })()}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* === UREN TAB === */}
      {tab === 'uren' && (
        <div className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <Card>
              <CardContent>
                <p className="text-sm text-gray-500">Totaal uren {jaar}</p>
                <p className="text-2xl font-bold text-gray-900">{urenJaar.reduce((s, u) => s + u.uren, 0).toFixed(1)}</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent>
                <p className="text-sm text-gray-500">Facturabele uren</p>
                <p className="text-2xl font-bold text-green-600">{urenJaar.filter(u => u.facturabel).reduce((s, u) => s + u.uren, 0).toFixed(1)}</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent>
                <p className="text-sm text-gray-500">Niet-facturabel</p>
                <p className="text-2xl font-bold text-gray-500">
                  {(urenJaar.reduce((s, u) => s + u.uren, 0) - urenJaar.filter(u => u.facturabel).reduce((s, u) => s + u.uren, 0)).toFixed(1)}
                </p>
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardContent>
              <h3 className="font-semibold text-gray-900 mb-3">Uren per maand — {jaar}</h3>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b text-left text-gray-500">
                      <th className="pb-2 font-medium">Maand</th>
                      <th className="pb-2 font-medium text-right">Totaal</th>
                      <th className="pb-2 font-medium text-right">Facturabel</th>
                      <th className="pb-2 font-medium text-right">Niet-facturabel</th>
                    </tr>
                  </thead>
                  <tbody>
                    {urenPerMaand.map((m, i) => (
                      <tr key={i} className={`border-b border-gray-100 ${jaar === huidigJaar && i === huidigeMaand ? 'bg-blue-50 font-medium' : ''}`}>
                        <td className="py-2">{m.naam} {jaar}</td>
                        <td className="py-2 text-right">{m.totaal > 0 ? m.totaal.toFixed(1) : '-'}</td>
                        <td className="py-2 text-right text-green-600">{m.facturabel > 0 ? m.facturabel.toFixed(1) : '-'}</td>
                        <td className="py-2 text-right text-gray-500">{(m.totaal - m.facturabel) > 0 ? (m.totaal - m.facturabel).toFixed(1) : '-'}</td>
                      </tr>
                    ))}
                    <tr className="border-t-2 border-gray-300 font-semibold">
                      <td className="py-2">Totaal {jaar}</td>
                      <td className="py-2 text-right">{urenPerMaand.reduce((s, m) => s + m.totaal, 0).toFixed(1)}</td>
                      <td className="py-2 text-right text-green-600">{urenPerMaand.reduce((s, m) => s + m.facturabel, 0).toFixed(1)}</td>
                      <td className="py-2 text-right text-gray-500">{urenPerMaand.reduce((s, m) => s + (m.totaal - m.facturabel), 0).toFixed(1)}</td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  )
}
