'use client'

import { useEffect, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { type ColumnDef } from '@tanstack/react-table'
import { DataTable } from '@/components/ui/data-table'
import { PageHeader } from '@/components/ui/page-header'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { EmptyState } from '@/components/ui/empty-state'
import { formatCurrency, formatDateShort } from '@/lib/utils'
import { Plus, Receipt, AlertTriangle, CheckCircle, Clock, ExternalLink, FolderKanban, RefreshCw, Download, Send, Loader2 } from 'lucide-react'
import { syncSnelstartBetalingen, verstuurFactuurSnel } from '@/lib/actions'
import Link from 'next/link'
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
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  relatie: { id?: string; bedrijfsnaam: string } | any | null
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  order: { id: string; ordernummer: string; status: string; onderwerp: string | null; totaal?: number; subtotaal?: number; offerte?: any } | any | null
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  offerte?: { id: string; totaal?: number; subtotaal?: number; project?: { id: string; naam: string } } | any | null
}

interface OrderFactuurInfo {
  id: string
  factuurnummer: string
  factuur_type: string | null
  status: string
  totaal: number
  betaald_bedrag: number
  order_id: string
  vervaldatum?: string | null
  datum?: string | null
}

type KlusCategorie = 'nog_te_versturen' | 'eindafrekening_nodig' | 'wacht_op_betaling' | 'volledig' | 'geen_facturen'

interface OrderMetStatus {
  id: string
  ordernummer: string
  status: string
  onderwerp: string | null
  datum: string
  leverdatum?: string | null
  totaal: number
  subtotaal?: number | null
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  relatie: { id?: string; bedrijfsnaam: string } | any | null
  facturen: OrderFactuurInfo[]
  gefactureerdBedrag: number
  betaaldBedrag: number
  openstaandBedrag: number
  conceptBedrag: number
  nogTeFactureren: number
  categorie: KlusCategorie
  // backwards-compat
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
  termijn: 'Termijn',
  restbetaling: 'Restbetaling',
  volledig: 'Volledig',
}

const typeKleuren: Record<string, string> = {
  aanbetaling: 'bg-amber-100 text-amber-700',
  termijn: 'bg-purple-100 text-purple-700',
  restbetaling: 'bg-indigo-100 text-indigo-700',
  volledig: 'bg-gray-100 text-gray-600',
}

