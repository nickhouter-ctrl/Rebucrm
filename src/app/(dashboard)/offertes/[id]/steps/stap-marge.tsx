'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { ArrowLeft, ArrowRight, Percent, Info } from 'lucide-react'

// Marge-stap staat NU vóór de PDF-upload. Gebruiker geeft globale marge op
// die straks op de leveranciersprijzen wordt toegepast. Per-element marge kan
// later in de Controleren-stap nog aangepast worden.
export function StapMarge({
  margePercentage,
  defaultMarge,
  onMargeChange,
  onNext,
  onSkip,
  onBack,
}: {
  margePercentage: number
  defaultMarge?: number | null
  onMargeChange: (marge: number) => void
  onNext: () => void
  onSkip: () => void
  onBack: () => void
}) {
  const [inputValue, setInputValue] = useState(margePercentage > 0 ? String(margePercentage) : '')

  function handleMargeChange(value: string) {
    setInputValue(value)
    const newMarge = parseFloat(value) || 0
    onMargeChange(newMarge)
  }

  function handleNext() {
    const m = parseFloat(inputValue) || 0
    onMargeChange(m)
    onNext()
  }

  function applyDefault() {
    if (defaultMarge != null) {
      setInputValue(String(defaultMarge))
      onMargeChange(defaultMarge)
    }
  }

  return (
    <div className="max-w-2xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-xl font-semibold text-gray-900">Marge bepalen</h2>
          <p className="text-sm text-gray-500 mt-1">
            Bepaal welke marge u op de leveranciersprijzen wilt zetten. Per element nog aanpassen kan later bij Controleren.
          </p>
        </div>
        <Button variant="ghost" onClick={onBack}>
          <ArrowLeft className="h-4 w-4" />
          Terug
        </Button>
      </div>

      <div className="bg-white border border-gray-200 rounded-xl p-6 mb-4">
        <label htmlFor="marge" className="block text-sm font-medium text-gray-700 mb-2">
          Marge percentage
        </label>
        <div className="relative max-w-[200px]">
          <input
            id="marge"
            type="number"
            step="0.1"
            min="0"
            max="500"
            value={inputValue}
            onChange={(e) => handleMargeChange(e.target.value)}
            placeholder="0"
            className="w-full px-4 py-3 pr-10 border border-gray-300 rounded-lg text-lg text-right focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent"
          />
          <Percent className="absolute right-3 top-1/2 -translate-y-1/2 h-5 w-5 text-gray-400" />
        </div>

        {defaultMarge != null && defaultMarge > 0 && parseFloat(inputValue) !== defaultMarge && (
          <button
            type="button"
            onClick={applyDefault}
            className="mt-3 text-xs text-primary hover:underline flex items-center gap-1"
          >
            <Info className="h-3 w-3" />
            Standaard marge van deze relatie: {defaultMarge}% — toepassen
          </button>
        )}

        <div className="mt-4 p-3 bg-blue-50 border border-blue-200 rounded-md flex items-start gap-2 text-sm">
          <Info className="h-4 w-4 text-blue-600 flex-shrink-0 mt-0.5" />
          <div className="text-blue-800">
            Deze marge wordt straks toegepast op alle elementen uit de leveranciersofferte.
            Bij Controleren kunt u per element nog een afwijkende marge instellen.
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
