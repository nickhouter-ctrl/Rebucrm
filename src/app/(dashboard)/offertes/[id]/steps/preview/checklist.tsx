'use client'

import { CheckCircle2, AlertTriangle, Building2, Percent } from 'lucide-react'
import type { ParsedPdfResult, RenderedTekening } from '../stap-tekeningen'

interface ChecklistProps {
  parsedPdfResult: ParsedPdfResult
  renderedTekeningen: RenderedTekening[]
  margePercentage: number
  elementMarges: Record<string, number>
  detectedLeverancierLabel?: string | null
  // Bedragen die de gebruiker (of AI-correcties) heeft ingesteld in de concept-offerte
  conceptBedragen: number[]
  inkoopprijzen: number[]   // alle leverancier-prijzen die we hebben
}

function formatCurrency(amount: number) {
  return new Intl.NumberFormat('nl-NL', { style: 'currency', currency: 'EUR' }).format(amount)
}

// Bovenin de preview: snel-check overzicht met zichtbare/verborgen counts en
// eventuele waarschuwingen (bv. een bedrag in concept dat verdacht veel op een
// leverancier-prijs lijkt — mag nooit naar de klant!)
export function PreviewChecklist({
  parsedPdfResult,
  renderedTekeningen,
  margePercentage,
  elementMarges,
  detectedLeverancierLabel,
  conceptBedragen,
  inkoopprijzen,
}: ChecklistProps) {
  const aantalElementen = parsedPdfResult.elementen.length
  const aantalTekeningen = renderedTekeningen.length
  const aantalSpecs = parsedPdfResult.elementen.filter(e => e.systeem || e.kleur || e.afmetingen).length

  // Verkoopprijs berekening
  const verkoopTotaal = parsedPdfResult.elementen.reduce((sum, e) => {
    const m = elementMarges[e.naam] ?? margePercentage
    return sum + e.prijs * (1 + m / 100) * e.hoeveelheid
  }, 0)
  const inkoopTotaal = parsedPdfResult.elementen.reduce((sum, e) => sum + e.prijs * e.hoeveelheid, 0)

  // Sanity check: leverancier-prijzen die zichtbaar in concept staan
  const inkoopSet = new Set<number>()
  for (const p of inkoopprijzen) {
    if (p > 0) inkoopSet.add(Math.round(p * 100) / 100)
  }
  const verdacht: number[] = []
  for (const b of conceptBedragen) {
    const r = Math.round(b * 100) / 100
    if (inkoopSet.has(r) && Math.abs(b - verkoopTotaal) > 1) {
      verdacht.push(b)
    }
  }

  // Sanity check: marge zorgt voor onlogisch lage of hoge verkoopprijs
  const sanityWarn = verkoopTotaal > 0 && (verkoopTotaal < 50 || verkoopTotaal > 5_000_000)

  // Low-confidence elementen
  const lowConfidence = parsedPdfResult.elementen.filter(e => typeof e.confidence === 'number' && e.confidence < 0.7)

  return (
    <div className="bg-white border border-gray-200 rounded-xl p-4 mb-3">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
        <CheckItem ok={!!detectedLeverancierLabel} icon={<Building2 className="h-4 w-4" />} label="Leverancier" value={detectedLeverancierLabel || 'onbekend'} />
        <CheckItem ok={aantalElementen > 0} label="Elementen" value={`${aantalElementen} gedetecteerd`} sub={`${aantalTekeningen} tekeningen`} />
        <CheckItem ok={aantalSpecs > 0} label="Specs" value={`${aantalSpecs}/${aantalElementen}`} sub="overgenomen" />
        <CheckItem ok={margePercentage > 0} icon={<Percent className="h-4 w-4" />} label="Marge" value={`${margePercentage}%`} sub={`Verkoop ${formatCurrency(verkoopTotaal)}`} />
      </div>

      {/* Subtiel: inkoop ↔ verkoop */}
      <div className="mt-2 pt-2 border-t border-gray-100 flex items-center justify-between text-xs text-gray-500">
        <span>Inkoop totaal: {formatCurrency(inkoopTotaal)}</span>
        <span>Marge bedrag: <span className={inkoopTotaal > 0 ? 'text-green-600' : ''}>+{formatCurrency(verkoopTotaal - inkoopTotaal)}</span></span>
        <span>Verkoop totaal: <strong className="text-gray-900">{formatCurrency(verkoopTotaal)}</strong></span>
      </div>

      {/* Waarschuwingen */}
      {(verdacht.length > 0 || sanityWarn || lowConfidence.length > 0) && (
        <div className="mt-3 space-y-2">
          {lowConfidence.length > 0 && (
            <div className="flex items-start gap-2 p-2 bg-amber-50 border border-amber-200 rounded-md text-sm text-amber-800">
              <AlertTriangle className="h-4 w-4 flex-shrink-0 mt-0.5" />
              <div>
                <strong>{lowConfidence.length} element{lowConfidence.length > 1 ? 'en' : ''} met lage AI-zekerheid:</strong>{' '}
                {lowConfidence.slice(0, 5).map(e => e.naam).join(', ')}
                {lowConfidence.length > 5 && ` (+${lowConfidence.length - 5} meer)`}
                {' '}— controleer prijs en hoeveelheid extra zorgvuldig.
              </div>
            </div>
          )}
          {verdacht.length > 0 && (
            <div className="flex items-start gap-2 p-2 bg-red-50 border border-red-200 rounded-md text-sm text-red-800">
              <AlertTriangle className="h-4 w-4 flex-shrink-0 mt-0.5" />
              <div>
                <strong>Mogelijke leverancier-prijs zichtbaar:</strong> de bedragen{' '}
                {verdacht.slice(0, 3).map(v => formatCurrency(v)).join(', ')}
                {verdacht.length > 3 && ` (+${verdacht.length - 3} meer)`}
                {' '}staan in de concept-offerte maar matchen exact met inkoopprijzen. Dit moet weg vóór versturen.
              </div>
            </div>
          )}
          {sanityWarn && (
            <div className="flex items-start gap-2 p-2 bg-amber-50 border border-amber-200 rounded-md text-sm text-amber-800">
              <AlertTriangle className="h-4 w-4 flex-shrink-0 mt-0.5" />
              <div>
                Verkoop totaal van <strong>{formatCurrency(verkoopTotaal)}</strong> lijkt onlogisch — controleer marge en hoeveelheden.
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

function CheckItem({ ok, icon, label, value, sub }: { ok: boolean; icon?: React.ReactNode; label: string; value: string; sub?: string }) {
  return (
    <div className="flex items-start gap-2">
      <div className={`mt-0.5 ${ok ? 'text-green-600' : 'text-gray-300'}`}>
        {ok ? <CheckCircle2 className="h-4 w-4" /> : (icon ?? <CheckCircle2 className="h-4 w-4" />)}
      </div>
      <div className="min-w-0">
        <div className="text-[11px] uppercase tracking-wide text-gray-500">{label}</div>
        <div className="font-medium text-gray-900 truncate">{value}</div>
        {sub && <div className="text-xs text-gray-500 truncate">{sub}</div>}
      </div>
    </div>
  )
}
