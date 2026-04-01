'use client'

import { useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import Link from 'next/link'
import { type ColumnDef } from '@tanstack/react-table'
import { DataTable } from '@/components/ui/data-table'
import { PageHeader } from '@/components/ui/page-header'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { EmptyState } from '@/components/ui/empty-state'
import { formatDateShort, formatCurrency } from '@/lib/utils'
import { completeTaak } from '@/lib/actions'
import { Plus, CheckSquare, X } from 'lucide-react'

interface Taak {
  id: string
  titel: string
  status: string
  prioriteit: string
  deadline: string | null
  toegewezen_aan: string | null
  project: { naam: string } | null
  toegewezen: { naam: string } | null
  offerte: { totaal: number } | null
}

function categoriseerTaak(titel: string): 'bellen' | 'uitwerken' {
  const t = titel.toLowerCase()
  if (t.includes('bellen') || t.includes('opbellen') || t.includes('nabellen')) return 'bellen'
  return 'uitwerken'
}

function getColumns(isAdmin: boolean, onComplete: (id: string) => void): ColumnDef<Taak, unknown>[] {
  const cols: ColumnDef<Taak, unknown>[] = [
    {
      id: 'afvinken',
      header: '',
      size: 40,
      cell: ({ row }) => (
        <input
          type="checkbox"
          checked={row.original.status === 'afgerond'}
          className="h-4 w-4 rounded border-gray-300 text-[#00a66e] focus:ring-[#00a66e] cursor-pointer"
          onClick={(e) => {
            e.stopPropagation()
            if (row.original.status !== 'afgerond') onComplete(row.original.id)
          }}
          readOnly
        />
      ),
    },
    { accessorKey: 'titel', header: 'Titel' },
    { accessorKey: 'status', header: 'Status', cell: ({ getValue }) => <Badge status={getValue() as string} /> },
    { accessorKey: 'prioriteit', header: 'Prioriteit', cell: ({ getValue }) => <Badge status={getValue() as string} /> },
    { id: 'project', header: 'Project', accessorFn: (row) => row.project?.naam || '-' },
    { id: 'bedrag', header: 'Bedrag', cell: ({ row }) => row.original.offerte?.totaal ? formatCurrency(row.original.offerte.totaal) : '-' },
    { accessorKey: 'deadline', header: 'Deadline', cell: ({ getValue }) => getValue() ? formatDateShort(getValue() as string) : '-' },
  ]
  if (isAdmin) {
    cols.push({ id: 'toegewezen', header: 'Toegewezen aan', accessorFn: (row) => row.toegewezen?.naam || '-' })
  }
  return cols
}

export function TakenView({ taken, isAdmin }: { taken: Taak[]; isAdmin: boolean }) {
  const router = useRouter()
  const searchParams = useSearchParams()
  const filterCollega = searchParams.get('collega')
  const filterCategorie = searchParams.get('categorie') as 'bellen' | 'uitwerken' | null

  // Filter op basis van URL params
  const gefilterd = taken.filter(t => {
    if (filterCollega && t.toegewezen_aan !== filterCollega) return false
    if (filterCategorie && categoriseerTaak(t.titel) !== filterCategorie) return false
    return true
  })

  const [takenLijst, setTakenLijst] = useState(gefilterd)

  // Vind naam van gefilterde collega
  const collegaNaam = filterCollega ? (gefilterd[0]?.toegewezen?.naam || null) : null
  const filterLabel = [
    collegaNaam,
    filterCategorie === 'bellen' ? 'Bellen' : filterCategorie === 'uitwerken' ? 'Uitwerken' : null,
  ].filter(Boolean).join(' — ')

  async function handleComplete(id: string) {
    setTakenLijst(prev => prev.map(t => t.id === id ? { ...t, status: 'afgerond' } : t))
    await completeTaak(id)
  }

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

      {filterLabel && (
        <div className="mb-4 flex items-center gap-2">
          <span className="inline-flex items-center gap-1.5 bg-[#00a66e]/10 text-[#00a66e] text-sm font-medium px-3 py-1.5 rounded-full">
            {filterLabel}
            <Link href="/taken" className="hover:bg-[#00a66e]/20 rounded-full p-0.5 transition-colors">
              <X className="h-3.5 w-3.5" />
            </Link>
          </span>
          <span className="text-sm text-gray-400">{takenLijst.filter(t => t.status !== 'afgerond').length} open</span>
        </div>
      )}

      {takenLijst.length === 0 ? (
        <EmptyState icon={CheckSquare} title="Geen taken" description="U heeft nog geen taken." action={<Button onClick={() => router.push('/taken/nieuw')}><Plus className="h-4 w-4" />Taak aanmaken</Button>} />
      ) : (
        <DataTable columns={getColumns(isAdmin, handleComplete)} data={takenLijst} searchPlaceholder="Zoek taak..." onRowClick={(row) => router.push(`/taken/${row.id}`)} />
      )}
    </div>
  )
}
