import { getPortaalFacturen } from '@/lib/portaal-actions'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { formatCurrency, formatDateShort } from '@/lib/utils'
import { Receipt } from 'lucide-react'

export default async function PortaalFacturenPage() {
  const facturen = await getPortaalFacturen()

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Facturen</h1>
        <p className="text-gray-500 mt-1">Overzicht van uw facturen.</p>
      </div>

      <Card>
        <CardContent className="p-0">
          {facturen.length === 0 ? (
            <div className="px-6 py-12 text-center">
              <Receipt className="h-10 w-10 text-gray-300 mx-auto mb-3" />
              <p className="text-sm text-gray-500">Geen facturen gevonden.</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-200 bg-gray-50">
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Factuurnummer</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Datum</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Vervaldatum</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Status</th>
                    <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase">Totaal</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {facturen.map((factuur) => (
                    <tr key={factuur.id} className="hover:bg-gray-50 transition-colors">
                      <td className="px-6 py-3 font-medium text-gray-900">{factuur.factuurnummer}</td>
                      <td className="px-6 py-3 text-gray-600">{formatDateShort(factuur.datum)}</td>
                      <td className="px-6 py-3 text-gray-600">{factuur.vervaldatum ? formatDateShort(factuur.vervaldatum) : '-'}</td>
                      <td className="px-6 py-3"><Badge status={factuur.status} /></td>
                      <td className="px-6 py-3 text-right font-medium text-gray-900">{formatCurrency(factuur.totaal || 0)}</td>
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