function buildColumns(
  versturenLoading: string | null,
  versturenStatus: Record<string, 'ok' | 'error'>,
  onVerstuur: (e: React.MouseEvent, id: string) => void,
): ColumnDef<Factuur, unknown>[] {
  return [
  {
    accessorKey: 'factuurnummer',
    header: 'Nummer',
    cell: ({ row }) => (
      <div className="flex items-center gap-2">
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
  {
    id: 'relatie',
    header: 'Klant',
    accessorFn: (row) => row.relatie?.bedrijfsnaam || '-',
    cell: ({ row }) => {
      const r = row.original.relatie
      return r?.id ? (
        <Link href={`/relatiebeheer/${r.id}`} onClick={(e) => e.stopPropagation()} className="font-medium text-gray-900 hover:text-[#00a66e] hover:underline">
          {r.bedrijfsnaam}
        </Link>
      ) : (<span className="font-medium text-gray-900">{r?.bedrijfsnaam || '-'}</span>)
    },
  },
  {
    id: 'verkoopkans',
    header: 'Verkoopkans',
    accessorFn: (row) => row.offerte?.project?.naam || row.order?.offerte?.project?.naam || row.order?.onderwerp || '',
    cell: ({ row }) => {
      const project = row.original.offerte?.project || row.original.order?.offerte?.project
      const naam = project?.naam || row.original.order?.onderwerp
      return project?.id ? (
        <Link href={`/projecten/${project.id}`} onClick={(e) => e.stopPropagation()} className="text-sm hover:text-[#00a66e] hover:underline">
          {naam}
        </Link>
      ) : (naam ? <span className="text-sm text-gray-600">{naam}</span> : <span className="text-gray-300">-</span>)
    },
  },
  { accessorKey: 'status', header: 'Status', cell: ({ getValue }) => <Badge status={getValue() as string} /> },
  {
    id: 'verkoopkans_totaal',
    header: 'Totaal verkoopkans excl.',
    accessorFn: (row) => Number(row.offerte?.subtotaal || row.order?.offerte?.subtotaal || row.order?.subtotaal || 0),
    cell: ({ getValue }) => {
      const v = getValue() as number
      return v > 0 ? <span className="text-sm text-gray-700">{formatCurrency(v)}</span> : <span className="text-gray-300">-</span>
    },
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
  {
    id: 'actie',
    header: '',
    cell: ({ row }) => {
      const f = row.original
      const kanVerstuurd = f.status === 'concept' || f.status === 'vervallen'
      const status = versturenStatus[f.id]
      if (!kanVerstuurd) return null
      return (
        <Button
          size="sm"
          variant="secondary"
          className="h-7 text-xs"
          onClick={(e) => onVerstuur(e, f.id)}
          disabled={versturenLoading === f.id}
          title="Versturen via e-mail"
        >
          {versturenLoading === f.id ? <Loader2 className="h-3 w-3 animate-spin" /> : status === 'ok' ? '✓' : <Send className="h-3 w-3" />}
          {versturenLoading === f.id ? '...' : status === 'ok' ? 'Verzonden' : 'Versturen'}
        </Button>
      )
    },
  },
  ]
}

type TabType = 'alle' | 'openstaand' | 'aanbetaling' | 'restbetaling' | 'per-klus'

export function FactuurList({ facturen, ordersMetStatus }: { facturen: Factuur[]; ordersMetStatus: OrderMetStatus[] }) {
  const router = useRouter()
  const searchParams = useSearchParams()
  // Tab uit URL lezen zodat dashboard-KPI's direct naar 'Openstaand' (etc)
  // kunnen springen via /facturatie?tab=openstaand[&vervallen=1].
  const initialTab = (searchParams.get('tab') as TabType) || 'alle'
  const [tab, setTab] = useState<TabType>(['alle', 'openstaand', 'aanbetaling', 'restbetaling', 'per-klus'].includes(initialTab) ? initialTab : 'alle')
  const [vervallenOnly, setVervallenOnly] = useState<boolean>(searchParams.get('vervallen') === '1')

  useEffect(() => {
    const t = searchParams.get('tab') as TabType | null
    if (t && ['alle', 'openstaand', 'aanbetaling', 'restbetaling', 'per-klus'].includes(t)) setTab(t)
    setVervallenOnly(searchParams.get('vervallen') === '1')
  }, [searchParams])
  const [syncing, setSyncing] = useState(false)
  const [versturenLoading, setVersturenLoading] = useState<string | null>(null)
  const [versturenStatus, setVersturenStatus] = useState<Record<string, 'ok' | 'error'>>({})

  async function handleSnelVersturen(e: React.MouseEvent, factuurId: string) {
    e.preventDefault()
    e.stopPropagation()
    if (versturenLoading) return
    setVersturenLoading(factuurId)
    try {
      const res = await verstuurFactuurSnel(factuurId)
      if ('error' in res && res.error) {
        setVersturenStatus(prev => ({ ...prev, [factuurId]: 'error' }))
        showToast(`Versturen mislukt: ${res.error}`, 'error')
      } else {
        setVersturenStatus(prev => ({ ...prev, [factuurId]: 'ok' }))
        showToast('Factuur verzonden', 'success')
        router.refresh()
      }
    } finally {
      setVersturenLoading(null)
    }
  }

  const columns = buildColumns(versturenLoading, versturenStatus, handleSnelVersturen)

  // Sorteer op datum aflopend (nieuwste/laatst verstuurde eerst). Bij gelijke
  // datum valt factuurnummer terug — zo houden we deterministische ordering.
  const sorted = [...facturen].sort((a, b) => {
    const da = (a.datum || '')
    const db = (b.datum || '')
    if (da !== db) return db.localeCompare(da)
    return (b.factuurnummer || '').localeCompare(a.factuurnummer || '')
  })
  const vandaagStr = new Date().toISOString().slice(0, 10)
  const openstaandFacturenAll = sorted.filter(f => f.status !== 'betaald' && f.status !== 'geannuleerd')
  // Bij ?vervallen=1 (vanuit dashboard 'Achterstallig'-KPI) tonen we alleen
  // facturen waarvan de vervaldatum is gepasseerd.
  const openstaandFacturen = vervallenOnly
    ? openstaandFacturenAll.filter(f => f.vervaldatum && f.vervaldatum < vandaagStr)
    : openstaandFacturenAll
  const aanbetalingFacturen = sorted.filter(f => f.factuur_type === 'aanbetaling')
  const restbetalingFacturen = sorted.filter(f => f.factuur_type === 'restbetaling')
  // Restbetaling-segmentatie voor overzichtelijke weergave
  const restConcept = restbetalingFacturen.filter(f => f.status === 'concept')
  const restOpenstaand = restbetalingFacturen.filter(f => f.status !== 'concept' && f.status !== 'betaald' && f.status !== 'geannuleerd' && f.status !== 'gecrediteerd')
  const restBetaald = restbetalingFacturen.filter(f => f.status === 'betaald' || f.status === 'gecrediteerd')
  const ordersMetActie = ordersMetStatus.filter(o => o.eindafrekeningNodig || o.restKanVerstuurd)

  function berekenStats(list: Factuur[]) {
    const aantal = list.length
    let totaal = 0
    let open = 0
    let vervallen = 0
    for (const f of list) {
      totaal += f.totaal || 0
      const restOpen = (f.totaal || 0) - (f.betaald_bedrag || 0)
      if (restOpen > 0.01 && f.status !== 'betaald' && f.status !== 'geannuleerd') {
        open += restOpen
        if (f.vervaldatum && f.vervaldatum < vandaagStr) vervallen += restOpen
      }
    }
    return { aantal, totaal, open, vervallen }
  }

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
    { key: 'openstaand', label: vervallenOnly ? 'Openstaand · alleen vervallen' : 'Openstaand', count: openstaandFacturen.length },
    { key: 'aanbetaling', label: 'Aanbetalingen', count: aanbetalingFacturen.length },
    { key: 'restbetaling', label: 'Restbetalingen', count: restbetalingFacturen.length },
    { key: 'per-klus', label: 'Per klus', count: ordersMetActie.length > 0 ? ordersMetActie.length : undefined },
  ]

  async function exportXlsx() {
    const data = tab === 'openstaand' ? openstaandFacturen
      : tab === 'aanbetaling' ? aanbetalingFacturen
      : tab === 'restbetaling' ? restbetalingFacturen
      : sorted
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
            onClick={() => { setTab(t.key); if (t.key !== 'openstaand') setVervallenOnly(false) }}
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
        sorted.length === 0 ? (
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
          <>
            <StatsBar stats={berekenStats(sorted)} />
            <DataTable
              columns={columns}
              data={sorted}
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
          </>
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
          <>
            <StatsBar stats={berekenStats(openstaandFacturen)} />
            <DataTable
              columns={columns}
              data={openstaandFacturen}
              searchPlaceholder="Zoek factuur..."
              onRowClick={(row) => router.push(`/facturatie/${row.id}`)}
            />
          </>
        )
      )}

      {tab === 'aanbetaling' && (
        aanbetalingFacturen.length === 0 ? (
          <EmptyState
            icon={Receipt}
            title="Geen aanbetalingen"
            description="Er zijn nog geen aanbetalingsfacturen aangemaakt."
          />
        ) : (
          <>
            <StatsBar stats={berekenStats(aanbetalingFacturen)} />
            <DataTable
              columns={columns}
              data={aanbetalingFacturen}
              searchPlaceholder="Zoek aanbetaling..."
              onRowClick={(row) => router.push(`/facturatie/${row.id}`)}
            />
          </>
        )
      )}

      {tab === 'restbetaling' && (
        restbetalingFacturen.length === 0 ? (
          <EmptyState
            icon={Receipt}
            title="Geen restbetalingen"
            description="Er zijn nog geen restbetalingsfacturen aangemaakt."
          />
        ) : (
          <RestbetalingView
            concept={restConcept}
            openstaand={restOpenstaand}
            betaald={restBetaald}
            columns={columns}
            berekenStats={berekenStats}
            router={router}
          />
        )
      )}

      {tab === 'per-klus' && (
        <PerKlusView ordersMetStatus={ordersMetStatus} router={router} />
      )}
    </div>
  )
}

