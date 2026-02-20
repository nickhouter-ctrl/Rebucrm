import { getPortaalLeveringen } from '@/lib/portaal-actions'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { formatCurrency, formatDateShort } from '@/lib/utils'
import { Truck } from 'lucide-react'

export default async function PortaalLeveringenPage() {
  const leveringen = await getPortaalLeveringen()

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Geplande leveringen</h1>
        <p className="text-gray-500 mt-1">Overzicht van uw geplande leveringen.</p>
      </div>

      <Card>
        <CardContent className="p-0">
          {leveringen.length === 0 ? (
            <div className="px-6 py-12 text-center">
              <Truck className="h-10 w-10 text-gray-300 mx-auto mb-3" />
              <p className="text-sm text-gray-500">Geen geplande leveringen gevonden.</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-200 bg-gray-50">
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Ordernummer</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Onderwerp</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Leverdatum</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Status</th>
                    <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase">Totaal</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {leveringen.map((levering) => (
                    <tr key={levering.id} className="hover:bg-gray-50 transition-colors">
                      <td className="px-6 py-3 font-medium text-gray-900">{levering.ordernummer}</td>
                      <td className="px-6 py-3 text-gray-600">{levering.onderwerp || '-'}</td>
                      <td className="px-6 py-3 text-gray-900 font-medium">{levering.leverdatum ? formatDateShort(levering.leverdatum) : '-'}</td>
                      <td className="px-6 py-3"><Badge status={levering.status} /></td>
                      <td className="px-6 py-3 text-right font-medium text-gray-900">{formatCurrency(levering.totaal || 0)}</td>
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
