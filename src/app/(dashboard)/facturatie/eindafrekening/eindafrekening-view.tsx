'use client'
import { useRouter } from 'next/navigation'
import { useState } from 'react'
import { type ColumnDef } from '@tanstack/react-table'
import { DataTable } from '@/components/ui/data-table'
import { PageHeader } from '@/components/ui/page-header'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { formatCurrency, formatDate } from '@/lib/utils'
import { ArrowLeft, CheckCircle2, FileText, Loader2 } from 'lucide-react'
import { maakEindafrekening } from '@/lib/actions'

type Aanbetaling = {
  id: string
  factuurnummer: string
  datum: string | null
  status: string
  subtotaal: number | null
  totaal: number
  onderwerp: string | null
  relatie: { bedrijfsnaam: string } | null
  order_id: string | null
  offerte: { id: string; offertenummer: string; subtotaal: number | null; onderwerp: string | null } | null
}

export function EindafrekeningView({ aanbetalings }: { aanbetalings: Aanbetaling[] }) {
  const router = useRouter()
  const [busyId, setBusyId] = useState<string | null>(null)

  async function handleMaak(id: string) {
    if (!confirm('Concept-restbetaling aanmaken voor deze klant?')) return
    setBusyId(id)
    const res = await maakEindafrekening(id)
    setBusyId(null)
    if (res.error) { alert(res.error); return }
    if (res.factuurId) router.push(`/facturatie/${res.factuurId}`)
  }

  const columns: ColumnDef<Aanbetaling, unknown>[] = [
    { id: 'relatie', header: 'Klant', accessorFn: (r) => r.relatie?.bedrijfsnaam || '-' },
    {
      id: 'onderwerp',
      header: 'Onderwerp',
      accessorFn: (r) => r.offerte?.onderwerp || r.onderwerp || '-',
    },
    { accessorKey: 'datum', header: 'Aanbet-datum', cell: ({ getValue }) => getValue() ? formatDate(getValue() as string) : '-' },
    {
      id: 'offerte_totaal',
      header: 'Offerte totaal excl.',
      accessorFn: (r) => r.offerte?.subtotaal ?? null,
      cell: ({ getValue }) => {
        const v = getValue() as number | null
        return v != null ? formatCurrency(v) : <span className="text-gray-400 text-xs">onbekend</span>
      },
    },
    {
      id: 'aanbet',
      header: 'Aanbetaling excl.',
      accessorFn: (r) => r.subtotaal ?? 0,
      cell: ({ getValue }) => formatCurrency(getValue() as number),
    },
    {
      id: 'rest',
      header: 'Rest excl.',
      accessorFn: (r) => (r.offerte?.subtotaal ?? 0) - (r.subtotaal ?? 0),
      cell: ({ getValue }) => {
        const v = getValue() as number
        return v > 0 ? <span className="font-medium text-[#00a66e]">{formatCurrency(v)}</span> : <span className="text-gray-400 text-xs">-</span>
      },
    },
    { accessorKey: 'status', header: 'Status', cell: ({ getValue }) => <Badge status={getValue() as string} /> },
    {
      id: 'actie', header: '',
      cell: ({ row }) => (
        <Button
          size="sm"
          onClick={(e) => { e.stopPropagation(); handleMaak(row.original.id) }}
          disabled={busyId === row.original.id}
        >
          {busyId === row.original.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileText className="h-4 w-4" />}
          Maak eindafrekening
        </Button>
      ),
    },
  ]

  return (
    <div>
      <PageHeader
        title="Eindafrekening nodig"
        description={`${aanbetalings.length} klanten waar nog een restbetaling/eindfactuur voor verstuurd moet worden`}
        actions={<Button variant="ghost" onClick={() => router.back()}><ArrowLeft className="h-4 w-4" />Terug</Button>}
      />
      {aanbetalings.length === 0 ? (
        <div className="text-center py-12 text-gray-400">
          <CheckCircle2 className="h-10 w-10 mx-auto mb-2 text-green-500" />
          <p>Alle aanbetalingen hebben een eindafrekening.</p>
        </div>
      ) : (
        <DataTable
          columns={columns}
          data={aanbetalings}
          searchPlaceholder="Zoek klant..."
          onRowClick={(r) => router.push(`/facturatie/${r.id}`)}
        />
      )}
    </div>
  )
}
