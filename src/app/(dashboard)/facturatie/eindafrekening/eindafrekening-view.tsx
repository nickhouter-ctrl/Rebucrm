'use client'
import { useRouter } from 'next/navigation'
import { type ColumnDef } from '@tanstack/react-table'
import { DataTable } from '@/components/ui/data-table'
import { PageHeader } from '@/components/ui/page-header'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { formatCurrency, formatDate } from '@/lib/utils'
import { ArrowLeft, CheckCircle2 } from 'lucide-react'

type Aanbetaling = {
  id: string
  factuurnummer: string
  datum: string | null
  status: string
  subtotaal: number | null
  totaal: number
  onderwerp: string | null
  relatie: { bedrijfsnaam: string } | null
  order_id: string | null
}

export function EindafrekeningView({ aanbetalings }: { aanbetalings: Aanbetaling[] }) {
  const router = useRouter()

  const columns: ColumnDef<Aanbetaling, unknown>[] = [
    { id: 'relatie', header: 'Klant', accessorFn: (r) => r.relatie?.bedrijfsnaam || '-' },
    { accessorKey: 'factuurnummer', header: 'Aanbet-factuur' },
    { accessorKey: 'datum', header: 'Datum', cell: ({ getValue }) => getValue() ? formatDate(getValue() as string) : '-' },
    { accessorKey: 'onderwerp', header: 'Onderwerp' },
    {
      id: 'bedrag_excl',
      header: 'Bedrag aanbet. excl.',
      accessorFn: (r) => r.subtotaal ?? 0,
      cell: ({ getValue }) => formatCurrency(getValue() as number),
    },
    { accessorKey: 'status', header: 'Status', cell: ({ getValue }) => <Badge status={getValue() as string} /> },
  ]

  return (
    <div>
      <PageHeader
        title="Eindafrekening nodig"
        description={`${aanbetalings.length} klanten waar nog een restbetaling/eindfactuur voor verstuurd moet worden`}
        actions={<Button variant="ghost" onClick={() => router.back()}><ArrowLeft className="h-4 w-4" />Terug</Button>}
      />
      {aanbetalings.length === 0 ? (
        <div className="text-center py-12 text-gray-400">
          <CheckCircle2 className="h-10 w-10 mx-auto mb-2 text-green-500" />
          <p>Alle aanbetalingen hebben een eindafrekening.</p>
        </div>
      ) : (
        <DataTable
          columns={columns}
          data={aanbetalings}
          searchPlaceholder="Zoek klant..."
          onRowClick={(r) => router.push(`/facturatie/${r.id}`)}
        />
      )}
    </div>
  )
}
