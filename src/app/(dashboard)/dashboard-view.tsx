'use client'

import Link from 'next/link'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { formatCurrency } from '@/lib/utils'
import { Users, UserPlus, CheckSquare, AlertCircle, FileText, Clock } from 'lucide-react'

interface DashboardData {
  omzet: number
  openstaand: number
  openOffertes: number
  openTaken: number
  maandOmzet: { maand: string; bedrag: number }[]
  organisaties: { totaal: number; particulier: number; zakelijk: number }
  offertesPerFase: { status: string; aantal: number; bedrag: number }[]
  facturenPerFase: { status: string; aantal: number; bedrag: number }[]
  takenPerCollega: { naam: string; aantal: number }[]
  mijnTaken: { id: string; titel: string; deadline: string | null; prioriteit: string }[]
  openOffertesList: {
    id: string
    offertenummer: string
    relatie_bedrijfsnaam: string
    project_naam: string | null
    totaal: number
    datum: string
    dagen_open: number
  }[]
}

const statusLabels: Record<string, string> = {
  concept: 'Concept',
  verzonden: 'Verzonden',
  geaccepteerd: 'Geaccepteerd',
  afgewezen: 'Afgewezen',
  verlopen: 'Verlopen',
  betaald: 'Betaald',
  deels_betaald: 'Deels betaald',
  vervallen: 'Vervallen',
  gecrediteerd: 'Gecrediteerd',
}

