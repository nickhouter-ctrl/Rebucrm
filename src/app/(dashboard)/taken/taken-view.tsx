'use client'

import { useState, useMemo } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import Link from 'next/link'
import { type ColumnDef } from '@tanstack/react-table'
import { DataTable } from '@/components/ui/data-table'
import { PageHeader } from '@/components/ui/page-header'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { EmptyState } from '@/components/ui/empty-state'
import { formatDateShort, formatCurrency } from '@/lib/utils'
import { completeTaak, uncompleteTaak } from '@/lib/actions'
import { Plus, CheckSquare, X } from 'lucide-react'

interface Taak {
  id: string
  titel: string
  status: string
  prioriteit: string
  deadline: string | null
  toegewezen_aan: string | null
  medewerker_id: string | null
  project: { naam: string } | null
  toegewezen: { naam: string } | null
  medewerker: { naam: string } | null
  offerte: { totaal: number } | null
  relatie: { bedrijfsnaam: string } | null
}

function categoriseerTaak(titel: string): 'bellen' | 'uitwerken' {
  const t = titel.toLowerCase()
  if (t.includes('bellen') || t.includes('opbellen') || t.includes('nabellen')) return 'bellen'
  return 'uitwerken'
}

function getColumns(isAdmin: boolean, onToggle: (id: string, currentStatus: string) => void): ColumnDef<Taak, unknown>[] {
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
            onToggle(row.original.id, row.original.status)
          }}
          readOnly
        />
      ),
    },
    { accessorKey: 'titel', header: 'Titel' },
    { id: 'relatie', header: 'Relatie', accessorFn: (row) => row.relatie?.bedrijfsnaam || '-' },
    { accessorKey: 'status', header: 'Status', cell: ({ getValue }) => <Badge status={getValue() as string} /> },
    { accessorKey: 'prioriteit', header: 'Prioriteit', cell: ({ getValue }) => <Badge status={getValue() as string} /> },
    { id: 'project', header: 'Verkoopkans', accessorFn: (row) => row.project?.naam || '-' },
    { id: 'bedrag', header: 'Bedrag', cell: ({ row }) => row.original.offerte?.totaal ? formatCurrency(row.original.offerte.totaal) : '-' },
    { accessorKey: 'deadline', header: 'Deadline', cell: ({ getValue }) => getValue() ? formatDateShort(getValue() as string) : '-' },
  ]
  if (isAdmin) {
    cols.push({ id: 'toegewezen', header: 'Toegewezen aan', accessorFn: (row) => row.medewerker?.naam || row.toegewezen?.naam || '-' })
  }
  return cols
}

export function TakenView({ taken, isAdmin }: { taken: Taak[]; isAdmin: boolean }) {
  const router = useRouter()
  const searchParams = useSearchParams()
  const filterCollega = searchParams.get('collega')
  const filterCategorie = searchParams.get('categorie') as 'bellen' | 'uitwerken' | null
  const [filterMedewerker, setFilterMedewerker] = useState('')

  // Unieke medewerkers voor dropdown
  const medewerkers = useMemo(() => {
    const map = new Map<string, string>()
    taken.forEach(t => {
      const id = t.medewerker_id || t.toegewezen_aan
      const naam = t.medewerker?.naam || t.toegewezen?.naam
      if (id && naam) map.set(id, naam)
    })
    return Array.from(map.entries()).sort((a, b) => a[1].localeCompare(b[1]))
  }, [taken])

  // Filter op basis van URL params + medewerker dropdown
  const gefilterd = taken.filter(t => {
    if (filterCollega && t.toegewezen_aan !== filterCollega) return false
    if (filterCategorie && categoriseerTaak(t.titel) !== filterCategorie) return false
    if (filterMedewerker && (t.medewerker_id || t.toegewezen_aan) !== filterMedewerker) return false
    return true
  })

  const [takenLijst, setTakenLijst] = useState(gefilterd)

  // Sync bij filter-wijziging
  const filteredKey = `${filterCollega}-${filterCategorie}-${filterMedewerker}`
  const [prevKey, setPrevKey] = useState(filteredKey)
  if (filteredKey !== prevKey) {
    setPrevKey(filteredKey)
    setTakenLijst(gefilterd)
  }

  // Vind naam van gefilterde collega
  const collegaNaam = filterCollega ? (taken.find(t => t.toegewezen_aan === filterCollega)?.toegewezen?.naam || null) : null
  const filterLabel = [
    collegaNaam,
    filterCategorie === 'bellen' ? 'Bellen' : filterCategorie === 'uitwerken' ? 'Uitwerken' : null,
  ].filter(Boolean).join(' — ')

  async function handleToggle(id: string, currentStatus: string) {
    if (currentStatus === 'afgerond') {
      setTakenLijst(prev => prev.map(t => t.id === id ? { ...t, status: 'open' } : t))
      await uncompleteTaak(id)
    } else {
      setTakenLijst(prev => prev.map(t => t.id === id ? { ...t, status: 'afgerond' } : t))
      await completeTaak(id)
    }
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

      {/* Filters */}
      <div className="mb-4 flex items-center gap-3 flex-wrap">
        {isAdmin && medewerkers.length > 1 && (
          <select
            value={filterMedewerker}
            onChange={(e) => setFilterMedewerker(e.target.value)}
            className="px-3 py-1.5 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-[#00a66e] focus:border-transparent"
          >
            <option value="">Alle medewerkers</option>
            {medewerkers.map(([id, naam]) => (
              <option key={id} value={id}>{naam}</option>
            ))}
          </select>
        )}

        {filterLabel && (
          <span className="inline-flex items-center gap-1.5 bg-[#00a66e]/10 text-[#00a66e] text-sm font-medium px-3 py-1.5 rounded-full">
            {filterLabel}
            <Link href="/taken" className="hover:bg-[#00a66e]/20 rounded-full p-0.5 transition-colors">
              <X className="h-3.5 w-3.5" />
            </Link>
          </span>
        )}

        <span className="text-sm text-gray-400">{takenLijst.filter(t => t.status !== 'afgerond').length} open</span>
      </div>

      {takenLijst.length === 0 ? (
        <EmptyState icon={CheckSquare} title="Geen taken" description="U heeft nog geen taken." action={<Button onClick={() => router.push('/taken/nieuw')}><Plus className="h-4 w-4" />Taak aanmaken</Button>} />
      ) : (
        <DataTable columns={getColumns(isAdmin, handleToggle)} data={takenLijst} searchPlaceholder="Zoek taak..." onRowClick={(row) => router.push(`/taken/${row.id}`)} />
      )}
    </div>
  )
}
