'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { type ColumnDef } from '@tanstack/react-table'
import { DataTable } from '@/components/ui/data-table'
import { PageHeader } from '@/components/ui/page-header'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { EmptyState } from '@/components/ui/empty-state'
import { formatCurrency, formatDateShort } from '@/lib/utils'
import { offerteStatussen, statusKleuren } from '@/lib/constants'
import { Plus, FileText, Download, Trash2 } from 'lucide-react'
import { schoneLeiConceptOffertes } from '@/lib/actions'

const statusLabels: Record<string, string> = {
  concept: 'Concept', verzonden: 'Verzonden', geaccepteerd: 'Geaccepteerd',
  afgewezen: 'Afgewezen', verlopen: 'Verlopen',
}

interface Offerte {
  id: string
  offertenummer: string
  datum: string
  status: string
  totaal: number
  subtotaal: number | null
  btw_totaal: number | null
  versie_nummer: number | null
  relatie: { bedrijfsnaam: string } | null
  project: { naam: string } | null
  onderwerp: string | null
}

const columns: ColumnDef<Offerte, unknown>[] = [
  { accessorKey: 'offertenummer', header: 'Nummer' },
  {
    id: 'versie',
    header: 'Versie',
    accessorFn: (row) => row.versie_nummer || 1,
    cell: ({ getValue }) => (
      <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-gray-100 text-gray-700">
        v{getValue() as number}
      </span>
    ),
  },
  {
    accessorKey: 'datum',
    header: 'Datum',
    cell: ({ getValue }) => formatDateShort(getValue() as string),
  },
  {
    id: 'relatie',
    header: 'Relatie',
    accessorFn: (row) => row.relatie?.bedrijfsnaam || '-',
  },
  {
    id: 'project',
    header: 'Project',
    accessorFn: (row) => row.project?.naam || '-',
  },
  { accessorKey: 'onderwerp', header: 'Onderwerp' },
  {
    accessorKey: 'status',
    header: 'Status',
    cell: ({ getValue }) => <Badge status={getValue() as string} />,
  },
  {
    id: 'bedrag_excl',
    header: 'Bedrag excl. BTW',
    accessorFn: (row) => row.subtotaal ?? ((row.totaal || 0) - (row.btw_totaal || 0)),
    cell: ({ getValue }) => formatCurrency(getValue() as number),
  },
]

