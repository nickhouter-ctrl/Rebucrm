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
}

const columns: ColumnDef<Project, unknown>[] = [
  { accessorKey: 'naam', header: 'Naam' },
  { id: 'relatie', header: 'Klant', accessorFn: (row) => row.relatie?.bedrijfsnaam || '-' },
  { accessorKey: 'status', header: 'Status', cell: ({ getValue }) => <Badge status={getValue() as string} /> },
  { accessorKey: 'budget', header: 'Budget', cell: ({ getValue }) => getValue() ? formatCurrency(getValue() as number) : '-' },
  { accessorKey: 'uurtarief', header: 'Uurtarief', cell: ({ getValue }) => getValue() ? formatCurrency(getValue() as number) : '-' },
]

export function ProjectList({ projecten }: { projecten: Project[] }) {
  const router = useRouter()

  return (
    <div>
      <PageHeader title="Projecten" description="Beheer uw projecten" actions={<Button onClick={() => router.push('/projecten/nieuw')}><Plus className="h-4 w-4" />Nieuw project</Button>} />
      {projecten.length === 0 ? (
        <EmptyState icon={FolderKanban} title="Geen projecten" description="U heeft nog geen projecten." action={<Button onClick={() => router.push('/projecten/nieuw')}><Plus className="h-4 w-4" />Project aanmaken</Button>} />
      ) : (
        <DataTable columns={columns} data={projecten} searchPlaceholder="Zoek project..." onRowClick={(row) => router.push(`/projecten/${row.id}`)} />
      )}
    </div>
  )
}
