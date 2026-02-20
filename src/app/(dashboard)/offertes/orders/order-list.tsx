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
import { Plus, ShoppingCart } from 'lucide-react'

const statusLabels: Record<string, string> = {
  nieuw: 'Nieuw', in_behandeling: 'In behandeling', geleverd: 'Geleverd',
  gefactureerd: 'Gefactureerd', geannuleerd: 'Geannuleerd',
}

interface Order {
  id: string
  ordernummer: string
  datum: string
  status: string
  totaal: number
  relatie: { bedrijfsnaam: string } | null
  onderwerp: string | null
}

const columns: ColumnDef<Order, unknown>[] = [
  { accessorKey: 'ordernummer', header: 'Nummer' },
  { accessorKey: 'datum', header: 'Datum', cell: ({ getValue }) => formatDateShort(getValue() as string) },
  { id: 'relatie', header: 'Relatie', accessorFn: (row) => row.relatie?.bedrijfsnaam || '-' },
  { accessorKey: 'onderwerp', header: 'Onderwerp' },
  { accessorKey: 'status', header: 'Status', cell: ({ getValue }) => <Badge status={getValue() as string} /> },
  { accessorKey: 'totaal', header: 'Totaal', cell: ({ getValue }) => formatCurrency(getValue() as number) },
]

export function OrderList({ orders }: { orders: Order[] }) {
  const router = useRouter()
  const [statusFilter, setStatusFilter] = useState<string | null>(null)

  const filteredOrders = statusFilter
    ? orders.filter(o => o.status === statusFilter)
    : orders

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
