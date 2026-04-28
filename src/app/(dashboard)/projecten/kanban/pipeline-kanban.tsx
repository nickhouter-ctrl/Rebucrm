'use client'

import Link from 'next/link'
import { useMemo } from 'react'
import { PageHeader } from '@/components/ui/page-header'
import { Button } from '@/components/ui/button'
import { LayoutGrid, List, FolderKanban, Building2 } from 'lucide-react'
import { formatCurrency } from '@/lib/utils'
import type { PipelineFase } from '@/lib/actions'

interface Item {
  id: string
  naam: string
  bedrag: number
  relatieNaam: string | null
  contactpersoon: string | null
  laatsteOfferteId: string | null
  laatsteOfferteNummer: string | null
  laatsteOfferteDatum: string | null
  laatsteOfferteGeldigTot: string | null
  offerteStatus: string | null
  fase: PipelineFase
  updatedAt: string
}

const FASES: { key: PipelineFase; label: string; kleur: string; icoonkleur: string }[] = [
  { key: 'aanvraag',     label: 'Aanvraag',      kleur: 'bg-gray-50 border-gray-200',     icoonkleur: 'text-gray-500' },
  { key: 'concept',      label: 'Concept',       kleur: 'bg-amber-50 border-amber-200',   icoonkleur: 'text-amber-600' },
  { key: 'verzonden',    label: 'Verzonden',     kleur: 'bg-blue-50 border-blue-200',     icoonkleur: 'text-blue-600' },
  { key: 'geaccepteerd', label: 'Geaccepteerd',  kleur: 'bg-green-50 border-green-200',   icoonkleur: 'text-green-700' },
  { key: 'afgerond',     label: 'Afgerond',      kleur: 'bg-purple-50 border-purple-200', icoonkleur: 'text-purple-700' },
  { key: 'verloren',     label: 'Verloren',      kleur: 'bg-red-50 border-red-200',       icoonkleur: 'text-red-600' },
]

// Visueel pipeline-overzicht per fase. Geen drag-drop nog (zou DB-mutatie
// vereisen op offerte/project status); voor nu: leesbaar overzicht met
// totaal-bedrag per kolom + klikbare cards naar het project.
export function PipelineKanban({ items }: { items: Item[] }) {
  const grouped = useMemo(() => {
    const m = new Map<PipelineFase, Item[]>()
    for (const f of FASES) m.set(f.key, [])
    for (const it of items) m.get(it.fase)?.push(it)
    return m
  }, [items])

  const totaalPerFase = useMemo(() => {
    const m = new Map<PipelineFase, number>()
    for (const [k, v] of grouped) m.set(k, v.reduce((s, x) => s + (x.bedrag || 0), 0))
    return m
  }, [grouped])

  return (
    <div>
      <PageHeader
        title="Verkoopkansen pipeline"
        actions={
          <div className="flex gap-2">
            <Link href="/projecten">
              <Button variant="ghost" size="sm">
                <List className="h-4 w-4" />
                Lijst-weergave
              </Button>
            </Link>
            <Link href="/projecten/kanban">
              <Button variant="secondary" size="sm">
                <LayoutGrid className="h-4 w-4" />
                Kanban
              </Button>
            </Link>
          </div>
        }
      />

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-3">
        {FASES.map(f => {
          const cards = grouped.get(f.key) || []
          const totaal = totaalPerFase.get(f.key) || 0
          return (
            <div key={f.key} className={`border rounded-lg ${f.kleur} flex flex-col min-h-[200px]`}>
              <div className="px-3 py-2 border-b border-black/5 flex items-center justify-between">
                <div className="flex items-center gap-1.5">
                  <FolderKanban className={`h-3.5 w-3.5 ${f.icoonkleur}`} />
                  <span className="text-xs font-semibold text-gray-900">{f.label}</span>
                </div>
                <span className="text-[10px] bg-white/70 text-gray-700 px-1.5 py-0.5 rounded">{cards.length}</span>
              </div>
              <div className="px-3 py-1.5 text-[11px] text-gray-600 border-b border-black/5 bg-white/40">
                Totaal: <strong className="text-gray-900">{formatCurrency(totaal)}</strong>
              </div>
              <div className="flex-1 p-2 space-y-1.5 overflow-y-auto" style={{ maxHeight: 'calc(100vh - 260px)' }}>
                {cards.length === 0 ? (
                  <div className="text-[11px] text-gray-400 text-center py-4 italic">geen items</div>
                ) : (
                  cards.map(c => (
                    <Link
                      key={c.id}
                      href={`/projecten/${c.id}`}
                      className="block bg-white border border-gray-200 rounded p-2 hover:shadow-sm transition-shadow"
                    >
                      <div className="font-medium text-xs text-gray-900 truncate">{c.naam}</div>
                      {c.relatieNaam && (
                        <div className="text-[10px] text-gray-500 mt-0.5 flex items-center gap-1 truncate">
                          <Building2 className="h-2.5 w-2.5 flex-shrink-0" />
                          {c.relatieNaam}
                        </div>
                      )}
                      <div className="mt-1.5 flex items-center justify-between">
                        <span className="text-[10px] text-gray-400">{c.laatsteOfferteNummer || '—'}</span>
                        <span className="text-xs font-medium text-gray-900">{c.bedrag > 0 ? formatCurrency(c.bedrag) : '—'}</span>
                      </div>
                    </Link>
                  ))
                )}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
