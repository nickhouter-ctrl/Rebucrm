'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { ArrowLeft, ArrowRight, Percent } from 'lucide-react'
import type { ParsedPdfResult } from './stap-tekeningen'

function formatCurrency(amount: number) {
  return new Intl.NumberFormat('nl-NL', { style: 'currency', currency: 'EUR' }).format(amount)
}

export function StapMarge({
  parsedPdfResult,
  margePercentage,
  onMargeChange,
  onNext,
  onSkip,
  onBack,
}: {
  parsedPdfResult: ParsedPdfResult
  margePercentage: number
  onMargeChange: (marge: number) => void
  onNext: (marges: Record<string, number>) => void
  onSkip: () => void
  onBack: () => void
}) {
  const [inputValue, setInputValue] = useState(margePercentage > 0 ? String(margePercentage) : '')
  const [elementMarges, setElementMarges] = useState<Record<string, number>>(() => {
    const initial: Record<string, number> = {}
    parsedPdfResult.elementen.forEach(e => {
      initial[e.naam] = margePercentage
    })
    return initial
  })

  const globalMarge = parseFloat(inputValue) || 0
  const elementSum = parsedPdfResult.elementen.reduce((sum, e) => sum + e.prijs * e.hoeveelheid, 0)
  const inkoopTotaal = elementSum

  // Calculate totals based on per-element marges
  const verkoopTotaal = parsedPdfResult.elementen.reduce((sum, e) => {
    const eMarge = elementMarges[e.naam] ?? globalMarge
    return sum + (e.prijs * (1 + eMarge / 100)) * e.hoeveelheid
  }, 0)
  const margeBedrag = verkoopTotaal - inkoopTotaal

  function handleGlobalMargeChange(value: string) {
    setInputValue(value)
    const newMarge = parseFloat(value) || 0
    onMargeChange(newMarge)
    // Update all element marges to match global
    const updated: Record<string, number> = {}
    parsedPdfResult.elementen.forEach(e => {
      updated[e.naam] = newMarge
    })
    setElementMarges(updated)
  }

  function handleElementMargeChange(naam: string, value: string) {
    const newMarge = parseFloat(value) || 0
    setElementMarges(prev => ({ ...prev, [naam]: newMarge }))
  }

  function handleNext() {
    onMargeChange(globalMarge)
    onNext(elementMarges)
  }

  return (
    <div className="max-w-3xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-xl font-semibold text-gray-900">Marge toevoegen</h2>
          <p className="text-sm text-gray-500 mt-1">
            Voeg optioneel marge toe op de inkoopprijs van de leverancier
          </p>
        </div>
        <Button variant="ghost" onClick={onBack}>
          <ArrowLeft className="h-4 w-4" />
          Terug
        </Button>
      </div>

      {/* Marge input */}
      <div className="bg-white border border-gray-200 rounded-xl p-6 mb-6">
        <div className="flex items-center gap-4 mb-6">
          <div className="flex items-center gap-2 flex-1">
            <label htmlFor="marge" className="text-sm font-medium text-gray-700 whitespace-nowrap">
              Marge percentage (alle elementen)
            </label>
            <div className="relative w-32">
              <input
                id="marge"
                type="number"
                step="0.1"
                min="0"
                max="100"
                value={inputValue}
                onChange={(e) => handleGlobalMargeChange(e.target.value)}
                placeholder="0"
                className="w-full px-3 py-2 pr-8 border border-gray-300 rounded-md text-sm text-right focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent"
              />
              <Percent className="absolute right-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-gray-400" />
            </div>
          </div>
        </div>

        {/* Element tabel */}
        <div className="border border-gray-200 rounded-lg overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-200">
                <th className="text-left px-4 py-2.5 font-medium text-gray-600">Element</th>
                <th className="text-center px-3 py-2.5 font-medium text-gray-600 w-16">Hvh</th>
                <th className="text-right px-4 py-2.5 font-medium text-gray-600">Inkoop/stuk</th>
                <th className="text-center px-3 py-2.5 font-medium text-gray-600 w-24">Marge %</th>
                <th className="text-right px-4 py-2.5 font-medium text-gray-600">Verkoop/stuk</th>
                <th className="text-right px-4 py-2.5 font-medium text-gray-600">Totaal</th>
              </tr>
            </thead>
            <tbody>
              {parsedPdfResult.elementen.map((element, i) => {
                const eMarge = elementMarges[element.naam] ?? globalMarge
                const verkoopPerStuk = element.prijs * (1 + eMarge / 100)
                const totaal = verkoopPerStuk * element.hoeveelheid

                return (
                  <tr key={i} className="border-b border-gray-100 last:border-0">
                    <td className="px-4 py-2.5">
                      <span className="font-medium text-gray-900">{element.naam}</span>
                      {element.type && (
                        <span className="text-gray-500 ml-1.5 text-xs">({element.type})</span>
                      )}
                    </td>
                    <td className="text-center px-3 py-2.5 text-gray-600">{element.hoeveelheid}</td>
                    <td className="text-right px-4 py-2.5 text-gray-600">{formatCurrency(element.prijs)}</td>
                    <td className="text-center px-3 py-2.5">
                      <div className="relative w-20 mx-auto">
                        <input
                          type="number"
                          step="0.1"
                          min="0"
                          max="100"
                          value={eMarge || ''}
                          onChange={(e) => handleElementMargeChange(element.naam, e.target.value)}
                          placeholder="0"
                          className="w-full px-2 py-1 pr-6 border border-gray-300 rounded text-xs text-right focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent"
                        />
                        <Percent className="absolute right-1.5 top-1/2 -translate-y-1/2 h-3 w-3 text-gray-400" />
                      </div>
                    </td>
                    <td className="text-right px-4 py-2.5 font-medium text-gray-900">{formatCurrency(verkoopPerStuk)}</td>
                    <td className="text-right px-4 py-2.5 font-medium text-gray-900">{formatCurrency(totaal)}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>

        {/* Totalen */}
        <div className="mt-4 flex justify-end">
          <div className="w-72 space-y-1.5 text-sm">
            <div className="flex justify-between text-gray-600">
              <span>Inkoop totaal:</span>
              <span>{formatCurrency(inkoopTotaal)}</span>
            </div>
            {margeBedrag > 0 && (
              <div className="flex justify-between text-green-600">
                <span>Marge:</span>
                <span>+{formatCurrency(margeBedrag)}</span>
              </div>
            )}
            <div className="flex justify-between font-bold text-base border-t border-gray-200 pt-1.5">
              <span>Verkoop totaal:</span>
              <span>{formatCurrency(verkoopTotaal)}</span>
            </div>
          </div>
        </div>
      </div>

      <div className="flex items-center justify-between">
        <Button variant="ghost" onClick={onSkip}>
          Overslaan &mdash; geen marge
        </Button>
        <Button onClick={handleNext}>
          Volgende
          <ArrowRight className="h-4 w-4" />
        </Button>
      </div>
    </div>
  )
}
