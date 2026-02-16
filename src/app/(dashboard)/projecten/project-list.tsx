'use client'

import { useRouter } from 'next/navigation'
import { type ColumnDef } from '@tanstack/react-table'
import { DataTable } from '@/components/ui/data-table'
import { PageHeader } from '@/components/ui/page-header'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { EmptyState } from '@/components/ui/empty-state'
import { Plus, FolderKanban } from 'lucide-react'

interface Project {
  id: string
  naam: string
  status: string
  budget: number | null
  uurtarief: number | null
  relatie: { bedrijfsnaam: string } | null
  aantal_offertes: number
  laatste_offerte_status: string | null
}

const columns: ColumnDef<Project, unknown>[] = [
  { accessorKey: 'naam', header: 'Project' },
  { id: 'relatie', header: 'Klant', accessorFn: (row) => row.relatie?.bedrijfsnaam || '-' },
  { accessorKey: 'status', header: 'Status', cell: ({ getValue }) => <Badge status={getValue() as string} /> },
  {
    id: 'offertes',
    header: 'Offertes',
    accessorFn: (row) => row.aantal_offertes,
    cell: ({ row }) => {
      const aantal = row.original.aantal_offertes
      const status = row.original.laatste_offerte_status
      if (aantal === 0) return <span className="text-gray-400">-</span>
      return (
        <div className="flex items-center gap-2">
          <span className="text-sm">{aantal}x</span>
          {status && <Badge status={status} />}
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