function StatsBar({ stats }: { stats: { aantal: number; totaal: number; open: number; vervallen: number } }) {
  return (
    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4">
      <div className="bg-white border border-gray-200 rounded-lg px-4 py-3">
        <p className="text-[11px] uppercase tracking-wide text-gray-500 font-medium">Aantal</p>
        <p className="text-xl font-semibold text-gray-900 mt-0.5">{stats.aantal}</p>
      </div>
      <div className="bg-white border border-gray-200 rounded-lg px-4 py-3">
        <p className="text-[11px] uppercase tracking-wide text-gray-500 font-medium">Totaal</p>
        <p className="text-xl font-semibold text-gray-900 mt-0.5">{formatCurrency(stats.totaal)}</p>
      </div>
      <div className="bg-white border border-gray-200 rounded-lg px-4 py-3">
        <p className="text-[11px] uppercase tracking-wide text-gray-500 font-medium">Openstaand</p>
        <p className={`text-xl font-semibold mt-0.5 ${stats.open > 0 ? 'text-amber-600' : 'text-gray-900'}`}>{formatCurrency(stats.open)}</p>
      </div>
      <div className="bg-white border border-gray-200 rounded-lg px-4 py-3">
        <p className="text-[11px] uppercase tracking-wide text-gray-500 font-medium">Vervallen</p>
        <p className={`text-xl font-semibold mt-0.5 ${stats.vervallen > 0 ? 'text-red-600' : 'text-gray-900'}`}>{formatCurrency(stats.vervallen)}</p>
      </div>
    </div>
  )
}

