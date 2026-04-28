'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { type ColumnDef } from '@tanstack/react-table'
import { DataTable } from '@/components/ui/data-table'
import { PageHeader } from '@/components/ui/page-header'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { EmptyState } from '@/components/ui/empty-state'
import { formatCurrency, formatDateShort } from '@/lib/utils'
import { Plus, Receipt, AlertTriangle, CheckCircle, Clock, ExternalLink, FolderKanban, RefreshCw, Download } from 'lucide-react'
import { syncSnelstartBetalingen } from '@/lib/actions'
import { showToast } from '@/components/ui/toast'

interface Factuur {
  id: string
  factuurnummer: string
  datum: string
  vervaldatum: string | null
  status: string
  totaal: number
  subtotaal: number | null
  btw_totaal: number | null
  betaald_bedrag: number
  factuur_type: string | null
  relatie: { bedrijfsnaam: string } | null
  order: { id: string; ordernummer: string; status: string; onderwerp: string | null } | null
}

interface OrderFactuurInfo {
  id: string
  factuurnummer: string
  factuur_type: string | null
  status: string
  totaal: number
  betaald_bedrag: number
  order_id: string
}

interface OrderMetStatus {
  id: string
  ordernummer: string
  status: string
  onderwerp: string | null
  datum: string
  totaal: number
  relatie: Record<string, unknown> | Record<string, unknown>[] | null
  facturen: OrderFactuurInfo[]
  heeftAanbetaling: boolean
  heeftRestbetaling: boolean
  aanbetalingBetaald: boolean | undefined
  restbetalingVerstuurd: boolean
  volledigFactuur: OrderFactuurInfo | null
  eindafrekeningNodig: boolean
  restKanVerstuurd: boolean
}

const typeLabels: Record<string, string> = {
  aanbetaling: 'Aanbetaling',
  restbetaling: 'Restbetaling',
  volledig: 'Volledig',
}

const typeKleuren: Record<string, string> = {
  aanbetaling: 'bg-amber-100 text-amber-700',
  restbetaling: 'bg-indigo-100 text-indigo-700',
  volledig: 'bg-gray-100 text-gray-600',
}

const typeIcons: Record<string, string> = {
  aanbetaling: '1',
  restbetaling: '2',
  volledig: '●',
}

const columns: ColumnDef<Factuur, unknown>[] = [
  {
    accessorKey: 'factuurnummer',
    header: 'Nummer',
    cell: ({ row }) => (
      <div className="flex items-center gap-2">
        {row.original.factuur_type && row.original.factuur_type !== 'volledig' && (
          <span className={`inline-flex items-center justify-center w-5 h-5 rounded-full text-[10px] font-bold ${typeKleuren[row.original.factuur_type] || ''}`}>
            {typeIcons[row.original.factuur_type] || ''}
          </span>
        )}
        <span className="font-medium">{row.original.factuurnummer}</span>
        {row.original.factuur_type && row.original.factuur_type !== 'volledig' && (
          <span className={`inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium ${typeKleuren[row.original.factuur_type] || ''}`}>
            {typeLabels[row.original.factuur_type] || row.original.factuur_type}
          </span>
        )}
      </div>
    ),
  },
  { accessorKey: 'datum', header: 'Datum', cell: ({ getValue }) => formatDateShort(getValue() as string) },
  { id: 'relatie', header: 'Relatie', accessorFn: (row) => row.relatie?.bedrijfsnaam || '-' },
  {
    id: 'klus',
    header: 'Klus',
    accessorFn: (row) => row.order?.ordernummer || '',
    cell: ({ row }) => row.original.order ? (
      <span className="text-sm text-gray-600">{row.original.order.ordernummer}</span>
    ) : <span className="text-gray-300">-</span>,
  },
  { accessorKey: 'status', header: 'Status', cell: ({ getValue }) => <Badge status={getValue() as string} /> },
  {
    id: 'bedrag_excl',
    header: 'Bedrag excl. BTW',
    accessorFn: (row) => row.subtotaal ?? ((row.totaal || 0) - (row.btw_totaal || 0)),
    cell: ({ getValue }) => formatCurrency(getValue() as number),
  },
  {
    id: 'openstaand',
    header: 'Openstaand excl.',
    accessorFn: (row) => {
      const excl = row.subtotaal ?? ((row.totaal || 0) - (row.btw_totaal || 0))
      const pct = row.totaal ? excl / row.totaal : 1
      return (row.totaal - row.betaald_bedrag) * pct
    },
    cell: ({ getValue }) => {
      const val = getValue() as number
      return <span className={val > 0 ? 'text-red-600 font-medium' : ''}>{formatCurrency(val)}</span>
    },
  },
  {
    accessorKey: 'vervaldatum',
    header: 'Vervaldatum',
    cell: ({ getValue }) => getValue() ? formatDateShort(getValue() as string) : '-',
  },
]

