'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { type ColumnDef } from '@tanstack/react-table'
import { DataTable } from '@/components/ui/data-table'
import { PageHeader } from '@/components/ui/page-header'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { EmptyState } from '@/components/ui/empty-state'
import { formatCurrency, formatDateShort } from '@/lib/utils'
import { orderStatussen, statusKleuren } from '@/lib/constants'
import { Plus, ShoppingCart, AlertTriangle, CheckCircle, Clock } from 'lucide-react'

interface FactuurInfo {
  id: string
  factuurnummer: string
  factuur_type: string | null
  status: string
  totaal: number
  betaald_bedrag: number
}

interface Order {
  id: string
  ordernummer: string
  datum: string
  status: string
  totaal: number
  subtotaal: number | null
  btw_totaal: number | null
  relatie: { bedrijfsnaam: string } | null
  onderwerp: string | null
  facturen: FactuurInfo[]
  aanbetaling: FactuurInfo | null
  restbetaling: FactuurInfo | null
  volledigFactuur: FactuurInfo | null
}

const statusLabels: Record<string, string> = {
  nieuw: 'Nieuw', in_behandeling: 'In behandeling', geleverd: 'Geleverd',
  gefactureerd: 'Gefactureerd', geannuleerd: 'Geannuleerd',
}

function FactuurStatusCell({ order }: { order: Order }) {
  if (order.facturen.length === 0) {
    return <span className="text-gray-300 text-xs">-</span>
  }

  const heeftSplit = !!order.aanbetaling
  const orderGeleverd = order.status === 'geleverd' || order.status === 'gefactureerd'

  if (order.volledigFactuur) {
    const f = order.volledigFactuur
    return (
      <div className="flex items-center gap-1.5">
        <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium bg-gray-100 text-gray-600">
          100%
        </span>
        <Badge status={f.status} />
      </div>
    )
  }

  if (!heeftSplit) return <span className="text-gray-300 text-xs">-</span>

  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-center gap-1.5">
        <span className="inline-flex items-center justify-center w-4 h-4 rounded-full text-[9px] font-bold bg-amber-100 text-amber-700">1</span>
        <Badge status={order.aanbetaling!.status} />
      </div>
      {order.restbetaling ? (
        <div className="flex items-center gap-1.5">
          <span className="inline-flex items-center justify-center w-4 h-4 rounded-full text-[9px] font-bold bg-indigo-100 text-indigo-700">2</span>
          <Badge status={order.restbetaling.status} />
        </div>
      ) : (
        <div className="flex items-center gap-1">
          <AlertTriangle className="h-3 w-3 text-amber-500" />
          <span className="text-[10px] text-amber-600 font-medium">Eindafrekening ontbreekt</span>
        </div>
      )}
    </div>
  )
}

function ActieCell({ order }: { order: Order }) {
  const heeftAanbetaling = !!order.aanbetaling
  const heeftRestbetaling = !!order.restbetaling
  const restNietVerstuurd = heeftRestbetaling && order.restbetaling!.status === 'concept'
  const orderGeleverd = order.status === 'geleverd' || order.status === 'gefactureerd'

  if (heeftAanbetaling && !heeftRestbetaling) {
    return (
      <span className="inline-flex items-center gap-1 text-[10px] text-amber-700 bg-amber-50 px-2 py-1 rounded-full font-medium">
        <AlertTriangle className="h-3 w-3" />
        Eindafrekening nodig
      </span>
    )
  }

  if (restNietVerstuurd && orderGeleverd) {
    return (
      <span className="inline-flex items-center gap-1 text-[10px] text-green-700 bg-green-50 px-2 py-1 rounded-full font-medium">
        <CheckCircle className="h-3 w-3" />
        Restbetaling versturen
      </span>
    )
  }

  if (restNietVerstuurd && !orderGeleverd) {
    return (
      <span className="inline-flex items-center gap-1 text-[10px] text-gray-500 bg-gray-50 px-2 py-1 rounded-full font-medium">
        <Clock className="h-3 w-3" />
        Wacht op levering
      </span>
    )
  }

  if (order.facturen.length > 0 && order.facturen.every(f => f.status === 'betaald')) {
    return (
      <span className="inline-flex items-center gap-1 text-[10px] text-green-600">
        <CheckCircle className="h-3 w-3" />
        Betaald
      </span>
    )
  }

  return null
}

