'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { type ColumnDef } from '@tanstack/react-table'
import { DataTable } from '@/components/ui/data-table'
import { PageHeader } from '@/components/ui/page-header'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { EmptyState } from '@/components/ui/empty-state'
import { formatCurrency, formatDateShort } from '@/lib/utils'
import { Plus, BookOpen } from 'lucide-react'

interface Boeking {
  id: string
  boekingsnummer: string
  datum: string
  omschrijving: string
  regels: { debet: number; credit: number; rekening: { nummer: string; naam: string } | null }[]
}

interface Rekening {
  id: string
  nummer: string
  naam: string
  type: string
}

const boekingColumns: ColumnDef<Boeking, unknown>[] = [
  { accessorKey: 'boekingsnummer', header: 'Nummer' },
  { accessorKey: 'datum', header: 'Datum', cell: ({ getValue }) => formatDateShort(getValue() as string) },
  { accessorKey: 'omschrijving', header: 'Omschrijving' },
  {
    id: 'debet',
    header: 'Debet',
    accessorFn: (row) => row.regels?.reduce((s, r) => s + (r.debet || 0), 0) || 0,
    cell: ({ getValue }) => formatCurrency(getValue() as number),
  },
  {
    id: 'credit',
    header: 'Credit',
    accessorFn: (row) => row.regels?.reduce((s, r) => s + (r.credit || 0), 0) || 0,
    cell: ({ getValue }) => formatCurrency(getValue() as number),
  },
]

const rekeningColumns: ColumnDef<Rekening, unknown>[] = [
  { accessorKey: 'nummer', header: 'Nummer' },
  { accessorKey: 'naam', header: 'Naam' },
  { accessorKey: 'type', header: 'Type' },
]

export function BoekhoudingView({ boekingen, rekeningen }: { boekingen: Boeking[]; rekeningen: Rekening[] }) {
  const router = useRouter()
  const [tab, setTab] = useState<'boekingen' | 'rekeningen' | 'btw'>('boekingen')

  return (
    <div>
      <PageHeader
        title="Boekhouding"
        description="Journaalposten en grootboekrekeningen"
        actions={
          <Button onClick={() => router.push('/boekhouding/nieuw')}>
            <Plus className="h-4 w-4" />
            Nieuwe boeking
          </Button>
        }
      />

      <div className="flex gap-2 mb-4">
        {(['boekingen', 'rekeningen', 'btw'] as const).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`px-4 py-2 text-sm rounded-md transition-colors ${tab === t ? 'bg-primary text-white' : 'bg-white text-gray-700 border border-gray-300 hover:bg-gray-50'}`}
          >
            {t === 'boekingen' ? 'Journaalposten' : t === 'rekeningen' ? 'Grootboekrekeningen' : 'BTW-overzicht'}
          </button>
        ))}
      </div>

      {tab === 'boekingen' && (
        boekingen.length === 0 ? (
          <EmptyState icon={BookOpen} title="Geen boekingen" description="Er zijn nog geen journaalposten." />
        ) : (
          <DataTable columns={boekingColumns} data={boekingen} searchPlaceholder="Zoek boeking..." onRowClick={(row) => router.push(`/boekhouding/${row.id}`)} />
        )
      )}

      {tab === 'rekeningen' && (
        <DataTable columns={rekeningColumns} data={rekeningen} searchPlaceholder="Zoek rekening..." />
      )}

      {tab === 'btw' && (
        <Card>
          <CardContent className="py-8 text-center text-gray-500">
            <p>BTW-overzicht wordt berekend op basis van uw facturen en inkoopfacturen.</p>
            <p className="text-sm mt-2">Maak facturen en inkoopfacturen aan om het BTW-overzicht te bekijken.</p>
          </CardContent>
        </Card>
      )}
    </div>
  )
}
