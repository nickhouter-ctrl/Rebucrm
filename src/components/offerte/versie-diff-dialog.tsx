'use client'

import { useEffect, useState } from 'react'
import { getOfferteVersies } from '@/lib/actions'
import { Dialog } from '@/components/ui/dialog'
import { VersieDiff } from './versie-diff'
import { Loader2, History } from 'lucide-react'

interface Versie {
  id: string
  offertenummer: string
  datum: string
  versie_nummer: number
  status: string
  totaal: number
  subtotaal: number
  regels: Array<{ omschrijving: string; aantal: number; prijs: number; btw_percentage: number }>
}

// Dialog die alle versies van een offerte toont met dropdown om er 2 te
// vergelijken via VersieDiff component.
export function VersieDiffDialog({ offerteId, open, onClose }: {
  offerteId: string
  open: boolean
  onClose: () => void
}) {
  const [versies, setVersies] = useState<Versie[]>([])
  const [loading, setLoading] = useState(false)
  const [linksId, setLinksId] = useState<string>('')
  const [rechtsId, setRechtsId] = useState<string>('')

  useEffect(() => {
    if (!open) return
    setLoading(true)
    getOfferteVersies(offerteId).then(data => {
      const lijst = (data as Versie[]) || []
      setVersies(lijst)
      // Default: vergelijk laatste 2
      if (lijst.length >= 2) {
        setLinksId(lijst[lijst.length - 2].id)
        setRechtsId(lijst[lijst.length - 1].id)
      } else if (lijst.length === 1) {
        setLinksId(lijst[0].id)
        setRechtsId(lijst[0].id)
      }
      setLoading(false)
    }).catch(() => setLoading(false))
  }, [offerteId, open])

  const links = versies.find(v => v.id === linksId)
  const rechts = versies.find(v => v.id === rechtsId)

  return (
    <Dialog open={open} onClose={onClose} title="Versies vergelijken" className="max-w-3xl">
      {loading && (
        <div className="flex items-center justify-center py-12 text-gray-500">
          <Loader2 className="h-5 w-5 animate-spin mr-2" />
          Versies laden...
        </div>
      )}
      {!loading && versies.length < 2 && (
        <div className="text-center py-8 text-gray-500 text-sm">
          <History className="h-8 w-8 text-gray-300 mx-auto mb-2" />
          Deze offerte heeft maar één versie. Maak een nieuwe versie aan om te kunnen vergelijken.
        </div>
      )}
      {!loading && versies.length >= 2 && (
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Vorige versie</label>
              <select
                value={linksId}
                onChange={(e) => setLinksId(e.target.value)}
                className="w-full px-2 py-1.5 text-sm border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-primary"
              >
                {versies.map(v => (
                  <option key={v.id} value={v.id}>v{v.versie_nummer} — {v.datum} ({v.status})</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Nieuwe versie</label>
              <select
                value={rechtsId}
                onChange={(e) => setRechtsId(e.target.value)}
                className="w-full px-2 py-1.5 text-sm border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-primary"
              >
                {versies.map(v => (
                  <option key={v.id} value={v.id}>v{v.versie_nummer} — {v.datum} ({v.status})</option>
                ))}
              </select>
            </div>
          </div>

          {links && rechts && linksId !== rechtsId && (
            <VersieDiff
              links={{
                versie_nummer: links.versie_nummer,
                totaal: links.totaal,
                regels: links.regels,
                datum: links.datum,
              }}
              rechts={{
                versie_nummer: rechts.versie_nummer,
                totaal: rechts.totaal,
                regels: rechts.regels,
                datum: rechts.datum,
              }}
            />
          )}
          {linksId === rechtsId && (
            <div className="text-center py-4 text-gray-400 text-sm italic">
              Kies twee verschillende versies om te vergelijken.
            </div>
          )}
        </div>
      )}
    </Dialog>
  )
}