type TabType = 'alle' | 'openstaand' | 'per-klus'

export function FactuurList({ facturen, ordersMetStatus }: { facturen: Factuur[]; ordersMetStatus: OrderMetStatus[] }) {
  const router = useRouter()
  const [tab, setTab] = useState<TabType>('alle')
  const [syncing, setSyncing] = useState(false)

  const openstaandFacturen = facturen.filter(f => f.status !== 'betaald' && f.status !== 'geannuleerd')
  const ordersMetActie = ordersMetStatus.filter(o => o.eindafrekeningNodig || o.restKanVerstuurd)

  async function handleSyncSnelstart() {
    if (syncing) return
    setSyncing(true)
    try {
      const res = await syncSnelstartBetalingen()
      if (res && 'error' in res && res.error) {
        showToast(res.error, 'error')
      } else if (res && 'success' in res && res.success) {
        const pushMsg = res.gepushtNaarSnelstart && res.gepushtNaarSnelstart > 0 ? `, ${res.gepushtNaarSnelstart} naar SnelStart gepusht` : ''
        showToast(`SnelStart sync klaar: ${res.bijgewerkt} bijgewerkt (${res.betaaldGeworden} betaald)${pushMsg}`, 'success')
        router.refresh()
      }
    } catch (err) {
      showToast('Sync mislukt: ' + (err instanceof Error ? err.message : String(err)), 'error')
    } finally {
      setSyncing(false)
    }
  }

  const tabs: { key: TabType; label: string; count?: number }[] = [
    { key: 'alle', label: 'Alle facturen' },
    { key: 'openstaand', label: 'Openstaand', count: openstaandFacturen.length },
    { key: 'per-klus', label: 'Per klus', count: ordersMetActie.length > 0 ? ordersMetActie.length : undefined },
  ]

  async function exportXlsx() {
    const data = tab === 'openstaand' ? openstaandFacturen : facturen
    if (data.length === 0) return
    const rows = data.map(f => ({
      Factuurnummer: f.factuurnummer,
      Datum: f.datum,
      Vervaldatum: f.vervaldatum || '',
      Status: f.status,
      Type: f.factuur_type || 'volledig',
      Klant: f.relatie?.bedrijfsnaam || '',
      Onderwerp: f.order?.onderwerp || '',
      Subtotaal: f.subtotaal ?? 0,
      BTW: f.btw_totaal ?? 0,
      Totaal: f.totaal,
      Betaald: f.betaald_bedrag,
      Openstaand: Math.max(0, f.totaal - (f.betaald_bedrag || 0)),
    }))
    const XLSX = await import('xlsx')
    const ws = XLSX.utils.json_to_sheet(rows)
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, 'Facturen')
    XLSX.writeFile(wb, `facturen-export-${new Date().toISOString().slice(0, 10)}.xlsx`)
  }

  return (
    <div>
      <PageHeader
        title="Facturatie"
        description="Beheer uw facturen"
        actions={
          <div className="flex items-center gap-2 flex-wrap">
            <Button variant="ghost" size="sm" onClick={exportXlsx}>
              <Download className="h-3.5 w-3.5" />
              Excel
            </Button>
            <Button variant="ghost" onClick={() => router.push('/facturatie/eindafrekening')}>
              Eindafrekening nodig
            </Button>
            <Button variant="secondary" onClick={handleSyncSnelstart} disabled={syncing}>
              <RefreshCw className={`h-4 w-4 ${syncing ? 'animate-spin' : ''}`} />
              {syncing ? 'Bezig...' : 'Sync SnelStart'}
            </Button>
            <Button onClick={() => router.push('/facturatie/nieuw')}>
              <Plus className="h-4 w-4" />
              Nieuwe factuur
            </Button>
          </div>
        }
      />

      {/* Actie-banner: klussen die eindafrekening nodig hebben */}
      {ordersMetActie.length > 0 && tab !== 'per-klus' && (
        <div className="bg-amber-50 border border-amber-200 rounded-lg p-4 mb-4">
          <div className="flex items-start gap-2">
            <AlertTriangle className="h-4 w-4 text-amber-600 mt-0.5 flex-shrink-0" />
            <div>
              <p className="text-sm font-medium text-amber-800">
                {ordersMetActie.length} {ordersMetActie.length === 1 ? 'klus heeft' : 'klussen hebben'} actie nodig
              </p>
              <div className="mt-1 space-y-1">
                {ordersMetActie.slice(0, 3).map(o => (
                  <p key={o.id} className="text-xs text-amber-700">
                    <strong>{o.ordernummer}</strong> ({String((Array.isArray(o.relatie) ? o.relatie[0] : o.relatie)?.bedrijfsnaam || '-')})
                    {o.eindafrekeningNodig && ' — eindafrekening nog niet aangemaakt'}
                    {o.restKanVerstuurd && ' — restbetaling kan verstuurd worden'}
                  </p>
                ))}
                {ordersMetActie.length > 3 && (
                  <button onClick={() => setTab('per-klus')} className="text-xs text-amber-800 underline">
                    +{ordersMetActie.length - 3} meer bekijken
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Tabs */}
      <div className="flex gap-1 mb-4 bg-gray-100 rounded-lg p-1 w-fit">
        {tabs.map(t => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
              tab === t.key ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'
            }`}
          >
            {t.label}
            {t.count !== undefined && t.count > 0 && (
              <span className={`ml-1.5 inline-flex items-center justify-center px-1.5 py-0.5 rounded-full text-[10px] font-bold ${
                tab === t.key ? 'bg-gray-200 text-gray-700' : 'bg-gray-200 text-gray-500'
              }`}>
                {t.count}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* Tab content */}
      {tab === 'alle' && (
        facturen.length === 0 ? (
          <EmptyState
            icon={Receipt}
            title="Geen facturen"
            description="U heeft nog geen facturen aangemaakt."
            action={
              <Button onClick={() => router.push('/facturatie/nieuw')}>
                <Plus className="h-4 w-4" />
                Factuur aanmaken
              </Button>
            }
          />
        ) : (
          <DataTable
            columns={columns}
            data={facturen}
            searchPlaceholder="Zoek factuur..."
            onRowClick={(row) => router.push(`/facturatie/${row.id}`)}
            mobileCard={(f) => ({
              title: f.factuurnummer,
              subtitle: f.relatie?.bedrijfsnaam || '—',
              rightTop: <span className={`px-1.5 py-0.5 rounded text-[10px] font-medium ${
                f.status === 'betaald' ? 'bg-green-100 text-green-700'
                : f.status === 'verzonden' ? 'bg-blue-100 text-blue-700'
                : f.status === 'vervallen' ? 'bg-red-100 text-red-700'
                : f.status === 'gecrediteerd' ? 'bg-gray-200 text-gray-600'
                : 'bg-gray-100 text-gray-600'
              }`}>{f.status}</span>,
              rightBottom: <span className="font-medium text-gray-900">{formatCurrency(f.totaal)}</span>,
            })}
          />
        )
      )}

      {tab === 'openstaand' && (
        openstaandFacturen.length === 0 ? (
          <EmptyState
            icon={CheckCircle}
            title="Alles betaald"
            description="Er zijn geen openstaande facturen."
          />
        ) : (
          <DataTable
            columns={columns}
            data={openstaandFacturen}
            searchPlaceholder="Zoek factuur..."
            onRowClick={(row) => router.push(`/facturatie/${row.id}`)}
          />
        )
      )}

      {tab === 'per-klus' && (
        <PerKlusView ordersMetStatus={ordersMetStatus} router={router} />
      )}
    </div>
  )
}

function PerKlusView({ ordersMetStatus, router }: { ordersMetStatus: OrderMetStatus[]; router: ReturnType<typeof useRouter> }) {
  const [filter, setFilter] = useState<'alle' | 'actie'>('actie')

  const filtered = filter === 'actie'
    ? ordersMetStatus.filter(o => o.eindafrekeningNodig || o.restKanVerstuurd || o.facturen.some(f => f.status !== 'betaald' && f.status !== 'geannuleerd'))
    : ordersMetStatus.filter(o => o.facturen.length > 0)

  return (
    <div>
      <div className="flex gap-2 mb-4">
        <button
          onClick={() => setFilter('actie')}
          className={`px-3 py-1 rounded-full text-xs font-medium transition-colors ${filter === 'actie' ? 'bg-amber-100 text-amber-800' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}
        >
          Actie nodig
        </button>
        <button
          onClick={() => setFilter('alle')}
          className={`px-3 py-1 rounded-full text-xs font-medium transition-colors ${filter === 'alle' ? 'bg-blue-100 text-blue-800' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}
        >
          Alle klussen met facturen
        </button>
      </div>

      {filtered.length === 0 ? (
        <EmptyState
          icon={CheckCircle}
          title={filter === 'actie' ? 'Geen acties nodig' : 'Geen klussen met facturen'}
          description={filter === 'actie' ? 'Alle klussen zijn volledig gefactureerd.' : ''}
        />
      ) : (
        <div className="space-y-3">
          {filtered.map(order => (
            <KlusFactuurCard key={order.id} order={order} router={router} />
          ))}
        </div>
      )}
    </div>
  )
}

function KlusFactuurCard({ order, router }: { order: OrderMetStatus; router: ReturnType<typeof useRouter> }) {
  const rel = Array.isArray(order.relatie) ? order.relatie[0] : order.relatie
  const relatieName = (rel as { bedrijfsnaam?: string })?.bedrijfsnaam || '-'

  return (
    <Card>
      <div className="px-5 py-3 border-b border-gray-100 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <FolderKanban className="h-4 w-4 text-gray-400" />
          <div>
            <div className="flex items-center gap-2">
              <span className="font-semibold text-sm">{order.ordernummer}</span>
              <Badge status={order.status} />
              {order.onderwerp && <span className="text-xs text-gray-500">{order.onderwerp}</span>}
            </div>
            <p className="text-xs text-gray-400">{relatieName} · {formatCurrency(order.totaal || 0)}</p>
          </div>
        </div>
        <Button variant="ghost" size="sm" onClick={() => router.push(`/offertes/orders/${order.id}`)}>
          <ExternalLink className="h-3 w-3" />
          Klus
        </Button>
      </div>

      <CardContent className="py-3">
        {order.facturen.length === 0 ? (
          <p className="text-sm text-gray-400 text-center py-2">Nog geen facturen</p>
        ) : (
          <div className="space-y-2">
            {order.facturen.map(factuur => (
              <button
                key={factuur.id}
                onClick={() => router.push(`/facturatie/${factuur.id}`)}
                className="w-full flex items-center justify-between px-3 py-2 rounded-lg hover:bg-gray-50 transition-colors text-left"
              >
                <div className="flex items-center gap-3">
                  {factuur.factuur_type && factuur.factuur_type !== 'volledig' ? (
                    <span className={`inline-flex items-center justify-center w-6 h-6 rounded-full text-xs font-bold ${typeKleuren[factuur.factuur_type] || ''}`}>
                      {typeIcons[factuur.factuur_type] || ''}
                    </span>
                  ) : (
                    <span className="inline-flex items-center justify-center w-6 h-6 rounded-full bg-gray-100 text-gray-500 text-xs">●</span>
                  )}
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium">{factuur.factuurnummer}</span>
                      <span className={`inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium ${typeKleuren[factuur.factuur_type || 'volledig'] || 'bg-gray-100 text-gray-600'}`}>
                        {typeLabels[factuur.factuur_type || 'volledig'] || 'Volledig'}
                      </span>
                      <Badge status={factuur.status} />
                    </div>
                  </div>
                </div>
                <div className="text-right">
                  <span className="text-sm font-medium">{formatCurrency(factuur.totaal)}</span>
                  {factuur.totaal - factuur.betaald_bedrag > 0 && (
                    <p className="text-[10px] text-red-500">Open: {formatCurrency(factuur.totaal - factuur.betaald_bedrag)}</p>
                  )}
                </div>
              </button>
            ))}
          </div>
        )}

        {/* Actie-indicatoren */}
        {order.eindafrekeningNodig && (
          <div className="mt-2 px-3 py-2 bg-amber-50 rounded-lg flex items-center gap-2">
            <AlertTriangle className="h-3.5 w-3.5 text-amber-600 flex-shrink-0" />
            <p className="text-xs text-amber-700 font-medium">Eindafrekening nog niet aangemaakt</p>
          </div>
        )}
        {order.restKanVerstuurd && (
          <div className="mt-2 px-3 py-2 bg-green-50 rounded-lg flex items-center gap-2">
            <CheckCircle className="h-3.5 w-3.5 text-green-600 flex-shrink-0" />
            <p className="text-xs text-green-700 font-medium">Order geleverd — restbetaling kan verstuurd worden</p>
          </div>
        )}
        {!order.eindafrekeningNodig && !order.restKanVerstuurd && order.facturen.every(f => f.status === 'betaald') && order.facturen.length > 0 && (
          <div className="mt-2 px-3 py-2 bg-gray-50 rounded-lg flex items-center gap-2">
            <CheckCircle className="h-3.5 w-3.5 text-gray-400 flex-shrink-0" />
            <p className="text-xs text-gray-500">Volledig betaald</p>
          </div>
        )}
      </CardContent>
    </Card>
  )
}
