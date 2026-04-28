'use client'

import { PageHeader } from '@/components/ui/page-header'
import { Sparkles, CheckCircle2, AlertTriangle, Building2, Wand2 } from 'lucide-react'

interface Stat {
  naam: string
  display_naam: string
  profielen: string[] | null
  parser_key: string
  added_by_user: boolean
  detect_count: number
  validated_count: number
  detecties_total: number
  bevestigd: number
  gecorrigeerd: number
  gemiddelde_confidence: number
  prijs_correcties: number
  wis_template_validated: boolean
  wis_template_usage: number
}

// AI feedback dashboard per leverancier — laat zien hoe goed AI presteert
// en waar nog handmatige correctie nodig is.
export function LeverancierStatsView({ stats }: { stats: Stat[] }) {
  return (
    <div>
      <PageHeader
        title="Leveranciers — AI prestaties"
        description="Hoe goed herkent en parsed de AI elke leverancier? Per leverancier: detectie-zekerheid, hoeveel correcties, en of er een wis-template is geleerd."
      />

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
        {stats.map(s => {
          const accuracy = s.detecties_total > 0
            ? (s.bevestigd / s.detecties_total) * 100
            : null
          const confidencePct = s.gemiddelde_confidence ? Math.round(s.gemiddelde_confidence * 100) : null
          return (
            <div key={s.naam} className="bg-white border border-gray-200 rounded-lg p-3">
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2">
                  <Building2 className="h-4 w-4 text-gray-500" />
                  <h3 className="font-semibold text-gray-900">{s.display_naam}</h3>
                  {s.added_by_user && <span className="text-[10px] bg-blue-100 text-blue-700 px-1.5 py-0.5 rounded">door gebruiker toegevoegd</span>}
                </div>
                {confidencePct !== null && (
                  <span className={`text-[11px] font-medium ${confidencePct >= 90 ? 'text-green-700' : confidencePct >= 70 ? 'text-amber-600' : 'text-red-600'}`}>
                    {confidencePct}% zekerheid
                  </span>
                )}
              </div>

              {s.profielen && s.profielen.length > 0 && (
                <div className="text-xs text-gray-500 mb-2">
                  Profielen: {s.profielen.join(', ')}
                </div>
              )}

              <div className="grid grid-cols-2 gap-2 text-xs">
                <div className="bg-gray-50 rounded p-2">
                  <div className="text-gray-500">Gedetecteerd</div>
                  <div className="font-semibold text-gray-900">{s.detect_count}×</div>
                </div>
                <div className="bg-gray-50 rounded p-2">
                  <div className="text-gray-500">Bevestigd</div>
                  <div className="font-semibold text-gray-900">{s.validated_count}×</div>
                </div>
              </div>

              {accuracy !== null && s.detecties_total > 0 && (
                <div className="mt-2">
                  <div className="flex items-center justify-between text-[11px] mb-0.5">
                    <span className="text-gray-500">Detectie nauwkeurigheid</span>
                    <span className="font-medium text-gray-900">{Math.round(accuracy)}%</span>
                  </div>
                  <div className="h-1.5 bg-gray-100 rounded overflow-hidden">
                    <div
                      className={accuracy >= 90 ? 'bg-green-500 h-full' : accuracy >= 70 ? 'bg-amber-500 h-full' : 'bg-red-500 h-full'}
                      style={{ width: `${accuracy}%` }}
                    />
                  </div>
                </div>
              )}

              <div className="mt-3 pt-2 border-t border-gray-100 space-y-1 text-xs">
                <div className="flex items-center gap-1.5 text-gray-600">
                  {s.wis_template_validated ? (
                    <Sparkles className="h-3 w-3 text-blue-500" />
                  ) : (
                    <Sparkles className="h-3 w-3 text-gray-300" />
                  )}
                  <span>Wis-template: {s.wis_template_validated ? `geleerd (${s.wis_template_usage}× gebruikt)` : 'nog niet geleerd'}</span>
                </div>
                <div className="flex items-center gap-1.5 text-gray-600">
                  {s.prijs_correcties > 0 ? (
                    <Wand2 className="h-3 w-3 text-amber-500" />
                  ) : (
                    <CheckCircle2 className="h-3 w-3 text-green-500" />
                  )}
                  <span>{s.prijs_correcties} handmatige prijs-correcties{s.prijs_correcties > 5 ? ' — vaak' : ''}</span>
                </div>
                {s.gecorrigeerd > 0 && (
                  <div className="flex items-center gap-1.5 text-amber-700">
                    <AlertTriangle className="h-3 w-3" />
                    <span>{s.gecorrigeerd}× door gebruiker gecorrigeerd naar andere leverancier</span>
                  </div>
                )}
              </div>
            </div>
          )
        })}
      </div>

      {stats.length === 0 && (
        <div className="text-center py-12 text-gray-500 text-sm">
          Nog geen leveranciers met statistieken — verwerk eerst een offerte zodat AI feedback krijgt.
        </div>
      )}
    </div>
  )
}