const columns: ColumnDef<Order, unknown>[] = [
  { accessorKey: 'ordernummer', header: 'Nummer', cell: ({ getValue }) => <span className="font-medium">{getValue() as string}</span> },
  { accessorKey: 'datum', header: 'Datum', cell: ({ getValue }) => formatDateShort(getValue() as string) },
  { id: 'relatie', header: 'Relatie', accessorFn: (row) => row.relatie?.bedrijfsnaam || '-' },
  { accessorKey: 'onderwerp', header: 'Onderwerp' },
  { accessorKey: 'status', header: 'Status', cell: ({ getValue }) => <Badge status={getValue() as string} /> },
  {
    id: 'bedrag_excl',
    header: 'Bedrag excl. BTW',
    accessorFn: (row) => row.subtotaal ?? ((row.totaal || 0) - (row.btw_totaal || 0)),
    cell: ({ getValue }) => formatCurrency(getValue() as number),
  },
  {
    id: 'facturatie',
    header: 'Facturatie',
    cell: ({ row }) => <FactuurStatusCell order={row.original} />,
  },
  {
    id: 'actie',
    header: '',
    cell: ({ row }) => <ActieCell order={row.original} />,
  },
]

export function OrderList({ orders }: { orders: Order[] }) {
  const router = useRouter()
  const [statusFilter, setStatusFilter] = useState<string | null>(null)

  const filteredOrders = statusFilter
    ? orders.filter(o => o.status === statusFilter)
    : orders

  const actieNodig = orders.filter(o =>
    (o.aanbetaling && !o.restbetaling) ||
    (o.restbetaling && o.restbetaling.status === 'concept' && (o.status === 'geleverd' || o.status === 'gefactureerd'))
  ).length

  return (
    <div>
      <PageHeader
        title="Orders"
        description="Beheer uw orders"
        actions={
          <div className="flex gap-2">
            <Link href="/offertes">
              <Button variant="secondary">Terug naar offertes</Button>
            </Link>
            <Button onClick={() => router.push('/offertes/orders/nieuw')}>
              <Plus className="h-4 w-4" />
              Nieuwe order
            </Button>
          </div>
        }
      />

      {actieNodig > 0 && (
        <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 mb-4 flex items-center gap-2">
          <AlertTriangle className="h-4 w-4 text-amber-600 flex-shrink-0" />
          <p className="text-sm text-amber-800">
            <strong>{actieNodig}</strong> {actieNodig === 1 ? 'klus heeft' : 'klussen hebben'} een facturatie-actie nodig
          </p>
        </div>
      )}

      {orders.length === 0 ? (
        <EmptyState
          icon={ShoppingCart}
          title="Geen orders"
          description="U heeft nog geen orders aangemaakt."
          action={
            <Button onClick={() => router.push('/offertes/orders/nieuw')}>
              <Plus className="h-4 w-4" />
              Order aanmaken
            </Button>
          }
        />
      ) : (
        <>
          <div className="mb-4 flex flex-wrap gap-2">
            <button
              onClick={() => setStatusFilter(null)}
              className={`px-3 py-1.5 rounded-full text-xs font-medium transition-colors ${
                statusFilter === null
                  ? 'bg-gray-900 text-white'
                  : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
              }`}
            >
              Alle ({orders.length})
            </button>
            {orderStatussen.map(status => {
              const count = orders.filter(o => o.status === status).length
              if (count === 0) return null
              return (
                <button
                  key={status}
                  onClick={() => setStatusFilter(status === statusFilter ? null : status)}
                  className={`px-3 py-1.5 rounded-full text-xs font-medium transition-all ${
                    statusFilter === status
                      ? statusKleuren[status] + ' ring-2 ring-offset-1 ring-gray-400'
                      : statusKleuren[status] + ' hover:opacity-80'
                  }`}
                >
                  {statusLabels[status] || status} ({count})
                </button>
              )
            })}
          </div>
          <DataTable
            columns={columns}
            data={filteredOrders}
            searchPlaceholder="Zoek order..."
            onRowClick={(row) => router.push(`/offertes/orders/${row.id}`)}
          />
        </>
      )}
    </div>
  )
}