function RestbetalingView({
  concept,
  openstaand,
  betaald,
  columns,
  berekenStats,
  router,
}: {
  concept: Factuur[]
  openstaand: Factuur[]
  betaald: Factuur[]
  columns: ColumnDef<Factuur, unknown>[]
  berekenStats: (list: Factuur[]) => { aantal: number; totaal: number; open: number; vervallen: number }
  router: ReturnType<typeof useRouter>
}) {
  const [betaaldOpen, setBetaaldOpen] = useState(false)
  return (
    <div className="space-y-6">
      <StatsBar stats={berekenStats([...concept, ...openstaand, ...betaald])} />

      {concept.length > 0 && (
        <div>
          <h3 className="text-sm font-semibold text-gray-900 mb-2 flex items-center gap-2">
            <AlertTriangle className="h-4 w-4 text-amber-500" />
            Nog te versturen
            <span className="text-xs font-normal text-gray-400">({concept.length})</span>
          </h3>
          <DataTable
            columns={columns}
            data={concept}
            searchPlaceholder="Zoek..."
            onRowClick={(row) => router.push(`/facturatie/${row.id}`)}
          />
        </div>
      )}

      {openstaand.length > 0 && (
        <div>
          <h3 className="text-sm font-semibold text-gray-900 mb-2 flex items-center gap-2">
            <Clock className="h-4 w-4 text-blue-500" />
            Verstuurd · wacht op betaling
            <span className="text-xs font-normal text-gray-400">({openstaand.length})</span>
          </h3>
          <DataTable
            columns={columns}
            data={openstaand}
            searchPlaceholder="Zoek..."
            onRowClick={(row) => router.push(`/facturatie/${row.id}`)}
          />
        </div>
      )}

      {betaald.length > 0 && (
        <div>
          <button
            type="button"
            onClick={() => setBetaaldOpen(v => !v)}
            className="w-full flex items-center gap-2 text-sm font-semibold text-gray-900 mb-2 hover:text-[#00a66e] transition-colors"
          >
            <CheckCircle className="h-4 w-4 text-emerald-500" />
            Betaald / afgehandeld
            <span className="text-xs font-normal text-gray-400">({betaald.length})</span>
            <span className="ml-auto text-xs text-gray-400">{betaaldOpen ? 'verbergen' : 'tonen'}</span>
          </button>
          {betaaldOpen && (
            <DataTable
              columns={columns}
              data={betaald}
              searchPlaceholder="Zoek..."
              onRowClick={(row) => router.push(`/facturatie/${row.id}`)}
            />
          )}
        </div>
      )}

      {concept.length === 0 && openstaand.length === 0 && betaald.length === 0 && (
        <EmptyState icon={Receipt} title="Geen restbetalingen" description="" />
      )}
    </div>
  )
}