export function OfferteList({ offertes }: { offertes: Offerte[] }) {
  const router = useRouter()
  const [statusFilter, setStatusFilter] = useState<string | null>(null)
  const [schoneLeiBezig, setSchoneLeiBezig] = useState(false)

  async function handleSchoneLei() {
    if (!confirm('Alle lege concept-offertes (zonder regels of bedrag) verwijderen?\n\nHandmatige concepten met inhoud blijven bestaan.')) return
    setSchoneLeiBezig(true)
    const res = await schoneLeiConceptOffertes()
    setSchoneLeiBezig(false)
    if ('error' in res && res.error) { alert(res.error); return }
    alert(res.message)
    router.refresh()
  }

  const filteredOffertes = statusFilter
    ? offertes.filter(o => o.status === statusFilter)
    : offertes

  async function exportXlsx() {
    if (filteredOffertes.length === 0) return
    const rows = filteredOffertes.map(o => ({
      Offertenummer: o.offertenummer,
      Versie: o.versie_nummer || 1,
      Datum: o.datum,
      Status: o.status,
      Klant: o.relatie?.bedrijfsnaam || '',
      Verkoopkans: o.project?.naam || '',
      Onderwerp: o.onderwerp || '',
      Subtotaal: o.subtotaal ?? 0,
      BTW: o.btw_totaal ?? 0,
      Totaal: o.totaal,
    }))
    const XLSX = await import('xlsx')
    const ws = XLSX.utils.json_to_sheet(rows)
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, 'Offertes')
    XLSX.writeFile(wb, `offertes-export-${new Date().toISOString().slice(0, 10)}.xlsx`)
  }

  return (
    <div>
      <PageHeader
        title="Offertes & Orders"
        description="Beheer uw offertes en orders"
        actions={
          <div className="flex gap-2 flex-wrap">
            <Button variant="ghost" size="sm" onClick={exportXlsx} disabled={filteredOffertes.length === 0}>
              <Download className="h-3.5 w-3.5" />
              Excel
            </Button>
            <Button variant="ghost" size="sm" onClick={handleSchoneLei} disabled={schoneLeiBezig} title="Verwijdert lege concept-offertes (zonder regels of bedrag) — handmatige concepten met inhoud blijven staan">
              <Trash2 className="h-3.5 w-3.5" />
              {schoneLeiBezig ? 'Bezig...' : 'Schone lei'}
            </Button>
            <Link href="/offertes/archief">
              <Button variant="ghost">Archief</Button>
            </Link>
            <Link href="/offertes/orders">
              <Button variant="secondary">Orders bekijken</Button>
            </Link>
            <Button onClick={() => router.push('/offertes/nieuw')}>
              <Plus className="h-4 w-4" />
              Nieuwe offerte
            </Button>
          </div>
        }
      />

      {offertes.length === 0 ? (
        <EmptyState
          icon={FileText}
          title="Geen offertes"
          description="U heeft nog geen offertes aangemaakt."
          action={
            <Button onClick={() => router.push('/offertes/nieuw')}>
              <Plus className="h-4 w-4" />
              Offerte aanmaken
            </Button>
          }
        />
      ) : (
        <>
          <div className="mb-4 flex flex-wrap gap-2">
            <button
              onClick={() => setStatusFilter(null)}
              className={`px-3 py-1.5 rounded-full text-xs font-medium transition-colors ${
                statusFilter === null
                  ? 'bg-primary text-white'
                  : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
              }`}
            >
              Alle ({offertes.length})
            </button>
            {offerteStatussen.map(status => {
              const count = offertes.filter(o => o.status === status).length
              if (count === 0) return null
              return (
                <button
                  key={status}
                  onClick={() => setStatusFilter(status === statusFilter ? null : status)}
                  className={`px-3 py-1.5 rounded-full text-xs font-medium transition-all ${
                    statusFilter === status
                      ? statusKleuren[status] + ' ring-2 ring-offset-1 ring-primary/40'
                      : statusKleuren[status] + ' hover:opacity-80'
                  }`}
                >
                  {statusLabels[status] || status} ({count})
                </button>
              )
            })}
          </div>
          <DataTable
            columns={columns}
            data={filteredOffertes}
            searchPlaceholder="Zoek offerte..."
            onRowClick={(row) => router.push(`/offertes/${row.id}`)}
            mobileCard={(o) => ({
              title: <>
                {o.offertenummer}{o.versie_nummer && o.versie_nummer > 1 ? <span className="text-gray-400 ml-1">v{o.versie_nummer}</span> : null}
                {o.onderwerp ? <span className="text-gray-500 font-normal ml-1.5">— {o.onderwerp}</span> : null}
              </>,
              subtitle: <>
                {o.relatie?.bedrijfsnaam || '—'}
                {o.project?.naam && <span className="text-gray-400"> · {o.project.naam}</span>}
              </>,
              rightTop: <span className={`px-1.5 py-0.5 rounded text-[10px] font-medium ${
                o.status === 'geaccepteerd' ? 'bg-green-100 text-green-700'
                : o.status === 'verzonden' ? 'bg-blue-100 text-blue-700'
                : o.status === 'afgewezen' ? 'bg-red-100 text-red-700'
                : 'bg-gray-100 text-gray-600'
              }`}>{o.status}</span>,
              rightBottom: <span className="font-medium text-gray-900">{formatCurrency(o.totaal)}</span>,
            })}
          />
        </>
      )}
    </div>
  )
}
