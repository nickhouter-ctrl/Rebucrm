'use client'

import { useRouter } from 'next/navigation'
import { type ColumnDef } from '@tanstack/react-table'
import { DataTable } from '@/components/ui/data-table'
import { PageHeader } from '@/components/ui/page-header'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { EmptyState } from '@/components/ui/empty-state'
import { formatDateShort } from '@/lib/utils'
import { Plus, CheckSquare } from 'lucide-react'

interface Taak {
  id: string
  titel: string
  status: string
  prioriteit: string
  deadline: string | null
  project: { naam: string } | null
  toegewezen: { naam: string } | null
}

interface Project {
  id: string
  naam: string
}

const columns: ColumnDef<Taak, unknown>[] = [
  { accessorKey: 'titel', header: 'Titel' },
  { accessorKey: 'status', header: 'Status', cell: ({ getValue }) => <Badge status={getValue() as string} /> },
  { accessorKey: 'prioriteit', header: 'Prioriteit', cell: ({ getValue }) => <Badge status={getValue() as string} /> },
  { id: 'project', header: 'Project', accessorFn: (row) => row.project?.naam || '-' },
  { accessorKey: 'deadline', header: 'Deadline', cell: ({ getValue }) => getValue() ? formatDateShort(getValue() as string) : '-' },
]

export function TakenView({ taken }: { taken: Taak[]; projecten: Project[] }) {
  const router = useRouter()

  return (
    <div>
      <PageHeader
        title="Taken & Agenda"
        description="Beheer uw taken"
        actions={
          <Button onClick={() => router.push('/taken/nieuw')}>
            <Plus className="h-4 w-4" />
            Nieuwe taak
          </Button>
        }
      />

      {taken.length === 0 ? (
        <EmptyState icon={CheckSquare} title="Geen taken" description="U heeft nog geen taken." action={<Button onClick={() => router.push('/taken/nieuw')}><Plus className="h-4 w-4" />Taak aanmaken</Button>} />
      ) : (
        <DataTable columns={columns} data={taken} searchPlaceholder="Zoek taak..." onRowClick={(row) => router.push(`/taken/${row.id}`)} />
      )}
    </div>
  )
}
