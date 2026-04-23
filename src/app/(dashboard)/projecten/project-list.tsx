'use client'

import { useState } from 'react'
import { useSearchParams } from 'next/navigation'
import { useRouter } from 'next/navigation'
import { type ColumnDef } from '@tanstack/react-table'
import { DataTable } from '@/components/ui/data-table'
import { PageHeader } from '@/components/ui/page-header'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { EmptyState } from '@/components/ui/empty-state'
import { formatCurrency, formatDate } from '@/lib/utils'
import { deleteProject } from '@/lib/actions'
import { Plus, FolderKanban, Trash2, FileText } from 'lucide-react'

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

const statusFilters = [
  { value: 'alle', label: 'Alle' },
  { value: 'actief', label: 'Actief' },
  { value: 'on_hold', label: 'On hold' },
  { value: 'afgerond', label: 'Afgerond' },
  { value: 'geannuleerd', label: 'Geannuleerd' },
]

export function ProjectList({ projecten }: { projecten: Project[] }) {
  const router = useRouter()
  const searchParams = useSearchParams()
  const filter = searchParams.get('filter')
  const zonderOfferte = filter === 'zonder_offerte'
  const [statusFilter, setStatusFilter] = useState('actief')

  const gefilterd = zonderOfferte
    ? projecten.filter(p => p.status === 'actief' && p.aantal_offertes === 0)
    : statusFilter === 'alle'
      ? projecten
      : projecten.filter(p => p.status === statusFilter)

  async function handleDelete(e: React.MouseEvent, project: Project) {
    e.stopPropagation()
    if (!confirm(`Weet u zeker dat u "${project.naam}" wilt verwijderen?`)) return
    const result = await deleteProject(project.id)
    if (result.error) alert(result.error)
    else router.refresh()
  }

  function handleNewOfferte(e: React.MouseEvent, project: Project) {
    e.stopPropagation()
    router.push(`/offertes/nieuw?project_id=${project.id}&relatie_id=${project.relatie ? '' : ''}`)
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
        <div className="flex items-center gap-1">
          {!row.original.laatste_offerte_nummer && (
            <button
              onClick={(e) => handleNewOfferte(e, row.original)}
              className="opacity-0 group-hover/row:opacity-100 text-gray-400 hover:text-primary transition-all p-1 rounded"
              title="Offerte aanmaken"
            >
              <FileText className="h-4 w-4" />
            </button>
          )}
          <button
            onClick={(e) => handleDelete(e, row.original)}
            className="opacity-0 group-hover/row:opacity-100 text-gray-400 hover:text-red-500 transition-all p-1 rounded"
            title="Verwijderen"
          >
            <Trash2 className="h-4 w-4" />
          </button>
        </div>
      ),
      size: 80,
    },
  ]

  // Tellingen per status
  const counts = statusFilters.map(f => ({
    ...f,
    count: f.value === 'alle' ? projecten.length : projecten.filter(p => p.status === f.value).length,
  }))

  return (
    <div>
      <PageHeader
        title={zonderOfferte ? 'Verkoopkansen zonder offerte' : 'Verkoopkansen'}
        description={zonderOfferte ? `${gefilterd.length} actieve verkoopkansen zonder offerte` : 'Overzicht van alle verkoopkansen'}
        actions={
          zonderOfferte ? (
            <Button variant="ghost" onClick={() => router.push('/projecten')}>Alle verkoopkansen</Button>
          ) : (
            <Button onClick={() => router.push('/projecten/nieuw')}><Plus className="h-4 w-4" />Nieuwe verkoopkans</Button>
          )
        }
      />

      {!zonderOfferte && (
        <div className="flex flex-wrap gap-1.5 mb-4">
          {counts.map(f => (
            <button
              key={f.value}
              onClick={() => setStatusFilter(f.value)}
              className={`px-3 py-1.5 text-xs font-medium rounded-full transition-colors ${
                statusFilter === f.value
                  ? 'bg-primary text-white shadow-sm'
                  : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
              }`}
            >
              {f.label} ({f.count})
            </button>
          ))}
        </div>
      )}

      {gefilterd.length === 0 && projecten.length > 0 ? (
        <EmptyState icon={FolderKanban} title="Geen verkoopkansen" description={`Geen verkoopkansen met status "${statusFilters.find(f => f.value === statusFilter)?.label}".`} />
      ) : projecten.length === 0 ? (
        <EmptyState icon={FolderKanban} title="Geen verkoopkansen" description="U heeft nog geen verkoopkansen." action={<Button onClick={() => router.push('/projecten/nieuw')}><Plus className="h-4 w-4" />Verkoopkans aanmaken</Button>} />
      ) : (
        <DataTable columns={columns} data={gefilterd} searchPlaceholder="Zoek op naam of klant..." onRowClick={(row) => router.push(`/projecten/${row.id}`)} />
      )}
    </div>
  )
}