export function DashboardView({ data }: { data: DashboardData | null }) {
  if (!data) {
    return <div className="p-8 text-center text-gray-500">Dashboard laden...</div>
  }

  const maxOmzet = Math.max(...data.maandOmzet.map(m => m.bedrag), 1)
  const maxTaken = Math.max(...data.takenPerCollega.map(t => t.aantal), 1)

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-gray-900">Dashboard</h1>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Linker kolom: 2/3 */}
        <div className="lg:col-span-2 space-y-6">

          {/* Maandomzet grafiek */}
          <Card>
            <div className="px-6 py-4 border-b border-gray-200">
              <h2 className="font-semibold text-gray-900">Maandomzet</h2>
              <p className="text-sm text-gray-500">Afgelopen 12 maanden</p>
            </div>
            <CardContent>
              <div className="flex items-end gap-2 h-48">
                {data.maandOmzet.map((m, i) => (
                  <div key={i} className="flex-1 flex flex-col items-center gap-1">
                    <div className="w-full flex flex-col items-center justify-end h-36">
                      {m.bedrag > 0 && (
                        <span className="text-[10px] text-gray-500 mb-1">
                          {formatCurrency(m.bedrag).replace('€\u00a0', '€')}
                        </span>
                      )}
                      <div
                        className="w-full max-w-[40px] bg-primary rounded-t transition-all"
                        style={{ height: `${Math.max((m.bedrag / maxOmzet) * 100, m.bedrag > 0 ? 4 : 0)}%` }}
                      />
                    </div>
                    <span className="text-[10px] text-gray-500">{m.maand}</span>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Klanten */}
            <Card>
              <div className="px-6 py-4 border-b border-gray-200">
                <h2 className="font-semibold text-gray-900">Klanten</h2>
              </div>
              <CardContent>
                <div className="space-y-3">
                  <Link href="/relatiebeheer" className="flex items-center justify-between p-3 rounded-lg hover:bg-gray-50 transition-colors">
                    <div className="flex items-center gap-3">
                      <div className="p-2 rounded-lg bg-blue-50 text-blue-600"><Users className="h-5 w-5" /></div>
                      <span className="text-sm font-medium text-gray-700">Totaal</span>
                    </div>
                    <span className="text-2xl font-bold text-gray-900">{data.organisaties.totaal}</span>
                  </Link>
                  <Link href="/relatiebeheer" className="flex items-center justify-between p-3 rounded-lg hover:bg-gray-50 transition-colors">
                    <div className="flex items-center gap-3">
                      <div className="p-2 rounded-lg bg-blue-50 text-blue-600"><UserPlus className="h-5 w-5" /></div>
                      <span className="text-sm font-medium text-gray-700">Particulier</span>
                    </div>
                    <span className="text-2xl font-bold text-gray-900">{data.organisaties.particulier}</span>
                  </Link>
                  <Link href="/relatiebeheer" className="flex items-center justify-between p-3 rounded-lg hover:bg-gray-50 transition-colors">
                    <div className="flex items-center gap-3">
                      <div className="p-2 rounded-lg bg-purple-50 text-purple-600"><Users className="h-5 w-5" /></div>
                      <span className="text-sm font-medium text-gray-700">Zakelijk</span>
                    </div>
                    <span className="text-2xl font-bold text-gray-900">{data.organisaties.zakelijk}</span>
                  </Link>
                </div>
              </CardContent>
            </Card>

            {/* Offertes per fase */}
            <Card>
              <div className="px-6 py-4 border-b border-gray-200">
                <h2 className="font-semibold text-gray-900">Offertes per fase</h2>
              </div>
              <CardContent>
                <div className="space-y-2">
                  {data.offertesPerFase.filter(f => f.aantal > 0).map(f => (
                    <div key={f.status} className="flex items-center justify-between py-1.5">
                      <div className="flex items-center gap-2">
                        <Badge status={f.status}>{statusLabels[f.status] || f.status}</Badge>
                      </div>
                      <div className="flex items-center gap-3">
                        <span className="text-sm text-gray-500">{f.aantal}x</span>
                        <span className="text-sm font-medium text-gray-900 w-24 text-right">{formatCurrency(f.bedrag)}</span>
                      </div>
                    </div>
                  ))}
                  {data.offertesPerFase.every(f => f.aantal === 0) && (
                    <p className="text-sm text-gray-500 py-4 text-center">Geen offertes</p>
                  )}
                </div>
              </CardContent>
            </Card>

            {/* Facturen per fase */}
            <Card>
              <div className="px-6 py-4 border-b border-gray-200">
                <h2 className="font-semibold text-gray-900">Facturen per fase</h2>
              </div>
              <CardContent>
                <div className="space-y-2">
                  {data.facturenPerFase.filter(f => f.aantal > 0).map(f => (
                    <div key={f.status} className="flex items-center justify-between py-1.5">
                      <div className="flex items-center gap-2">
                        <Badge status={f.status}>{statusLabels[f.status] || f.status}</Badge>
                      </div>
                      <div className="flex items-center gap-3">
                        <span className="text-sm text-gray-500">{f.aantal}x</span>
                        <span className="text-sm font-medium text-gray-900 w-24 text-right">{formatCurrency(f.bedrag)}</span>
                      </div>
                    </div>
                  ))}
                  {data.facturenPerFase.every(f => f.aantal === 0) && (
                    <p className="text-sm text-gray-500 py-4 text-center">Geen facturen</p>
                  )}
                </div>
              </CardContent>
            </Card>

            {/* Open taken per collega */}
            <Card>
              <div className="px-6 py-4 border-b border-gray-200">
                <h2 className="font-semibold text-gray-900">Open taken per collega</h2>
              </div>
              <CardContent>
                {data.takenPerCollega.length === 0 ? (
                  <p className="text-sm text-gray-500 py-4 text-center">Geen open taken</p>
                ) : (
                  <div className="space-y-3">
                    {data.takenPerCollega.map(t => (
                      <div key={t.naam} className="space-y-1">
                        <div className="flex justify-between text-sm">
                          <span className="text-gray-700">{t.naam}</span>
                          <span className="font-medium text-gray-900">{t.aantal}</span>
                        </div>
                        <div className="w-full bg-gray-100 rounded-full h-2">
                          <div
                            className="bg-primary rounded-full h-2 transition-all"
                            style={{ width: `${(t.aantal / maxTaken) * 100}%` }}
                          />
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        </div>

        {/* Rechter kolom: 1/3 */}
        <div className="space-y-6">
          {/* Open offertes */}
          <Card>
            <div className="px-6 py-4 border-b border-gray-200 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <FileText className="h-4 w-4 text-gray-500" />
                <h2 className="font-semibold text-gray-900">Open offertes</h2>
              </div>
              {data.openOffertesList.length > 0 && (
                <span className="text-xs font-medium text-gray-500">{data.openOffertesList.length} verzonden</span>
              )}
            </div>
            <CardContent>
              {data.openOffertesList.length === 0 ? (
                <div className="py-6 text-center">
                  <FileText className="h-8 w-8 text-gray-300 mx-auto mb-2" />
                  <p className="text-sm text-gray-500">Geen openstaande offertes</p>
                </div>
              ) : (
                <div className="space-y-2">
                  {data.openOffertesList.map(o => {
                    const isUrgent = o.dagen_open > 14
                    const isWarning = o.dagen_open > 7
                    return (
                      <Link
                        key={o.id}
                        href={`/offertes/${o.id}`}
                        className={`block p-3 rounded-lg hover:bg-gray-50 transition-colors border ${
                          isUrgent ? 'border-red-200 bg-red-50/50' : isWarning ? 'border-orange-200 bg-orange-50/50' : 'border-gray-100'
                        }`}
                      >
                        <div className="flex items-start justify-between gap-2">
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium text-gray-900 truncate">{o.relatie_bedrijfsnaam}</p>
                            <p className="text-xs text-gray-500 truncate">
                              {o.offertenummer}
                              {o.project_naam && ` · ${o.project_naam}`}
                            </p>
                          </div>
                          <span className="text-sm font-medium text-gray-900 whitespace-nowrap">{formatCurrency(o.totaal)}</span>
                        </div>
                        <div className="flex items-center gap-1 mt-1.5">
                          <Clock className={`h-3 w-3 ${isUrgent ? 'text-red-500' : isWarning ? 'text-orange-500' : 'text-gray-400'}`} />
                          <span className={`text-xs font-medium ${
                            isUrgent ? 'text-red-600' : isWarning ? 'text-orange-600' : 'text-gray-500'
                          }`}>
                            {o.dagen_open} dagen open
                            {isUrgent && ' — Opvolgen!'}
                            {!isUrgent && isWarning && ' — Herinnering'}
                          </span>
                        </div>
                      </Link>
                    )
                  })}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Mijn taken */}
          <Card>
            <div className="px-6 py-4 border-b border-gray-200">
              <h2 className="font-semibold text-gray-900">Mijn openstaande taken</h2>
            </div>
            <CardContent>
              {data.mijnTaken.length === 0 ? (
                <div className="py-8 text-center">
                  <CheckSquare className="h-8 w-8 text-gray-300 mx-auto mb-2" />
                  <p className="text-sm text-gray-500">Geen openstaande taken</p>
                </div>
              ) : (
                <div className="space-y-2">
                  {data.mijnTaken.map(t => (
                    <Link key={t.id} href={`/taken/${t.id}`} className="block p-3 rounded-lg hover:bg-gray-50 transition-colors border border-gray-100">
                      <div className="flex items-start gap-2">
                        <div className="flex-1">
                          <p className="text-sm font-medium text-gray-900">{t.titel}</p>
                          {t.deadline && (
                            <p className="text-xs text-gray-500 mt-1">
                              {new Date(t.deadline) < new Date() ? (
                                <span className="text-red-500 flex items-center gap-1">
                                  <AlertCircle className="h-3 w-3" />
                                  Verlopen: {new Date(t.deadline).toLocaleDateString('nl-NL')}
                                </span>
                              ) : (
                                `Deadline: ${new Date(t.deadline).toLocaleDateString('nl-NL')}`
                              )}
                            </p>
                          )}
                        </div>
                        <Badge status={t.prioriteit}>{t.prioriteit}</Badge>
                      </div>
                    </Link>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  )
}
