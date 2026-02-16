'use client'

import { useState } from 'react'
import { PageHeader } from '@/components/ui/page-header'
import { Card, CardContent } from '@/components/ui/card'
import { formatCurrency } from '@/lib/utils'

interface Factuur {
  id: string
  totaal: number
  btw_totaal: number
  status: string
  datum: string
}

interface InkoopFactuur {
  id: string
  totaal: number
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

export function RapportagesView({ facturen, inkoopfacturen, uren }: {
  facturen: Factuur[]
  inkoopfacturen: InkoopFactuur[]
  uren: Uur[]
}) {
  const [tab, setTab] = useState<'omzet' | 'btw' | 'uren'>('omzet')

  // Omzet berekening
  const totalOmzet = facturen
    .filter(f => f.status === 'betaald')
    .reduce((sum, f) => sum + (f.totaal || 0), 0)
  const totalVerzonden = facturen
    .filter(f => f.status === 'verzonden')
    .reduce((sum, f) => sum + (f.totaal || 0), 0)
  const totalVervallen = facturen
    .filter(f => f.status === 'vervallen')
    .reduce((sum, f) => sum + (f.totaal || 0), 0)

  // BTW berekening
  const btwAfdracht = facturen.reduce((sum, f) => sum + (f.btw_totaal || 0), 0)
  const btwVoorbelasting = inkoopfacturen.reduce((sum, f) => sum + (f.btw_totaal || 0), 0)
  const btwSaldo = btwAfdracht - btwVoorbelasting

  // Uren berekening
  const totaalUren = uren.reduce((sum, u) => sum + u.uren, 0)
  const facturabeleUren = uren.filter(u => u.facturabel).reduce((sum, u) => sum + u.uren, 0)

  return (
    <div>
      <PageHeader title="Rapportages" description="Overzichten en analyses" />

      <div className="flex gap-2 mb-6">
        {(['omzet', 'btw', 'uren'] as const).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`px-4 py-2 text-sm rounded-md transition-colors ${tab === t ? 'bg-primary text-white' : 'bg-white text-gray-700 border border-gray-300 hover:bg-gray-50'}`}
          >
            {t === 'omzet' ? 'Omzet' : t === 'btw' ? 'BTW-overzicht' : 'Uren'}
          </button>
        ))}
      </div>

      {tab === 'omzet' && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <Card>
            <CardContent>
              <p className="text-sm text-gray-500">Totale omzet (betaald)</p>
              <p className="text-2xl font-bold text-green-600">{formatCurrency(totalOmzet)}</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent>
              <p className="text-sm text-gray-500">Openstaand (verzonden)</p>
              <p className="text-2xl font-bold text-blue-600">{formatCurrency(totalVerzonden)}</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent>
              <p className="text-sm text-gray-500">Vervallen</p>
              <p className="text-2xl font-bold text-red-600">{formatCurrency(totalVervallen)}</p>
            </CardContent>
          </Card>
          <Card className="md:col-span-3">
            <CardContent>
              <h3 className="font-semibold text-gray-900 mb-2">Factuuroverzicht</h3>
              <p className="text-sm text-gray-500">Totaal {facturen.length} facturen</p>
              <div className="mt-2 grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                <div><span className="text-gray-500">Concept:</span> <strong>{facturen.filter(f => f.status === 'concept').length}</strong></div>
                <div><span className="text-gray-500">Verzonden:</span> <strong>{facturen.filter(f => f.status === 'verzonden').length}</strong></div>
                <div><span className="text-gray-500">Betaald:</span> <strong>{facturen.filter(f => f.status === 'betaald').length}</strong></div>
                <div><span className="text-gray-500">Vervallen:</span> <strong>{facturen.filter(f => f.status === 'vervallen').length}</strong></div>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {tab === 'btw' && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <Card>
            <CardContent>
              <p className="text-sm text-gray-500">BTW afdracht (verkoop)</p>
              <p className="text-2xl font-bold text-gray-900">{formatCurrency(btwAfdracht)}</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent>
              <p className="text-sm text-gray-500">BTW voorbelasting (inkoop)</p>
              <p className="text-2xl font-bold text-gray-900">{formatCurrency(btwVoorbelasting)}</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent>
              <p className="text-sm text-gray-500">BTW saldo (te betalen)</p>
              <p className={`text-2xl font-bold ${btwSaldo >= 0 ? 'text-red-600' : 'text-green-600'}`}>
                {formatCurrency(btwSaldo)}
              </p>
            </CardContent>
          </Card>
        </div>
      )}

      {tab === 'uren' && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <Card>
            <CardContent>
              <p className="text-sm text-gray-500">Totaal uren</p>
              <p className="text-2xl font-bold text-gray-900">{totaalUren}</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent>
              <p className="text-sm text-gray-500">Facturabele uren</p>
              <p className="text-2xl font-bold text-green-600">{facturabeleUren}</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent>
              <p className="text-sm text-gray-500">Niet-facturabele uren</p>
              <p className="text-2xl font-bold text-gray-500">{totaalUren - facturabeleUren}</p>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  )
}
