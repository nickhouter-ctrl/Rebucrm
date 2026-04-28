import { getPortaalDashboard } from '@/lib/portaal-actions'
import { Card, CardContent } from '@/components/ui/card'
import { FileText, Receipt, Truck, Mail } from 'lucide-react'
import Link from 'next/link'
import { OrderStatusTracker } from '@/components/portaal/order-status-tracker'

function formatDate(d: string) {
  try { return new Date(d).toLocaleDateString('nl-NL', { day: '2-digit', month: '2-digit', year: 'numeric' }) } catch { return d }
}
function formatCurrency(n: number) {
  return new Intl.NumberFormat('nl-NL', { style: 'currency', currency: 'EUR' }).format(n || 0)
}

export default async function PortaalDashboardPage() {
  const data = await getPortaalDashboard()

  const tiles = [
    { label: 'Open offertes', value: data.openOffertes, icon: FileText, color: 'bg-blue-50 text-blue-600', href: '/portaal/offertes' },
    { label: 'Facturen', value: data.actieveOrders, icon: Receipt, color: 'bg-green-50 text-green-600', href: '/portaal/facturen' },
    { label: 'Geplande leveringen', value: data.recenteOrders.filter(o => o.status === 'in_behandeling').length, icon: Truck, color: 'bg-orange-50 text-orange-600', href: '/portaal/leveringen' },
    { label: 'Berichten', value: data.ongelezen, icon: Mail, color: 'bg-purple-50 text-purple-600', href: '/portaal/emails' },
  ]

  return (
    <div>
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-gray-900">Welkom</h1>
        <p className="text-gray-500 mt-1">Bekijk uw offertes, e-mails en leveringen.</p>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
        {tiles.map((tile) => (
          <Link key={tile.label} href={tile.href}>
            <Card className="hover:shadow-md transition-shadow cursor-pointer">
              <CardContent className="flex items-center gap-3 py-5">
                <div className={`h-10 w-10 rounded-lg flex items-center justify-center ${tile.color}`}>
                  <tile.icon className="h-5 w-5" />
                </div>
                <div>
                  <p className="text-xs text-gray-500">{tile.label}</p>
                  <p className="text-xl font-bold text-gray-900">{tile.value}</p>
                </div>
              </CardContent>
            </Card>
          </Link>
        ))}
      </div>

      {/* Status van actieve orders */}
      {data.recenteOrders.filter(o => o.status !== 'afgerond').length > 0 && (
        <div className="mb-6">
          <h2 className="text-sm font-semibold text-gray-900 mb-2 flex items-center gap-2">
            <Truck className="h-4 w-4 text-orange-500" />
            Status van uw actieve orders
          </h2>
          <div className="space-y-2">
            {data.recenteOrders.filter(o => o.status !== 'afgerond').slice(0, 3).map(o => (
              <OrderStatusTracker
                key={o.id}
                order={{ id: o.id, ordernummer: o.ordernummer, status: o.status, leverdatum: (o as { leverdatum?: string | null }).leverdatum, betaald: false }}
              />
            ))}
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Recente offertes */}
        <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
          <div className="px-5 py-3.5 border-b border-gray-100 flex items-center justify-between">
            <h3 className="text-sm font-semibold text-gray-900 flex items-center gap-2"><FileText className="h-4 w-4 text-blue-500" />Recente offertes</h3>
            <Link href="/portaal/offertes" className="text-xs text-[#00a66e] hover:underline">Alle</Link>
          </div>
          {data.recenteOffertes.length === 0 ? (
            <p className="text-sm text-gray-400 p-5 text-center">Geen offertes</p>
          ) : (
            <div className="divide-y divide-gray-50">
              {data.recenteOffertes.map(o => (
                <Link key={o.id} href={`/portaal/offertes/${o.id}`} className="flex items-center justify-between px-5 py-3 hover:bg-gray-50">
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-gray-900 truncate">{o.offertenummer} · {o.onderwerp || '-'}</p>
                    <p className="text-xs text-gray-400">{formatDate(o.datum)} · {o.status}</p>
                  </div>
                  <p className="text-sm font-semibold text-gray-900 shrink-0 ml-3">{formatCurrency(o.totaal)}</p>
                </Link>
              ))}
            </div>
          )}
        </div>

        {/* Recente e-mails */}
        <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
          <div className="px-5 py-3.5 border-b border-gray-100 flex items-center justify-between">
            <h3 className="text-sm font-semibold text-gray-900 flex items-center gap-2"><Mail className="h-4 w-4 text-purple-500" />Verzonden e-mails</h3>
            <Link href="/portaal/emails" className="text-xs text-[#00a66e] hover:underline">Alle</Link>
          </div>
          {(data.recenteEmails || []).length === 0 ? (
            <p className="text-sm text-gray-400 p-5 text-center">Nog geen e-mails</p>
          ) : (
            <div className="divide-y divide-gray-50">
              {(data.recenteEmails || []).map(e => (
                <div key={e.id} className="px-5 py-3">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium text-gray-900 truncate">{e.onderwerp}</p>
                      <p className="text-xs text-gray-400 truncate">{e.offertenummer ? `Offerte ${e.offertenummer}` : e.aan}</p>
                    </div>
                    <span className="text-xs text-gray-400 shrink-0">{formatDate(e.verstuurd_op)}</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
