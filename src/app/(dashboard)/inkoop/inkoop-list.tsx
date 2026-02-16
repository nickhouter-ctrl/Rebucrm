'use client'

import { useRouter } from 'next/navigation'
import { type ColumnDef } from '@tanstack/react-table'
import { DataTable } from '@/components/ui/data-table'
import { PageHeader } from '@/components/ui/page-header'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { EmptyState } from '@/components/ui/empty-state'
import { formatCurrency, formatDateShort } from '@/lib/utils'
import { Plus, ShoppingCart } from 'lucide-react'

interface InkoopFactuur {
  id: string
  factuurnummer: string
  datum: string
  status: string
  totaal: number
  relatie: { bedrijfsnaam: string } | null
}

const columns: ColumnDef<InkoopFactuur, unknown>[] = [
  { accessorKey: 'factuurnummer', header: 'Factuurnummer' },
  { accessorKey: 'datum', header: 'Datum', cell: ({ getValue }) => formatDateShort(getValue() as string) },
  { id: 'relatie', header: 'Leverancier', accessorFn: (row) => row.relatie?.bedrijfsnaam || '-' },
  { accessorKey: 'status', header: 'Status', cell: ({ getValue }) => <Badge status={getValue() as string} /> },
  { accessorKey: 'totaal', header: 'Totaal', cell: ({ getValue }) => formatCurrency(getValue() as number) },
]

export function InkoopList({ facturen }: { facturen: InkoopFactuur[] }) {
  const router = useRouter()

  return (
    <div>
      <PageHeader
        title="Inkoopadministratie"
        description="Beheer uw inkoopfacturen"
        actions={
          <Button onClick={() => router.push('/inkoop/nieuw')}>
            <Plus className="h-4 w-4" />
            Nieuwe inkoopfactuur
          </Button>
        }
      />
      {facturen.length === 0 ? (
        <EmptyState icon={ShoppingCart} title="Geen inkoopfacturen" description="U heeft nog geen inkoopfacturen." action={<Button onClick={() => router.push('/inkoop/nieuw')}><Plus className="h-4 w-4" />Inkoopfactuur toevoegen</Button>} />
      ) : (
        <DataTable columns={columns} data={facturen} searchPlaceholder="Zoek inkoopfactuur..." onRowClick={(row) => router.push(`/inkoop/${row.id}`)} />
      )}
    </div>
  )
}
