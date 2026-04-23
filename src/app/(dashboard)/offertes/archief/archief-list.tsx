'use client'
import { useRouter } from 'next/navigation'
import { type ColumnDef } from '@tanstack/react-table'
import { DataTable } from '@/components/ui/data-table'
import { PageHeader } from '@/components/ui/page-header'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { formatCurrency, formatDate } from '@/lib/utils'
import { ArrowLeft, Archive } from 'lucide-react'
import { archiveerOfferte } from '@/lib/actions'
import { useState } from 'react'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function ArchiefOfferteList({ offertes }: { offertes: any[] }) {
  const router = useRouter()
  const [loading, setLoading] = useState('')

  async function handleTerug(id: string) {
    if (!confirm('Terugzetten naar actieve lijst?')) return
    setLoading(id)
    await archiveerOfferte(id, false)
    router.refresh()
    setLoading('')
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const columns: ColumnDef<any, unknown>[] = [
    { accessorKey: 'offertenummer', header: 'Nummer' },
    { id: 'relatie', header: 'Relatie', accessorFn: (r) => r.relatie?.bedrijfsnaam || '-' },
    { accessorKey: 'onderwerp', header: 'Onderwerp' },
    { accessorKey: 'datum', header: 'Datum', cell: ({ getValue }) => getValue() ? formatDate(getValue() as string) : '-' },
    { accessorKey: 'totaal', header: 'Totaal', cell: ({ getValue }) => formatCurrency(getValue() as number) },
    { accessorKey: 'status', header: 'Status', cell: ({ getValue }) => <Badge status={getValue() as string} /> },
    {
      id: 'acties', header: '',
      cell: ({ row }) => (
        <Button variant="ghost" size="sm" disabled={loading === row.original.id} onClick={(e) => { e.stopPropagation(); handleTerug(row.original.id) }}>
          Terug naar actief
        </Button>
      ),
    },
  ]

  return (
    <div>
      <PageHeader
        title="Archief offertes"
        description={`${offertes.length} gearchiveerde offertes — afgehandelde opdrachten`}
        actions={<Button variant="ghost" onClick={() => router.push('/offertes')}><ArrowLeft className="h-4 w-4" />Terug naar actief</Button>}
      />
      {offertes.length === 0 ? (
        <div className="text-center py-12 text-gray-400">
          <Archive className="h-10 w-10 mx-auto mb-2" />
          <p>Archief is leeg</p>
        </div>
      ) : (
        <DataTable columns={columns} data={offertes} searchPlaceholder="Zoek in archief..." onRowClick={(r) => router.push(`/offertes/${r.id}`)} />
      )}
    </div>
  )
}
