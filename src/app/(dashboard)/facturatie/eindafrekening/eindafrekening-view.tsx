'use client'
import { useRouter } from 'next/navigation'
import { useState } from 'react'
import { type ColumnDef } from '@tanstack/react-table'
import { DataTable } from '@/components/ui/data-table'
import { PageHeader } from '@/components/ui/page-header'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { formatCurrency, formatDate } from '@/lib/utils'
import { ArrowLeft, CheckCircle2, FileText, Loader2, AlertTriangle } from 'lucide-react'
import { maakEindafrekening } from '@/lib/actions'

// Bepaal of de berekende rest verdacht is. Spiegel van de sanity-check in
// maakEindafrekening — gebruiker krijgt visuele waarschuwing voor de klik.
function detecteerProblemen(r: Aanbetaling): { ernst: 'ok' | 'warn' | 'fout'; reden: string } {
  const aanbet = Number(r.subtotaal || 0)
  const offerte = Number(r.offerte?.subtotaal || 0)
  if (!r.offerte) {
    return { ernst: 'warn', reden: 'Geen offerte gekoppeld — eindafrekening kan verkeerd berekend worden.' }
  }
  if (offerte === 0) {
    return { ernst: 'warn', reden: 'Offerte heeft geen subtotaal — controleer eerst.' }
  }
  if (aanbet > offerte) {
    return { ernst: 'fout', reden: `Aanbetaling (${aanbet}) is groter dan offerte (${offerte}). Verkeerde koppeling?` }
  }
  const rest = offerte - aanbet
  if (aanbet > 0 && rest > aanbet * 4) {
    return { ernst: 'fout', reden: `Rest €${rest.toFixed(2)} > 4× aanbetaling. Mogelijk verkeerde offerte gekoppeld.` }
  }
  if (rest > offerte * 0.95 && aanbet > 0) {
    return { ernst: 'warn', reden: 'Aanbetaling < 5% van offerte — controleer of dit klopt.' }
  }
  return { ernst: 'ok', reden: '' }
}

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
    const aanbet = aanbetalings.find(a => a.id === id)
    if (!aanbet) return
    const p = detecteerProblemen(aanbet)
    let prompt = 'Concept-restbetaling aanmaken voor deze klant?'
    if (p.ernst !== 'ok') {
      prompt = `⚠ ${p.reden}\n\nWeet u zeker dat u alsnog wilt doorgaan?`
    }
    if (!confirm(prompt)) return
    setBusyId(id)
    const res = await maakEindafrekening(id)
    setBusyId(null)
    if (res.error) { alert(res.error); return }
    if (res.factuurId) router.push(`/facturatie/${res.factuurId}`)
  }

  const columns: ColumnDef<Aanbetaling, unknown>[] = [
    {
      id: 'check',
      header: '',
      cell: ({ row }) => {
        const p = detecteerProblemen(row.original)
        if (p.ernst === 'ok') return null
        const cls = p.ernst === 'fout' ? 'text-red-600' : 'text-amber-600'
        return (
          <span title={p.reden} className={`inline-flex items-center ${cls}`}>
            <AlertTriangle className="h-4 w-4" />
          </span>
        )
      },
    },
    { id: 'relatie', header: 'Klant', accessorFn: (r) => r.relatie?.bedrijfsnaam || '-' },
    {
      id: 'onderwerp',
      header: 'Onderwerp',
      // Factuur eigen onderwerp heeft voorrang — dat beschrijft DEZE factuur.
      // De gekoppelde offerte kan verkeerd zijn (bv. door auto-koppeling op
      // klant-niveau wanneer er meerdere offertes voor dezelfde klant zijn).
      // Strip de standaard 'Aanbetaling/Restbetaling' prefix voor leesbaarheid.
      accessorFn: (r) => {
        const eigen = (r.onderwerp || '').replace(/^(1e\s+Factuur\s*\/\s*Aanbetaling|Aanbetaling|Restbetaling|2e\s+Factuur\s*\/\s*Restbetaling)\s+/i, '').trim()
        return eigen || r.offerte?.onderwerp || '-'
      },
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
