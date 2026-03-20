'use client'

import Link from 'next/link'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { PageHeader } from '@/components/ui/page-header'
import { Briefcase, CheckSquare, Clock, Plus } from 'lucide-react'

interface MedewerkerDashboardData {
  medewerkerId: string
  orders: {
    id: string
    gepland_van: string | null
    gepland_tot: string | null
    geschatte_uren: number | null
    rol: string | null
    order: {
      id: string
      ordernummer: string
      onderwerp: string | null
      status: string
      datum: string
      leverdatum: string | null
      relatie: { bedrijfsnaam: string } | null
    } | null
  }[]
  taken: {
    id: string
    titel: string
    status: string
    prioriteit: string
    deadline: string | null
    project: { naam: string } | null
  }[]
  urenDezeWeek: {
    id: string
    datum: string
    uren: number
    omschrijving: string | null
  }[]
}

export function MedewerkerDashboard({ data }: { data: MedewerkerDashboardData | null }) {
  if (!data) {
    return (
      <div className="text-center py-12">
        <p className="text-gray-500">Geen medewerker-profiel gevonden. Neem contact op met uw beheerder.</p>
      </div>
    )
  }

  const totalUren = data.urenDezeWeek.reduce((sum, u) => sum + Number(u.uren), 0)
  const actieveOrders = data.orders.filter(o => o.order && o.order.status !== 'geannuleerd' && o.order.status !== 'gefactureerd')

  return (
    <div>
      <PageHeader
        title="Mijn Dashboard"
        description="Overzicht van uw klussen, taken en uren"
      />

      {/* KPI cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-blue-50 rounded-lg">
                <Briefcase className="h-5 w-5 text-blue-600" />
              </div>
              <div>
                <p className="text-sm text-gray-500">Actieve klussen</p>
                <p className="text-2xl font-bold">{actieveOrders.length}</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-yellow-50 rounded-lg">
                <CheckSquare className="h-5 w-5 text-yellow-600" />
              </div>
              <div>
                <p className="text-sm text-gray-500">Open taken</p>
                <p className="text-2xl font-bold">{data.taken.length}</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-green-50 rounded-lg">
                <Clock className="h-5 w-5 text-green-600" />
              </div>
              <div>
                <p className="text-sm text-gray-500">Uren deze week</p>
                <p className="text-2xl font-bold">{totalUren.toFixed(1)}</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Mijn klussen */}
        <Card>
          <div className="px-6 py-4 border-b border-gray-200">
            <h3 className="font-semibold text-gray-900">Mijn klussen</h3>
          </div>
          <CardContent>
            {actieveOrders.length === 0 ? (
              <p className="text-sm text-gray-400 py-4 text-center">Geen actieve klussen</p>
            ) : (
              <div className="divide-y divide-gray-100">
                {actieveOrders.map(toewijzing => {
                  const order = toewijzing.order
                  if (!order) return null
                  return (
                    <div key={toewijzing.id} className="py-3">
                      <div className="flex items-center justify-between">
                        <div>
                          <div className="flex items-center gap-2">
                            <span className="font-medium text-sm">{order.ordernummer}</span>
                            <Badge status={order.status} />
                          </div>
                          <p className="text-sm text-gray-600">{order.onderwerp || (order.relatie as { bedrijfsnaam: string } | null)?.bedrijfsnaam || '-'}</p>
                          {(toewijzing.gepland_van || toewijzing.gepland_tot) && (
                            <p className="text-xs text-gray-400 mt-1">
                              {toewijzing.gepland_van} — {toewijzing.gepland_tot}
                              {toewijzing.geschatte_uren && ` · ${toewijzing.geschatte_uren}u`}
                            </p>
                          )}
                        </div>
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Mijn taken */}
        <Card>
          <div className="px-6 py-4 border-b border-gray-200 flex items-center justify-between">
            <h3 className="font-semibold text-gray-900">Mijn taken</h3>
            <Link href="/taken/nieuw">
              <Button variant="secondary" size="sm">
                <Plus className="h-3 w-3 mr-1" />
                Nieuwe taak
              </Button>
            </Link>
          </div>
          <CardContent>
            {data.taken.length === 0 ? (
              <p className="text-sm text-gray-400 py-4 text-center">Geen open taken</p>
            ) : (
              <div className="divide-y divide-gray-100">
                {data.taken.map(taak => (
                  <Link key={taak.id} href={`/taken/${taak.id}`} className="block py-3 hover:bg-gray-50 -mx-6 px-6">
                    <div className="flex items-center justify-between">
                      <div>
                        <span className="text-sm font-medium">{taak.titel}</span>
                        {taak.project && (
                          <span className="text-xs text-gray-400 ml-2">{(taak.project as { naam: string }).naam}</span>
                        )}
                      </div>
                      <div className="flex items-center gap-2">
                        <Badge status={taak.prioriteit} />
                        <Badge status={taak.status} />
                      </div>
                    </div>
                    {taak.deadline && (
                      <p className="text-xs text-gray-400 mt-0.5">Deadline: {taak.deadline}</p>
                    )}
                  </Link>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Uren deze week */}
        <Card className="lg:col-span-2">
          <div className="px-6 py-4 border-b border-gray-200 flex items-center justify-between">
            <h3 className="font-semibold text-gray-900">Uren deze week</h3>
            <Link href="/uren">
              <Button size="sm">
                <Clock className="h-4 w-4 mr-1" />
                Uren registreren
              </Button>
            </Link>
          </div>
          <CardContent>
            {data.urenDezeWeek.length === 0 ? (
              <p className="text-sm text-gray-400 py-4 text-center">Nog geen uren geregistreerd deze week</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-gray-200">
                      <th className="text-left py-2 font-medium text-gray-500">Datum</th>
                      <th className="text-left py-2 font-medium text-gray-500">Omschrijving</th>
                      <th className="text-right py-2 font-medium text-gray-500">Uren</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.urenDezeWeek.map(uur => (
                      <tr key={uur.id} className="border-b border-gray-50">
                        <td className="py-2">{uur.datum}</td>
                        <td className="py-2 text-gray-600">{uur.omschrijving || '-'}</td>
                        <td className="py-2 text-right font-medium">{Number(uur.uren).toFixed(1)}</td>
                      </tr>
                    ))}
                    <tr className="font-bold">
                      <td className="py-2" colSpan={2}>Totaal</td>
                      <td className="py-2 text-right">{totalUren.toFixed(1)}</td>
                    </tr>
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
