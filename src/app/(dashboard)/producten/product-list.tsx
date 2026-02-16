'use client'

import { useRouter } from 'next/navigation'
import { type ColumnDef } from '@tanstack/react-table'
import { DataTable } from '@/components/ui/data-table'
import { PageHeader } from '@/components/ui/page-header'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { EmptyState } from '@/components/ui/empty-state'
import { formatCurrency } from '@/lib/utils'
import { Plus, Package } from 'lucide-react'

interface Product {
  id: string
  naam: string
  type: string
  prijs: number
  btw_percentage: number
  eenheid: string
  voorraad: number
  voorraad_bijhouden: boolean
  artikelnummer: string | null
}

const columns: ColumnDef<Product, unknown>[] = [
  { accessorKey: 'artikelnummer', header: 'Artikelnr.' },
  { accessorKey: 'naam', header: 'Naam' },
  {
    accessorKey: 'type',
    header: 'Type',
    cell: ({ getValue }) => <Badge status={getValue() as string} />,
  },
  {
    accessorKey: 'prijs',
    header: 'Prijs',
    cell: ({ getValue }) => formatCurrency(getValue() as number),
  },
  {
    accessorKey: 'btw_percentage',
    header: 'BTW',
    cell: ({ getValue }) => `${getValue()}%`,
  },
  { accessorKey: 'eenheid', header: 'Eenheid' },
  {
    accessorKey: 'voorraad',
    header: 'Voorraad',
    cell: ({ row }) =>
      row.original.voorraad_bijhouden ? row.original.voorraad : '-',
  },
]

export function ProductList({ producten }: { producten: Product[] }) {
  const router = useRouter()

  return (
    <div>
      <PageHeader
        title="Producten"
        description="Beheer uw producten en diensten"
        actions={
          <Button onClick={() => router.push('/producten/nieuw')}>
            <Plus className="h-4 w-4" />
            Nieuw product
          </Button>
        }
      />

      {producten.length === 0 ? (
        <EmptyState
          icon={Package}
          title="Geen producten"
          description="U heeft nog geen producten of diensten toegevoegd."
          action={
            <Button onClick={() => router.push('/producten/nieuw')}>
              <Plus className="h-4 w-4" />
              Product toevoegen
            </Button>
          }
        />
      ) : (
        <DataTable
          columns={columns}
          data={producten}
          searchPlaceholder="Zoek product..."
          onRowClick={(row) => router.push(`/producten/${row.id}`)}
        />
      )}
    </div>
  )
}
