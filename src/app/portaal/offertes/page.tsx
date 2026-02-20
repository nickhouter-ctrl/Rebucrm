import { getPortaalOffertes } from '@/lib/portaal-actions'
import { PageHeader } from '@/components/ui/page-header'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { formatCurrency, formatDateShort } from '@/lib/utils'
import Link from 'next/link'

export default async function PortaalOffertesPage() {
  const offertes = await getPortaalOffertes()

  return (
    <div>
      <PageHeader title="Offertes" description="Bekijk al uw offertes." />

      <Card>
        <CardContent className="p-0">
          {offertes.length === 0 ? (
            <p className="px-6 py-8 text-sm text-gray-500 text-center">Geen offertes gevonden.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-200 bg-gray-50">
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Offertenummer</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Datum</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Onderwerp</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Status</th>
                    <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase">Totaal</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {offertes.map((offerte) => (
                    <tr key={offerte.id} className="hover:bg-gray-50 transition-colors">
                      <td className="px-6 py-3">
                        <Link href={`/portaal/offertes/${offerte.id}`} className="text-primary hover:underline font-medium">
                          {offerte.offertenummer}
                        </Link>
                      </td>
                      <td className="px-6 py-3 text-gray-600">{formatDateShort(offerte.datum)}</td>
                      <td className="px-6 py-3 text-gray-900">{offerte.onderwerp || '-'}</td>
                      <td className="px-6 py-3">
                        <Badge status={offerte.status} />
                      </td>
                      <td className="px-6 py-3 text-right font-medium text-gray-900">{formatCurrency(offerte.totaal || 0)}</td>
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
