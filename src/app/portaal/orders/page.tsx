import { getPortaalOrders } from '@/lib/portaal-actions'
import { PageHeader } from '@/components/ui/page-header'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { formatCurrency, formatDateShort } from '@/lib/utils'

export default async function PortaalOrdersPage() {
  const orders = await getPortaalOrders()

  return (
    <div>
      <PageHeader title="Orders" description="Bekijk al uw orders en hun status." />

      <Card>
        <CardContent className="p-0">
          {orders.length === 0 ? (
            <p className="px-6 py-8 text-sm text-gray-500 text-center">Geen orders gevonden.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-200 bg-gray-50">
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Ordernummer</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Datum</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Leverdatum</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Onderwerp</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Status</th>
                    <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase">Totaal</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {orders.map((order) => (
                    <tr key={order.id} className="hover:bg-gray-50 transition-colors">
                      <td className="px-6 py-3 font-medium text-gray-900">{order.ordernummer}</td>
                      <td className="px-6 py-3 text-gray-600">{formatDateShort(order.datum)}</td>
                      <td className="px-6 py-3 text-gray-600">{order.leverdatum ? formatDateShort(order.leverdatum) : '-'}</td>
                      <td className="px-6 py-3 text-gray-900">{order.onderwerp || '-'}</td>
                      <td className="px-6 py-3">
                        <Badge status={order.status} />
                      </td>
                      <td className="px-6 py-3 text-right font-medium text-gray-900">{formatCurrency(order.totaal || 0)}</td>
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
