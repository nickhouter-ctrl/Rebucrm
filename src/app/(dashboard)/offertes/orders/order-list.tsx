'use client'

import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { type ColumnDef } from '@tanstack/react-table'
import { DataTable } from '@/components/ui/data-table'
import { PageHeader } from '@/components/ui/page-header'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { EmptyState } from '@/components/ui/empty-state'
import { formatCurrency, formatDateShort } from '@/lib/utils'
import { Plus, ShoppingCart } from 'lucide-react'

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
        <DataTable
          columns={columns}
          data={orders}
          searchPlaceholder="Zoek order..."
          onRowClick={(row) => router.push(`/offertes/orders/${row.id}`)}
        />
      )}
    </div>
  )
}
