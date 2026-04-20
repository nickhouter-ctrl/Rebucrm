'use client'

import { useRouter } from 'next/navigation'
import { type ColumnDef } from '@tanstack/react-table'
import { DataTable } from '@/components/ui/data-table'
import { PageHeader } from '@/components/ui/page-header'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { EmptyState } from '@/components/ui/empty-state'
import { formatCurrency, formatDate } from '@/lib/utils'
import { deleteProject } from '@/lib/actions'
import { Plus, FolderKanban, Trash2 } from 'lucide-react'

interface Project {
  id: string
  naam: string
  status: string
  created_at: string
  budget: number | null
  uurtarief: number | null
  relatie: { bedrijfsnaam: string } | null
  aantal_offertes: number
  laatste_offerte_id: string | null
  laatste_offerte_nummer: string | null
  laatste_offerte_status: string | null
  laatste_offerte_bedrag: number | null
}

export function ProjectList({ projecten }: { projecten: Project[] }) {
  const router = useRouter()

  async function handleDelete(e: React.MouseEvent, project: Project) {
    e.stopPropagation()
    if (!confirm(`Weet u zeker dat u "${project.naam}" wilt verwijderen?`)) return
    const result = await deleteProject(project.id)
    if (result.error) alert(result.error)
    else router.refresh()
  }

  const columns: ColumnDef<Project, unknown>[] = [
    { accessorKey: 'naam', header: 'Verkoopkans' },
    { id: 'relatie', header: 'Klant', accessorFn: (row) => row.relatie?.bedrijfsnaam || '-' },
    { id: 'datum', header: 'Datum', accessorFn: (row) => row.created_at, cell: ({ row }) => <span className="text-gray-500">{formatDate(row.original.created_at)}</span> },
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
    {
      id: 'acties',
      header: '',
      cell: ({ row }) => (
        <button
          onClick={(e) => handleDelete(e, row.original)}
          className="opacity-0 group-hover/row:opacity-100 text-gray-400 hover:text-red-500 transition-all p-1 rounded"
          title="Verwijderen"
        >
          <Trash2 className="h-4 w-4" />
        </button>
      ),
      size: 40,
    },
  ]

  return (
    <div>
      <PageHeader title="Verkoopkansen" description="Overzicht van alle verkoopkansen" actions={<Button onClick={() => router.push('/projecten/nieuw')}><Plus className="h-4 w-4" />Nieuwe verkoopkans</Button>} />
      {projecten.length === 0 ? (
        <EmptyState icon={FolderKanban} title="Geen verkoopkansen" description="U heeft nog geen verkoopkansen." action={<Button onClick={() => router.push('/projecten/nieuw')}><Plus className="h-4 w-4" />Verkoopkans aanmaken</Button>} />
      ) : (
        <DataTable columns={columns} data={projecten} searchPlaceholder="Zoek verkoopkans..." onRowClick={(row) => router.push(`/projecten/${row.id}`)} />
      )}
    </div>
  )
}
