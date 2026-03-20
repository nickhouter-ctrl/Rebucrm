'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { type ColumnDef } from '@tanstack/react-table'
import { DataTable } from '@/components/ui/data-table'
import { PageHeader } from '@/components/ui/page-header'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { EmptyState } from '@/components/ui/empty-state'
import { Plus, HardHat, Calendar } from 'lucide-react'
import { formatCurrency } from '@/lib/utils'
import Link from 'next/link'

interface Medewerker {
  id: string
  naam: string
  type: string
  functie: string | null
  email: string | null
  telefoon: string | null
  uurtarief: number | null
  actief: boolean
  kleur: string | null
  specialisaties: string[] | null
}

const filterTabs = [
  { label: 'Alle', value: 'alle' },
  { label: 'Werknemers', value: 'werknemer' },
  { label: "ZZP'ers", value: 'zzp' },
  { label: 'Actief', value: 'actief' },
  { label: 'Inactief', value: 'inactief' },
]

const columns: ColumnDef<Medewerker, unknown>[] = [
  {
    accessorKey: 'naam',
    header: 'Naam',
    cell: ({ row }) => (
      <div className="flex items-center gap-2">
        <div className="w-3 h-3 rounded-full flex-shrink-0" style={{ backgroundColor: row.original.kleur || '#3b82f6' }} />
        <span className="font-medium">{row.original.naam}</span>
      </div>
    ),
  },
  {
    accessorKey: 'type',
    header: 'Type',
    cell: ({ getValue }) => <Badge status={getValue() as string} />,
  },
  { accessorKey: 'functie', header: 'Functie' },
  { accessorKey: 'telefoon', header: 'Telefoon' },
  {
    accessorKey: 'uurtarief',
    header: 'Uurtarief',
    cell: ({ getValue }) => {
      const val = getValue() as number | null
      return val ? formatCurrency(val) + '/u' : <span className="text-gray-400">-</span>
    },
  },
  {
    accessorKey: 'actief',
    header: 'Status',
    cell: ({ getValue }) => (
      <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${getValue() ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'}`}>
        {getValue() ? 'Actief' : 'Inactief'}
      </span>
    ),
  },
]

export function MedewerkerList({ medewerkers }: { medewerkers: Medewerker[] }) {
  const router = useRouter()
  const [activeTab, setActiveTab] = useState('alle')

  const filtered = (() => {
    switch (activeTab) {
      case 'werknemer': return medewerkers.filter(m => m.type === 'werknemer')
      case 'zzp': return medewerkers.filter(m => m.type === 'zzp')
      case 'actief': return medewerkers.filter(m => m.actief)
      case 'inactief': return medewerkers.filter(m => !m.actief)
      default: return medewerkers
    }
  })()

  return (
    <div>
      <PageHeader
        title="Medewerkers"
        description="Beheer werknemers en ZZP'ers"
        actions={
          <div className="flex items-center gap-2">
            <Link href="/medewerkers/planning">
              <Button variant="secondary" size="sm">
                <Calendar className="h-4 w-4 mr-1" />
                Planning
              </Button>
            </Link>
            <Link href="/medewerkers/nieuw">
              <Button size="sm">
                <Plus className="h-4 w-4 mr-1" />
                Nieuwe medewerker
              </Button>
            </Link>
          </div>
        }
      />

      <div className="flex gap-1 mb-4">
        {filterTabs.map(tab => (
          <button
            key={tab.value}
            onClick={() => setActiveTab(tab.value)}
            className={`px-3 py-1.5 rounded-full text-sm font-medium transition-colors ${
              activeTab === tab.value
                ? 'bg-primary text-white'
                : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {medewerkers.length === 0 ? (
        <EmptyState
          icon={HardHat}
          title="Geen medewerkers"
          description="Voeg uw eerste medewerker of ZZP'er toe"
          action={
            <Link href="/medewerkers/nieuw">
              <Button size="sm">
                <Plus className="h-4 w-4 mr-1" />
                Nieuwe medewerker
              </Button>
            </Link>
          }
        />
      ) : (
        <DataTable
          columns={columns}
          data={filtered}
          searchPlaceholder="Zoek medewerker..."
          onRowClick={(row) => router.push(`/medewerkers/${row.id}`)}
        />
      )}
    </div>
  )
}
