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
import { offerteStatussen, statusKleuren } from '@/lib/constants'
import { Plus, FileText } from 'lucide-react'

const statusLabels: Record<string, string> = {
  concept: 'Concept', verzonden: 'Verzonden', geaccepteerd: 'Geaccepteerd',
  afgewezen: 'Afgewezen', verlopen: 'Verlopen',
}

interface Offerte {
  id: string
  offertenummer: string
  datum: string
  status: string
  totaal: number
  versie_nummer: number | null
  relatie: { bedrijfsnaam: string } | null
  project: { naam: string } | null
  onderwerp: string | null
}

const columns: ColumnDef<Offerte, unknown>[] = [
  { accessorKey: 'offertenummer', header: 'Nummer' },
  {
    id: 'versie',
    header: 'Versie',
    accessorFn: (row) => row.versie_nummer || 1,
    cell: ({ getValue }) => (
      <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-gray-100 text-gray-700">
        v{getValue() as number}
      </span>
    ),
  },
  {
    accessorKey: 'datum',
    header: 'Datum',
    cell: ({ getValue }) => formatDateShort(getValue() as string),
  },
  {
    id: 'relatie',
    header: 'Relatie',
    accessorFn: (row) => row.relatie?.bedrijfsnaam || '-',
  },
  {
    id: 'project',
    header: 'Project',
    accessorFn: (row) => row.project?.naam || '-',
  },
  { accessorKey: 'onderwerp', header: 'Onderwerp' },
  {
    accessorKey: 'status',
    header: 'Status',
    cell: ({ getValue }) => <Badge status={getValue() as string} />,
  },
  {
    accessorKey: 'totaal',
    header: 'Totaal',
    cell: ({ getValue }) => formatCurrency(getValue() as number),
  },
]

export function OfferteList({ offertes }: { offertes: Offerte[] }) {
  const router = useRouter()
  const [statusFilter, setStatusFilter] = useState<string | null>(null)

  const filteredOffertes = statusFilter
    ? offertes.filter(o => o.status === statusFilter)
    : offertes

  return (
    <div>
      <PageHeader
        title="Offertes & Orders"
        description="Beheer uw offertes en orders"
        actions={
          <div className="flex gap-2">
            <Link href="/offertes/archief">
              <Button variant="ghost">Archief</Button>
            </Link>
            <Link href="/offertes/orders">
              <Button variant="secondary">Orders bekijken</Button>
            </Link>
            <Button onClick={() => router.push('/offertes/nieuw')}>
              <Plus className="h-4 w-4" />
              Nieuwe offerte
            </Button>
          </div>
        }
      />

      {offertes.length === 0 ? (
        <EmptyState
          icon={FileText}
          title="Geen offertes"
          description="U heeft nog geen offertes aangemaakt."
          action={
            <Button onClick={() => router.push('/offertes/nieuw')}>
              <Plus className="h-4 w-4" />
              Offerte aanmaken
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
                  ? 'bg-primary text-white'
                  : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
              }`}
            >
              Alle ({offertes.length})
            </button>
            {offerteStatussen.map(status => {
              const count = offertes.filter(o => o.status === status).length
              if (count === 0) return null
              return (
                <button
                  key={status}
                  onClick={() => setStatusFilter(status === statusFilter ? null : status)}
                  className={`px-3 py-1.5 rounded-full text-xs font-medium transition-all ${
                    statusFilter === status
                      ? statusKleuren[status] + ' ring-2 ring-offset-1 ring-primary/40'
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
            data={filteredOffertes}
            searchPlaceholder="Zoek offerte..."
            onRowClick={(row) => router.push(`/offertes/${row.id}`)}
          />
        </>
      )}
    </div>
  )
}
