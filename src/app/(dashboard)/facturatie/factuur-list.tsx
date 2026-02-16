'use client'

import { useRouter } from 'next/navigation'
import { type ColumnDef } from '@tanstack/react-table'
import { DataTable } from '@/components/ui/data-table'
import { PageHeader } from '@/components/ui/page-header'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { EmptyState } from '@/components/ui/empty-state'
import { formatCurrency, formatDateShort } from '@/lib/utils'
import { Plus, Receipt } from 'lucide-react'

interface Factuur {
  id: string
  factuurnummer: string
  datum: string
  vervaldatum: string | null
  status: string
  totaal: number
  betaald_bedrag: number
  relatie: { bedrijfsnaam: string } | null
}

const columns: ColumnDef<Factuur, unknown>[] = [
  { accessorKey: 'factuurnummer', header: 'Nummer' },
  { accessorKey: 'datum', header: 'Datum', cell: ({ getValue }) => formatDateShort(getValue() as string) },
  { id: 'relatie', header: 'Relatie', accessorFn: (row) => row.relatie?.bedrijfsnaam || '-' },
  { accessorKey: 'status', header: 'Status', cell: ({ getValue }) => <Badge status={getValue() as string} /> },
  { accessorKey: 'totaal', header: 'Totaal', cell: ({ getValue }) => formatCurrency(getValue() as number) },
  {
    id: 'openstaand',
    header: 'Openstaand',
    accessorFn: (row) => row.totaal - row.betaald_bedrag,
    cell: ({ getValue }) => formatCurrency(getValue() as number),
  },
  {
    accessorKey: 'vervaldatum',
    header: 'Vervaldatum',
    cell: ({ getValue }) => getValue() ? formatDateShort(getValue() as string) : '-',
  },
]

export function FactuurList({ facturen }: { facturen: Factuur[] }) {
  const router = useRouter()

  return (
    <div>
      <PageHeader
        title="Facturatie"
        description="Beheer uw facturen"
        actions={
          <Button onClick={() => router.push('/facturatie/nieuw')}>
            <Plus className="h-4 w-4" />
            Nieuwe factuur
          </Button>
        }
      />

      {facturen.length === 0 ? (
        <EmptyState
          icon={Receipt}
          title="Geen facturen"
          description="U heeft nog geen facturen aangemaakt."
          action={
            <Button onClick={() => router.push('/facturatie/nieuw')}>
              <Plus className="h-4 w-4" />
              Factuur aanmaken
            </Button>
          }
        />
      ) : (
        <DataTable
          columns={columns}
          data={facturen}
          searchPlaceholder="Zoek factuur..."
          onRowClick={(row) => router.push(`/facturatie/${row.id}`)}
        />
      )}
    </div>
  )
}