const CATEGORIE_META: Record<KlusCategorie, { label: string; kleur: string; volgorde: number }> = {
  nog_te_versturen:     { label: 'Nog te versturen',     kleur: 'amber',  volgorde: 1 },
  eindafrekening_nodig: { label: 'Eindafrekening nodig', kleur: 'red',    volgorde: 2 },
  wacht_op_betaling:    { label: 'Wacht op betaling',    kleur: 'blue',   volgorde: 3 },
  geen_facturen:        { label: 'Nog niet gefactureerd', kleur: 'gray',  volgorde: 4 },
  volledig:             { label: 'Volledig afgehandeld', kleur: 'emerald',volgorde: 5 },
}

function PerKlusView({ ordersMetStatus, router }: { ordersMetStatus: OrderMetStatus[]; router: ReturnType<typeof useRouter> }) {
  const [toonAfgehandeld, setToonAfgehandeld] = useState(false)
  const [zoek, setZoek] = useState('')

  const gefilterd = ordersMetStatus.filter(o => {
    if (!zoek) return true
    const q = zoek.toLowerCase()
    const rel = Array.isArray(o.relatie) ? o.relatie[0] : o.relatie
    const relatieNaam = (rel as { bedrijfsnaam?: string })?.bedrijfsnaam || ''
    return (
      o.ordernummer.toLowerCase().includes(q) ||
      relatieNaam.toLowerCase().includes(q) ||
      (o.onderwerp || '').toLowerCase().includes(q)
    )
  })

  // Groeperen per categorie
  const groepen: Record<KlusCategorie, OrderMetStatus[]> = {
    nog_te_versturen: [],
    eindafrekening_nodig: [],
    wacht_op_betaling: [],
    geen_facturen: [],
    volledig: [],
  }
  for (const o of gefilterd) groepen[o.categorie].push(o)

  // Totalen voor de stats-bar
  const totaalNogTeVersturen = groepen.nog_te_versturen.reduce((s, o) => s + o.conceptBedrag, 0)
  const totaalEindafrekening = groepen.eindafrekening_nodig.reduce((s, o) => s + o.nogTeFactureren, 0)
  const totaalOpenstaand = ordersMetStatus.reduce((s, o) => s + o.openstaandBedrag, 0)

  const actieGroepen: KlusCategorie[] = ['nog_te_versturen', 'eindafrekening_nodig', 'wacht_op_betaling', 'geen_facturen']
  const afgehandeldeGroepen: KlusCategorie[] = ['volledig']

  return (
    <div className="space-y-6">
      {/* Stats overzicht */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="bg-white border border-gray-200 rounded-lg px-4 py-3">
          <p className="text-[11px] uppercase tracking-wide text-gray-500 font-medium">Klussen totaal</p>
          <p className="text-xl font-semibold text-gray-900 mt-0.5">{ordersMetStatus.length}</p>
        </div>
        <div className="bg-white border border-gray-200 rounded-lg px-4 py-3">
          <p className="text-[11px] uppercase tracking-wide text-gray-500 font-medium">Nog te versturen</p>
          <p className={`text-xl font-semibold mt-0.5 ${totaalNogTeVersturen > 0 ? 'text-amber-600' : 'text-gray-900'}`}>{formatCurrency(totaalNogTeVersturen)}</p>
          <p className="text-[10px] text-gray-400 mt-0.5">{groepen.nog_te_versturen.length} klus(sen)</p>
        </div>
        <div className="bg-white border border-gray-200 rounded-lg px-4 py-3">
          <p className="text-[11px] uppercase tracking-wide text-gray-500 font-medium">Eindafrekening nodig</p>
          <p className={`text-xl font-semibold mt-0.5 ${totaalEindafrekening > 0 ? 'text-red-600' : 'text-gray-900'}`}>{formatCurrency(totaalEindafrekening)}</p>
          <p className="text-[10px] text-gray-400 mt-0.5">{groepen.eindafrekening_nodig.length} klus(sen)</p>
        </div>
        <div className="bg-white border border-gray-200 rounded-lg px-4 py-3">
          <p className="text-[11px] uppercase tracking-wide text-gray-500 font-medium">Totaal openstaand</p>
          <p className={`text-xl font-semibold mt-0.5 ${totaalOpenstaand > 0 ? 'text-blue-600' : 'text-gray-900'}`}>{formatCurrency(totaalOpenstaand)}</p>
        </div>
      </div>

      {/* Zoekbalk */}
      <div className="flex items-center justify-between gap-3">
        <input
          type="search"
          placeholder="Zoek klant, klus of ordernummer..."
          value={zoek}
          onChange={(e) => setZoek(e.target.value)}
          className="w-full max-w-sm px-3 py-1.5 text-sm border border-gray-200 rounded-md focus:outline-none focus:ring-2 focus:ring-[#00a66e] focus:border-transparent"
        />
        <label className="flex items-center gap-2 text-xs text-gray-600 whitespace-nowrap">
          <input
            type="checkbox"
            checked={toonAfgehandeld}
            onChange={(e) => setToonAfgehandeld(e.target.checked)}
            className="rounded border-gray-300"
          />
          Afgehandelde klussen tonen
        </label>
      </div>

      {/* Per categorie secties */}
      {actieGroepen.map(cat => {
        const orders = groepen[cat]
        if (orders.length === 0) return null
        return <KlusGroep key={cat} categorie={cat} orders={orders} router={router} />
      })}

      {toonAfgehandeld && afgehandeldeGroepen.map(cat => {
        const orders = groepen[cat]
        if (orders.length === 0) return null
        return <KlusGroep key={cat} categorie={cat} orders={orders} router={router} />
      })}

      {gefilterd.length === 0 && (
        <EmptyState
          icon={zoek ? Receipt : CheckCircle}
          title={zoek ? 'Geen resultaten' : 'Geen klussen gevonden'}
          description={zoek ? 'Probeer een andere zoekterm.' : 'Alle klussen zijn afgehandeld of geannuleerd.'}
        />
      )}
    </div>
  )
}

function KlusGroep({ categorie, orders, router }: { categorie: KlusCategorie; orders: OrderMetStatus[]; router: ReturnType<typeof useRouter> }) {
  const meta = CATEGORIE_META[categorie]
  const Icon = categorie === 'nog_te_versturen' ? AlertTriangle
    : categorie === 'eindafrekening_nodig' ? AlertTriangle
    : categorie === 'wacht_op_betaling' ? Clock
    : categorie === 'volledig' ? CheckCircle
    : Receipt

  const kleurKlassen = {
    amber: 'text-amber-500',
    red: 'text-red-500',
    blue: 'text-blue-500',
    emerald: 'text-emerald-500',
    gray: 'text-gray-400',
  }[meta.kleur] || 'text-gray-500'

  return (
    <div>
      <h3 className="text-sm font-semibold text-gray-900 mb-2 flex items-center gap-2">
        <Icon className={`h-4 w-4 ${kleurKlassen}`} />
        {meta.label}
        <span className="text-xs font-normal text-gray-400">({orders.length})</span>
      </h3>
      <div className="space-y-2">
        {orders.map(order => (
          <KlusFactuurCard key={order.id} order={order} router={router} />
        ))}
      </div>
    </div>
  )
}

function KlusFactuurCard({ order, router }: { order: OrderMetStatus; router: ReturnType<typeof useRouter> }) {
  const rel = Array.isArray(order.relatie) ? order.relatie[0] : order.relatie
  const relatieName = (rel as { bedrijfsnaam?: string })?.bedrijfsnaam || '-'
  const relatieId = (rel as { id?: string })?.id

  return (
    <Card>
      <div className="px-5 py-3 border-b border-gray-100 flex items-center justify-between flex-wrap gap-2">
        <div className="flex items-center gap-3 min-w-0">
          <FolderKanban className="h-4 w-4 text-gray-400 flex-shrink-0" />
          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              {relatieId ? (
                <Link href={`/relatiebeheer/${relatieId}`} onClick={(e) => e.stopPropagation()} className="font-semibold text-sm text-gray-900 hover:text-[#00a66e] hover:underline truncate">
                  {relatieName}
                </Link>
              ) : (
                <span className="font-semibold text-sm text-gray-900 truncate">{relatieName}</span>
              )}
              <span className="text-xs text-gray-400">·</span>
              <span className="text-xs font-medium text-gray-600">{order.ordernummer}</span>
              <Badge status={order.status} />
            </div>
            {order.onderwerp && <p className="text-xs text-gray-500 truncate">{order.onderwerp}</p>}
          </div>
        </div>
        <Button variant="ghost" size="sm" onClick={() => router.push(`/offertes/orders/${order.id}`)}>
          <ExternalLink className="h-3 w-3" />
          Klus
        </Button>
      </div>

      <CardContent className="py-3 space-y-3">
        {/* Bedragen-strip */}
        <div className="flex items-center justify-between text-xs">
          <div className="flex items-center gap-4 flex-wrap">
            <span className="text-gray-500">Klus: <strong className="text-gray-900">{formatCurrency(order.totaal || 0)}</strong></span>
            <span className="text-gray-500">Gefactureerd: <strong className="text-gray-900">{formatCurrency(order.gefactureerdBedrag)}</strong></span>
            <span className="text-gray-500">Betaald: <strong className="text-emerald-600">{formatCurrency(order.betaaldBedrag)}</strong></span>
            {order.openstaandBedrag > 0 && (
              <span className="text-gray-500">Openstaand: <strong className="text-blue-600">{formatCurrency(order.openstaandBedrag)}</strong></span>
            )}
            {order.nogTeFactureren > 1 && (
              <span className="text-gray-500">Nog te factureren: <strong className="text-red-600">{formatCurrency(order.nogTeFactureren)}</strong></span>
            )}
          </div>
        </div>

        {/* Facturen */}
        {order.facturen.length === 0 ? (
          <p className="text-sm text-gray-400 text-center py-2">Nog geen facturen</p>
        ) : (
          <div className="space-y-1">
            {order.facturen.map(factuur => {
              const open = Math.max(0, factuur.totaal - (factuur.betaald_bedrag || 0))
              const vervallen = factuur.vervaldatum && factuur.vervaldatum < new Date().toISOString().slice(0, 10) && open > 0 && factuur.status !== 'betaald'
              return (
                <button
                  key={factuur.id}
                  onClick={() => router.push(`/facturatie/${factuur.id}`)}
                  className="w-full flex items-center justify-between px-3 py-2 rounded-lg hover:bg-gray-50 transition-colors text-left"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <span className="text-sm font-medium text-gray-900">{factuur.factuurnummer}</span>
                    {factuur.factuur_type && factuur.factuur_type !== 'volledig' && (
                      <span className={`inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium ${typeKleuren[factuur.factuur_type] || ''}`}>
                        {typeLabels[factuur.factuur_type] || factuur.factuur_type}
                      </span>
                    )}
                    <Badge status={factuur.status} />
                    {vervallen && (
                      <span className="text-[10px] text-red-600 font-medium">VERVALLEN</span>
                    )}
                  </div>
                  <div className="text-right">
                    <span className="text-sm font-medium">{formatCurrency(factuur.totaal)}</span>
                    {open > 0 && factuur.status !== 'concept' && (
                      <p className="text-[10px] text-red-500">Open: {formatCurrency(open)}</p>
                    )}
                  </div>
                </button>
              )
            })}
          </div>
        )}

        {/* Actie-hint per categorie */}
        {order.categorie === 'nog_te_versturen' && (
          <div className="px-3 py-2 bg-amber-50 rounded-lg flex items-center gap-2">
            <AlertTriangle className="h-3.5 w-3.5 text-amber-600 flex-shrink-0" />
            <p className="text-xs text-amber-700 font-medium">
              {order.facturen.filter(f => f.status === 'concept').length === 1
                ? 'Er staat 1 concept-factuur klaar om verstuurd te worden'
                : `Er staan ${order.facturen.filter(f => f.status === 'concept').length} concept-facturen klaar om verstuurd te worden`}
            </p>
          </div>
        )}
        {order.categorie === 'eindafrekening_nodig' && (
          <div className="px-3 py-2 bg-red-50 rounded-lg flex items-center gap-2">
            <AlertTriangle className="h-3.5 w-3.5 text-red-600 flex-shrink-0" />
            <p className="text-xs text-red-700 font-medium">
              Klus is {order.status} maar {formatCurrency(order.nogTeFactureren)} is nog niet gefactureerd
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  )
}
