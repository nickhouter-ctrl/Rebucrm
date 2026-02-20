import { getPortaalDashboard } from '@/lib/portaal-actions'
import { Card, CardContent } from '@/components/ui/card'
import { FileText, Receipt, Truck } from 'lucide-react'
import Link from 'next/link'

export default async function PortaalDashboardPage() {
  const data = await getPortaalDashboard()

  const tiles = [
    {
      label: 'Open offertes',
      value: data.openOffertes,
      icon: FileText,
      color: 'bg-blue-50 text-blue-600',
      href: '/portaal/offertes',
    },
    {
      label: 'Facturen',
      value: data.actieveOrders,
      icon: Receipt,
      color: 'bg-green-50 text-green-600',
      href: '/portaal/facturen',
    },
    {
      label: 'Geplande leveringen',
      value: data.recenteOrders.filter(o => o.status === 'in_behandeling').length,
      icon: Truck,
      color: 'bg-orange-50 text-orange-600',
      href: '/portaal/leveringen',
    },
  ]

  return (
    <div>
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-gray-900">Welkom</h1>
        <p className="text-gray-500 mt-1">Bekijk uw offertes, facturen en leveringen.</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {tiles.map((tile) => (
          <Link key={tile.label} href={tile.href}>
            <Card className="hover:shadow-md transition-shadow cursor-pointer">
              <CardContent className="flex items-center gap-4 py-6">
                <div className={`h-12 w-12 rounded-lg flex items-center justify-center ${tile.color}`}>
                  <tile.icon className="h-6 w-6" />
                </div>
                <div>
                  <p className="text-sm text-gray-500">{tile.label}</p>
                  <p className="text-2xl font-bold text-gray-900">{tile.value}</p>
                </div>
              </CardContent>
            </Card>
          </Link>
        ))}
      </div>
    </div>
  )
}
