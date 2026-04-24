'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { type ColumnDef } from '@tanstack/react-table'
import { DataTable } from '@/components/ui/data-table'
import { PageHeader } from '@/components/ui/page-header'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { formatCurrency, formatDate } from '@/lib/utils'
import { Archive, FileText, Receipt, FolderKanban } from 'lucide-react'
import { archiveerOfferte, setProjectStatus } from '@/lib/actions'

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

type Verkoopkans = {
  id: string
  naam: string
  updated_at: string
  relatie: { id: string; bedrijfsnaam: string } | null
  totaalGefactureerd: number
  totaalBetaald: number
}

export function ArchiefView({ offertes, facturen, verkoopkansen = [] }: { offertes: Offerte[]; facturen: Factuur[]; verkoopkansen?: Verkoopkans[] }) {
  const router = useRouter()
  const [tab, setTab] = useState<'verkoopkansen' | 'offertes' | 'facturen'>('verkoopkansen')
  const [loading, setLoading] = useState('')

  async function heropenVerkoopkans(id: string) {
    if (!confirm('Verkoopkans weer actief maken?')) return
    setLoading(id)
    await setProjectStatus(id, 'actief')
    router.refresh()
    setLoading('')
  }

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

  const verkoopkansCols: ColumnDef<Verkoopkans, unknown>[] = [
    { accessorKey: 'naam', header: 'Verkoopkans' },
    { id: 'relatie', header: 'Klant', accessorFn: (r) => r.relatie?.bedrijfsnaam || '-' },
    { id: 'afgerond_op', header: 'Afgerond op', accessorFn: (r) => r.updated_at, cell: ({ getValue }) => formatDate(getValue() as string) },
    { id: 'gefactureerd', header: 'Totaal gefactureerd', accessorFn: (r) => r.totaalGefactureerd, cell: ({ getValue }) => formatCurrency(getValue() as number) },
    { id: 'betaald', header: 'Totaal betaald', accessorFn: (r) => r.totaalBetaald, cell: ({ getValue }) => formatCurrency(getValue() as number) },
    {
      id: 'acties', header: '',
      cell: ({ row }) => (
        <Button variant="ghost" size="sm" disabled={loading === row.original.id}
          onClick={(e) => { e.stopPropagation(); heropenVerkoopkans(row.original.id) }}>
          Heropenen
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
          onClick={() => setTab('verkoopkansen')}
          className={`flex items-center gap-2 px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
            tab === 'verkoopkansen' ? 'border-primary text-primary' : 'border-transparent text-gray-500 hover:text-gray-700'
          }`}
        >
          <FolderKanban className="h-4 w-4" />
          Afgeronde verkoopkansen ({verkoopkansen.length})
        </button>
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

      {tab === 'verkoopkansen' && (
        verkoopkansen.length === 0 ? (
          <div className="text-center py-12 text-gray-400">
            <Archive className="h-10 w-10 mx-auto mb-2" />
            <p>Geen afgeronde verkoopkansen</p>
          </div>
        ) : (
          <DataTable columns={verkoopkansCols} data={verkoopkansen} searchPlaceholder="Zoek in afgeronde verkoopkansen..."
            onRowClick={(r) => router.push(`/projecten/${r.id}`)} />
        )
      )}

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
