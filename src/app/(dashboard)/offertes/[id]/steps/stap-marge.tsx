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
  onNext: () => void
  onSkip: () => void
  onBack: () => void
}) {
  const [inputValue, setInputValue] = useState(margePercentage > 0 ? String(margePercentage) : '')

  const marge = parseFloat(inputValue) || 0
  const elementSum = parsedPdfResult.elementen.reduce((sum, e) => sum + e.prijs * e.hoeveelheid, 0)
  const inkoopTotaal = parsedPdfResult.totaal > 0 ? parsedPdfResult.totaal : elementSum
  const margeBedrag = inkoopTotaal * (marge / 100)
  const verkoopTotaal = inkoopTotaal + margeBedrag

  function handleMargeChange(value: string) {
    setInputValue(value)
    onMargeChange(parseFloat(value) || 0)
  }

  function handleNext() {
    onMargeChange(marge)
    onNext()
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
              Marge percentage
            </label>
            <div className="relative w-32">
              <input
                id="marge"
                type="number"
                step="0.1"
                min="0"
                max="100"
                value={inputValue}
                onChange={(e) => handleMargeChange(e.target.value)}
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
                {marge > 0 && (
                  <>
                    <th className="text-right px-4 py-2.5 font-medium text-gray-600">Marge</th>
                    <th className="text-right px-4 py-2.5 font-medium text-gray-600">Verkoop/stuk</th>
                  </>
                )}
                <th className="text-right px-4 py-2.5 font-medium text-gray-600">Totaal</th>
              </tr>
            </thead>
            <tbody>
              {parsedPdfResult.elementen.map((element, i) => {
                const elementMarge = element.prijs * (marge / 100)
                const verkoopPerStuk = element.prijs + elementMarge
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
                    {marge > 0 && (
                      <>
                        <td className="text-right px-4 py-2.5 text-green-600">+{formatCurrency(elementMarge)}</td>
                        <td className="text-right px-4 py-2.5 font-medium text-gray-900">{formatCurrency(verkoopPerStuk)}</td>
                      </>
                    )}
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
            {marge > 0 && (
              <div className="flex justify-between text-green-600">
                <span>Marge ({marge}%):</span>
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
