'use client'

import { useState, useMemo } from 'react'
import { formatCurrency } from '@/lib/utils'
import { Plus, Minus, ArrowRight } from 'lucide-react'

// Diff-view voor 2 offerte-versies. Laat zien welke regels zijn toegevoegd,
// verwijderd of aangepast tussen v1 en v2 zodat je snel kunt zien wat er is
// veranderd zonder beide PDFs naast elkaar te leggen.

interface Regel {
  omschrijving: string
  aantal: number
  prijs: number
  btw_percentage?: number
}

interface VersieData {
  versie_nummer: number
  totaal: number
  regels: Regel[]
  datum: string
}

export function VersieDiff({ links, rechts }: { links: VersieData; rechts: VersieData }) {
  const diffs = useMemo(() => computeDiff(links.regels, rechts.regels), [links.regels, rechts.regels])
  const totaalVerschil = rechts.totaal - links.totaal

  return (
    <div className="bg-white border border-gray-200 rounded-lg p-4">
      <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
        <div className="flex items-center gap-3 text-sm">
          <div className="text-gray-700">
            <span className="font-medium">v{links.versie_nummer}</span>
            <span className="text-gray-400 ml-1.5">{links.datum}</span>
            <span className="ml-1.5 font-semibold">{formatCurrency(links.totaal)}</span>
          </div>
          <ArrowRight className="h-4 w-4 text-gray-400" />
          <div className="text-gray-900">
            <span className="font-medium">v{rechts.versie_nummer}</span>
            <span className="text-gray-400 ml-1.5">{rechts.datum}</span>
            <span className="ml-1.5 font-semibold">{formatCurrency(rechts.totaal)}</span>
          </div>
        </div>
        <div className={`text-sm font-semibold ${totaalVerschil > 0 ? 'text-green-700' : totaalVerschil < 0 ? 'text-red-600' : 'text-gray-500'}`}>
          {totaalVerschil >= 0 ? '+' : ''}{formatCurrency(totaalVerschil)}
        </div>
      </div>

      <div className="space-y-1">
        {diffs.map((d, i) => (
          <DiffRij key={i} diff={d} />
        ))}
        {diffs.length === 0 && (
          <div className="text-center text-sm text-gray-400 py-6">Geen wijzigingen — beide versies zijn identiek.</div>
        )}
      </div>
    </div>
  )
}

type DiffEntry =
  | { kind: 'added'; regel: Regel }
  | { kind: 'removed'; regel: Regel }
  | { kind: 'changed'; before: Regel; after: Regel }
  | { kind: 'unchanged'; regel: Regel }

function regelKey(r: Regel): string {
  return r.omschrijving.toLowerCase().trim()
}

function computeDiff(linksRegels: Regel[], rechtsRegels: Regel[]): DiffEntry[] {
  const out: DiffEntry[] = []
  const linksMap = new Map(linksRegels.map(r => [regelKey(r), r]))
  const rechtsMap = new Map(rechtsRegels.map(r => [regelKey(r), r]))
  // Volgorde: rechts eerst (voor toegevoegd/changed), dan links-onlys
  const seen = new Set<string>()
  for (const r of rechtsRegels) {
    const key = regelKey(r)
    seen.add(key)
    const l = linksMap.get(key)
    if (!l) {
      out.push({ kind: 'added', regel: r })
    } else if (l.aantal !== r.aantal || Number(l.prijs) !== Number(r.prijs)) {
      out.push({ kind: 'changed', before: l, after: r })
    } else {
      out.push({ kind: 'unchanged', regel: r })
    }
  }
  for (const l of linksRegels) {
    if (!seen.has(regelKey(l))) {
      out.push({ kind: 'removed', regel: l })
    }
  }
  return out.filter(d => d.kind !== 'unchanged')
}

function DiffRij({ diff }: { diff: DiffEntry }) {
  if (diff.kind === 'added') {
    return (
      <div className="flex items-start gap-2 p-2 bg-green-50 border border-green-200 rounded text-sm">
        <Plus className="h-3.5 w-3.5 text-green-700 mt-0.5 flex-shrink-0" />
        <div className="flex-1">
          <div className="font-medium text-green-900">{diff.regel.omschrijving}</div>
          <div className="text-xs text-green-700">{diff.regel.aantal}× {formatCurrency(diff.regel.prijs)} = {formatCurrency(diff.regel.aantal * diff.regel.prijs)}</div>
        </div>
        <span className="text-[10px] uppercase tracking-wider text-green-700 font-semibold">Nieuw</span>
      </div>
    )
  }
  if (diff.kind === 'removed') {
    return (
      <div className="flex items-start gap-2 p-2 bg-red-50 border border-red-200 rounded text-sm">
        <Minus className="h-3.5 w-3.5 text-red-700 mt-0.5 flex-shrink-0" />
        <div className="flex-1">
          <div className="font-medium text-red-900 line-through">{diff.regel.omschrijving}</div>
          <div className="text-xs text-red-700">{diff.regel.aantal}× {formatCurrency(diff.regel.prijs)}</div>
        </div>
        <span className="text-[10px] uppercase tracking-wider text-red-700 font-semibold">Weg</span>
      </div>
    )
  }
  if (diff.kind !== 'changed') return null
  const beforeTotal = diff.before.aantal * diff.before.prijs
  const afterTotal = diff.after.aantal * diff.after.prijs
  const verschil = afterTotal - beforeTotal
  return (
    <div className="flex items-start gap-2 p-2 bg-amber-50 border border-amber-200 rounded text-sm">
      <ArrowRight className="h-3.5 w-3.5 text-amber-700 mt-0.5 flex-shrink-0" />
      <div className="flex-1">
        <div className="font-medium text-amber-900">{diff.after.omschrijving}</div>
        <div className="text-xs text-amber-700">
          <span className="line-through opacity-70">{diff.before.aantal}× {formatCurrency(diff.before.prijs)}</span>
          <ArrowRight className="inline h-2.5 w-2.5 mx-1" />
          <span className="font-medium">{diff.after.aantal}× {formatCurrency(diff.after.prijs)}</span>
          <span className={`ml-2 ${verschil > 0 ? 'text-green-700' : 'text-red-700'}`}>
            ({verschil >= 0 ? '+' : ''}{formatCurrency(verschil)})
          </span>
        </div>
      </div>
      <span className="text-[10px] uppercase tracking-wider text-amber-700 font-semibold">Aangepast</span>
    </div>
  )
}
