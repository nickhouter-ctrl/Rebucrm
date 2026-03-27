'use client'

import { useRouter } from 'next/navigation'
import { type ColumnDef } from '@tanstack/react-table'
import { DataTable } from '@/components/ui/data-table'
import { PageHeader } from '@/components/ui/page-header'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { EmptyState } from '@/components/ui/empty-state'
import { formatCurrency } from '@/lib/utils'
import { Plus, FolderKanban } from 'lucide-react'

interface Project {
  id: string
  naam: string
  status: string
  budget: number | null
  uurtarief: number | null
  relatie: { bedrijfsnaam: string } | null
  aantal_offertes: number
  laatste_offerte_id: string | null
  laatste_offerte_nummer: string | null
  laatste_offerte_status: string | null
  laatste_offerte_bedrag: number | null
}

const columns: ColumnDef<Project, unknown>[] = [
  { accessorKey: 'naam', header: 'Project' },
  { id: 'relatie', header: 'Klant', accessorFn: (row) => row.relatie?.bedrijfsnaam || '-' },
  { accessorKey: 'status', header: 'Status', cell: ({ getValue }) => <Badge status={getValue() as string} /> },
  {
    id: 'offerte',
    header: 'Laatste offerte',
    accessorFn: (row) => row.laatste_offerte_nummer,
    cell: ({ row }) => {
      const { laatste_offerte_nummer, laatste_offerte_status, laatste_offerte_bedrag } = row.original
      if (!laatste_offerte_nummer) return <span className="text-gray-400">-</span>
      return (
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium">{laatste_offerte_nummer}</span>
          {laatste_offerte_status && <Badge status={laatste_offerte_status} />}
          {laatste_offerte_bedrag != null && laatste_offerte_bedrag > 0 && (
            <span className="text-sm text-gray-500">{formatCurrency(laatste_offerte_bedrag)}</span>
          )}
        </div>
      )
    },
  },
]

export function ProjectList({ projecten }: { projecten: Project[] }) {
  const router = useRouter()

  return (
    <div>
      <PageHeader title="Projecten" description="Overzicht van alle projecten en verkoopkansen" actions={<Button onClick={() => router.push('/projecten/nieuw')}><Plus className="h-4 w-4" />Nieuw project</Button>} />
      {projecten.length === 0 ? (
        <EmptyState icon={FolderKanban} title="Geen projecten" description="U heeft nog geen projecten." action={<Button onClick={() => router.push('/projecten/nieuw')}><Plus className="h-4 w-4" />Project aanmaken</Button>} />
      ) : (
        <DataTable columns={columns} data={projecten} searchPlaceholder="Zoek project..." onRowClick={(row) => router.push(`/projecten/${row.id}`)} />
      )}
    </div>
  )
}
