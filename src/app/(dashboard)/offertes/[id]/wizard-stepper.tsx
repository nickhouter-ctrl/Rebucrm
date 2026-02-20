'use client'

import { Check } from 'lucide-react'

const STEPS = [
  { label: 'Klant' },
  { label: 'Project' },
  { label: 'Type' },
  { label: 'Tekeningen' },
  { label: 'Marge' },
  { label: 'Controleren' },
  { label: 'Versturen' },
]

export function WizardStepper({ currentStep }: { currentStep: number }) {
  return (
    <div className="flex items-center justify-between max-w-2xl mx-auto mb-8">
      {STEPS.map((step, i) => (
        <div key={i} className="flex items-center">
          <div className="flex flex-col items-center">
            <div
              className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-medium border-2 transition-colors ${
                i < currentStep
                  ? 'bg-green-500 border-green-500 text-white'
                  : i === currentStep
                    ? 'bg-primary border-primary text-white'
                    : 'border-gray-300 text-gray-400 bg-white'
              }`}
            >
              {i < currentStep ? <Check className="h-4 w-4" /> : i + 1}
            </div>
            <span
              className={`text-xs mt-1.5 hidden sm:block ${
                i <= currentStep ? 'text-gray-900 font-medium' : 'text-gray-400'
              }`}
            >
              {step.label}
            </span>
          </div>
          {i < STEPS.length - 1 && (
            <div
              className={`h-0.5 w-8 md:w-12 mx-1.5 ${
                i < currentStep ? 'bg-green-500' : 'bg-gray-200'
              }`}
            />
          )}
        </div>
      ))}
    </div>
  )
}
