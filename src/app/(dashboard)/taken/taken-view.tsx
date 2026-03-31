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

function getColumns(isAdmin: boolean): ColumnDef<Taak, unknown>[] {
  const cols: ColumnDef<Taak, unknown>[] = [
    { accessorKey: 'titel', header: 'Titel' },
    { accessorKey: 'status', header: 'Status', cell: ({ getValue }) => <Badge status={getValue() as string} /> },
    { accessorKey: 'prioriteit', header: 'Prioriteit', cell: ({ getValue }) => <Badge status={getValue() as string} /> },
    { id: 'project', header: 'Project', accessorFn: (row) => row.project?.naam || '-' },
    { accessorKey: 'deadline', header: 'Deadline', cell: ({ getValue }) => getValue() ? formatDateShort(getValue() as string) : '-' },
  ]
  if (isAdmin) {
    cols.push({ id: 'toegewezen', header: 'Toegewezen aan', accessorFn: (row) => row.toegewezen?.naam || '-' })
  }
  return cols
}

export function TakenView({ taken, isAdmin }: { taken: Taak[]; isAdmin: boolean }) {
  const router = useRouter()

  return (
    <div>
      <PageHeader
        title="Taken"
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
        <DataTable columns={getColumns(isAdmin)} data={taken} searchPlaceholder="Zoek taak..." onRowClick={(row) => router.push(`/taken/${row.id}`)} />
      )}
    </div>
  )
}
