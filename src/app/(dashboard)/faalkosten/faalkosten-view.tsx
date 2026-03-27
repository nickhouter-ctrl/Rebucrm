'use client'

import Link from 'next/link'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { formatCurrency } from '@/lib/utils'
import { Plus, AlertTriangle } from 'lucide-react'
import { faalkostenCategorieLabels } from '@/lib/constants'

interface Faalkost {
  id: string
  omschrijving: string
  categorie: string | null
  bedrag: number
  datum: string
  verantwoordelijke: string | null
  opgelost: boolean
  project: { naam: string } | null
  offerte: { offertenummer: string } | null
}

export function FaalkostenView({ faalkosten }: { faalkosten: Faalkost[] }) {
  const totaal = faalkosten.reduce((sum, f) => sum + (f.bedrag || 0), 0)
  const openTotaal = faalkosten.filter(f => !f.opgelost).reduce((sum, f) => sum + (f.bedrag || 0), 0)

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Faalkosten</h1>
          <p className="text-sm text-gray-500 mt-1">
            Totaal: {formatCurrency(totaal)} &middot; Open: {formatCurrency(openTotaal)}
          </p>
        </div>
        <Link href="/faalkosten/nieuw">
          <Button>
            <Plus className="h-4 w-4" />
            Nieuwe faalkost
          </Button>
        </Link>
      </div>

      <Card>
        <CardContent className="p-0">
          {faalkosten.length === 0 ? (
            <div className="py-12 text-center">
              <AlertTriangle className="h-8 w-8 text-gray-300 mx-auto mb-2" />
              <p className="text-gray-500">Geen faalkosten geregistreerd</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-gray-200 text-left text-xs font-medium text-gray-500 uppercase">
                    <th className="px-4 py-3">Datum</th>
                    <th className="px-4 py-3">Omschrijving</th>
                    <th className="px-4 py-3">Categorie</th>
                    <th className="px-4 py-3">Project</th>
                    <th className="px-4 py-3 text-right">Bedrag</th>
                    <th className="px-4 py-3">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {faalkosten.map(f => (
                    <tr key={f.id} className="hover:bg-gray-50 transition-colors">
                      <td className="px-4 py-3 text-sm text-gray-600">
                        {new Date(f.datum).toLocaleDateString('nl-NL')}
                      </td>
                      <td className="px-4 py-3">
                        <Link href={`/faalkosten/${f.id}`} className="text-sm font-medium text-gray-900 hover:text-primary">
                          {f.omschrijving}
                        </Link>
                      </td>
                      <td className="px-4 py-3 text-sm text-gray-600">
                        {f.categorie ? faalkostenCategorieLabels[f.categorie] || f.categorie : '-'}
                      </td>
                      <td className="px-4 py-3 text-sm text-gray-600">
                        {f.project?.naam || '-'}
                      </td>
                      <td className="px-4 py-3 text-sm font-medium text-right text-red-600">
                        {formatCurrency(f.bedrag)}
                      </td>
                      <td className="px-4 py-3">
                        <Badge status={f.opgelost ? 'afgerond' : 'open'}>
                          {f.opgelost ? 'Opgelost' : 'Open'}
                        </Badge>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
