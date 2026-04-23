'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { type ColumnDef } from '@tanstack/react-table'
import { DataTable } from '@/components/ui/data-table'
import { PageHeader } from '@/components/ui/page-header'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { formatCurrency, formatDate } from '@/lib/utils'
import { Archive, FileText, Receipt } from 'lucide-react'
import { archiveerOfferte } from '@/lib/actions'

type Offerte = {
  id: string
  offertenummer: string
  datum: string
  status: string
  totaal: number
  onderwerp: string | null
  gearchiveerd_op: string | null
  relatie: { bedrijfsnaam: string } | null
}

type Factuur = {
  id: string
  factuurnummer: string
  datum: string
  status: string
  totaal: number
  factuur_type: string
  relatie: { bedrijfsnaam: string } | null
}

export function ArchiefView({ offertes, facturen }: { offertes: Offerte[]; facturen: Factuur[] }) {
  const router = useRouter()
  const [tab, setTab] = useState<'offertes' | 'facturen'>('offertes')
  const [loading, setLoading] = useState('')

  async function terugnaarActief(id: string) {
    if (!confirm('Offerte terugzetten naar actieve lijst?')) return
    setLoading(id)
    await archiveerOfferte(id, false)
    router.refresh()
    setLoading('')
  }

  const offerteCols: ColumnDef<Offerte, unknown>[] = [
    { accessorKey: 'offertenummer', header: 'Nummer' },
    { id: 'relatie', header: 'Relatie', accessorFn: (r) => r.relatie?.bedrijfsnaam || '-' },
    { accessorKey: 'onderwerp', header: 'Onderwerp' },
    { accessorKey: 'datum', header: 'Datum', cell: ({ getValue }) => getValue() ? formatDate(getValue() as string) : '-' },
    { id: 'bedrag_excl', header: 'Bedrag excl. BTW', accessorFn: (r: { totaal: number; subtotaal?: number | null; btw_totaal?: number | null }) => r.subtotaal ?? ((r.totaal || 0) - (r.btw_totaal || 0)), cell: ({ getValue }: { getValue: () => unknown }) => formatCurrency(getValue() as number) },
    { accessorKey: 'status', header: 'Status', cell: ({ getValue }) => <Badge status={getValue() as string} /> },
    {
      id: 'gearch', header: 'Gearchiveerd',
      accessorFn: (r) => r.gearchiveerd_op,
      cell: ({ getValue }) => getValue() ? formatDate(getValue() as string) : '-',
    },
    {
      id: 'acties', header: '',
      cell: ({ row }) => (
        <Button variant="ghost" size="sm" disabled={loading === row.original.id}
          onClick={(e) => { e.stopPropagation(); terugnaarActief(row.original.id) }}>
          Terug naar actief
        </Button>
      ),
    },
  ]

  const factuurCols: ColumnDef<Factuur, unknown>[] = [
    { accessorKey: 'factuurnummer', header: 'Nummer' },
    { id: 'relatie', header: 'Relatie', accessorFn: (r) => r.relatie?.bedrijfsnaam || '-' },
    { accessorKey: 'datum', header: 'Datum', cell: ({ getValue }) => getValue() ? formatDate(getValue() as string) : '-' },
    { accessorKey: 'factuur_type', header: 'Type' },
    { id: 'bedrag_excl', header: 'Bedrag excl. BTW', accessorFn: (r: { totaal: number; subtotaal?: number | null; btw_totaal?: number | null }) => r.subtotaal ?? ((r.totaal || 0) - (r.btw_totaal || 0)), cell: ({ getValue }: { getValue: () => unknown }) => formatCurrency(getValue() as number) },
    { accessorKey: 'status', header: 'Status', cell: ({ getValue }) => <Badge status={getValue() as string} /> },
  ]

  return (
    <div>
      <PageHeader
        title="Archief"
        description="Alle afgehandelde of gecrediteerde items"
      />

      <div className="mb-4 flex gap-2 border-b border-gray-200">
        <button
          onClick={() => setTab('offertes')}
          className={`flex items-center gap-2 px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
            tab === 'offertes' ? 'border-primary text-primary' : 'border-transparent text-gray-500 hover:text-gray-700'
          }`}
        >
          <FileText className="h-4 w-4" />
          Offertes ({offertes.length})
        </button>
        <button
          onClick={() => setTab('facturen')}
          className={`flex items-center gap-2 px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
            tab === 'facturen' ? 'border-primary text-primary' : 'border-transparent text-gray-500 hover:text-gray-700'
          }`}
        >
          <Receipt className="h-4 w-4" />
          Gecrediteerde facturen ({facturen.length})
        </button>
      </div>

      {tab === 'offertes' && (
        offertes.length === 0 ? (
          <div className="text-center py-12 text-gray-400">
            <Archive className="h-10 w-10 mx-auto mb-2" />
            <p>Geen gearchiveerde offertes</p>
          </div>
        ) : (
          <DataTable columns={offerteCols} data={offertes} searchPlaceholder="Zoek in offerte-archief..."
            onRowClick={(r) => router.push(`/offertes/${r.id}`)} />
        )
      )}

      {tab === 'facturen' && (
        facturen.length === 0 ? (
          <div className="text-center py-12 text-gray-400">
            <Archive className="h-10 w-10 mx-auto mb-2" />
            <p>Geen gecrediteerde facturen</p>
          </div>
        ) : (
          <DataTable columns={factuurCols} data={facturen} searchPlaceholder="Zoek in factuur-archief..."
            onRowClick={(r) => router.push(`/facturatie/${r.id}`)} />
        )
      )}
    </div>
  )
}
