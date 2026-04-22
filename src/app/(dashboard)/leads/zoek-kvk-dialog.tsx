'use client'

import { useState } from 'react'
import { Dialog } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Select } from '@/components/ui/select'
import { Button } from '@/components/ui/button'
import { Loader2, Search, Check } from 'lucide-react'
import { bulkCreateLeadsFromKvk } from '@/lib/actions'

interface Kandidaat {
  kvkNummer: string
  naam: string
  adres: string
  postcode: string
  plaats: string
  afstandKm?: number
  email?: string
  telefoon?: string
}

// KVK-zoek API filtert alleen op naam/plaats. Voor sector = keyword in naam
const SECTOR_PRESETS: { value: string; label: string }[] = [
  { value: 'bouw', label: 'Bouw' },
  { value: 'aannemer', label: 'Aannemers' },
  { value: 'timmerwerk', label: 'Timmerwerk' },
  { value: 'kozijn', label: 'Kozijnen' },
  { value: 'dakbedekking', label: 'Dakbedekking' },
  { value: 'renovatie', label: 'Renovatie' },
  { value: 'bouwbedrijf', label: 'Bouwbedrijf' },
]

export function ZoekKvkDialog({ open, onClose, onImported }: { open: boolean; onClose: () => void; onImported: (aantal: number) => void }) {
  const [plaats, setPlaats] = useState('')
  const [naam, setNaam] = useState('bouwbedrijf')
  const [radius, setRadius] = useState('0')
  const [max, setMax] = useState('100')
  const [zoeken, setZoeken] = useState(false)
  const [resultaten, setResultaten] = useState<Kandidaat[]>([])
  const [geselecteerd, setGeselecteerd] = useState<Set<string>>(new Set())
  const [error, setError] = useState('')
  const [importerend, setImporterend] = useState(false)
  const [aantalGevonden, setAantalGevonden] = useState<number | null>(null)

  async function handleZoek() {
    setZoeken(true); setError(''); setResultaten([]); setGeselecteerd(new Set()); setAantalGevonden(null)
    try {
      const params = new URLSearchParams()
      if (plaats) params.set('plaats', plaats)
      if (naam) params.set('naam', naam)
      if (radius) params.set('radius', radius)
      if (max) params.set('max', max)
      const res = await fetch(`/api/kvk/zoek-leads?${params}`)
      const data = await res.json()
      if (data.error) { setError(data.error); return }
      setResultaten(data.resultaten || [])
      setAantalGevonden(data.aantalGevonden ?? null)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Zoeken mislukt')
    } finally {
      setZoeken(false)
    }
  }

  function toggleAll() {
    if (geselecteerd.size === resultaten.length) setGeselecteerd(new Set())
    else setGeselecteerd(new Set(resultaten.map(r => r.kvkNummer)))
  }

  function toggle(nr: string) {
    setGeselecteerd(prev => { const s = new Set(prev); if (s.has(nr)) s.delete(nr); else s.add(nr); return s })
  }

  async function handleImport() {
    if (geselecteerd.size === 0) return
    setImporterend(true); setError('')
    try {
      const te = resultaten.filter(r => geselecteerd.has(r.kvkNummer))
      const result = await bulkCreateLeadsFromKvk(te)
      if (result.error) { setError(result.error); return }
      onImported(result.ingevoegd || 0)
      onClose()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Importeren mislukt')
    } finally {
      setImporterend(false)
    }
  }

  return (
    <Dialog open={open} onClose={onClose} title="Leads zoeken in KVK" className="max-w-4xl">
      <div className="space-y-4">
        {error && <p className="text-sm text-red-600 bg-red-50 p-2 rounded">{error}</p>}

        {/* Sector presets */}
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">Snelle sector-keuze (vult naam-veld in)</label>
          <div className="flex flex-wrap gap-1.5">
            {SECTOR_PRESETS.map(s => (
              <button
                key={s.value}
                type="button"
                onClick={() => setNaam(s.value)}
                className={`px-3 py-1 rounded-full text-xs font-medium border transition-colors ${naam === s.value ? 'bg-[#00a66e] text-white border-[#00a66e]' : 'bg-white text-gray-700 border-gray-200 hover:border-gray-300'}`}
              >
                {s.label}
              </button>
            ))}
          </div>
        </div>

        {/* Zoekvorm */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <Input id="naam" label="Naam bevat" value={naam} onChange={e => setNaam(e.target.value)} placeholder="bijv. bouwbedrijf" />
          <Input id="plaats" label="Plaats (optioneel)" value={plaats} onChange={e => setPlaats(e.target.value)} placeholder="bijv. Zaandam" />
          <Select id="radius" label="Straal vanaf Wormerveer" value={radius} onChange={e => setRadius((e.target as HTMLSelectElement).value)} options={[
            { value: '0', label: 'Geen (heel NL)' },
            { value: '10', label: '10 km' },
            { value: '25', label: '25 km' },
            { value: '50', label: '50 km' },
            { value: '100', label: '100 km' },
          ]} />
        </div>

        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Select id="max" label="" value={max} onChange={e => setMax((e.target as HTMLSelectElement).value)} options={[
              { value: '50', label: 'Max 50' },
              { value: '100', label: 'Max 100' },
              { value: '250', label: 'Max 250' },
              { value: '500', label: 'Max 500' },
            ]} />
          </div>
          <Button onClick={handleZoek} disabled={zoeken}>
            {zoeken ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
            Zoeken
          </Button>
        </div>

        {/* Resultaten */}
        {aantalGevonden !== null && (
          <div className="text-xs text-gray-500">
            {aantalGevonden} gevonden in KVK · {resultaten.length} nieuwe (al bestaande in CRM uitgefilterd)
          </div>
        )}

        {resultaten.length > 0 && (
          <div className="border border-gray-200 rounded-md overflow-hidden">
            <div className="flex items-center justify-between px-3 py-2 bg-gray-50 border-b border-gray-200 sticky top-0">
              <label className="flex items-center gap-2 text-sm font-medium">
                <input type="checkbox" checked={geselecteerd.size === resultaten.length} onChange={toggleAll} className="h-4 w-4 rounded border-gray-300 text-[#00a66e]" />
                Alles selecteren ({geselecteerd.size}/{resultaten.length})
              </label>
            </div>
            <div className="max-h-96 overflow-y-auto">
              {resultaten.map(r => (
                <label key={r.kvkNummer} className={`flex items-start gap-2 px-3 py-2 border-b border-gray-100 last:border-0 cursor-pointer hover:bg-gray-50 ${geselecteerd.has(r.kvkNummer) ? 'bg-blue-50/40' : ''}`}>
                  <input type="checkbox" checked={geselecteerd.has(r.kvkNummer)} onChange={() => toggle(r.kvkNummer)} className="mt-1 h-4 w-4 rounded border-gray-300 text-[#00a66e]" />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-gray-900 truncate">{r.naam}</p>
                    <p className="text-xs text-gray-500 truncate">
                      KVK {r.kvkNummer}{r.adres ? ` · ${r.adres}` : ''}{r.postcode ? `, ${r.postcode}` : ''}{r.plaats ? ` ${r.plaats}` : ''}
                      {typeof r.afstandKm === 'number' && <span className="ml-2 inline-flex items-center px-1.5 py-0.5 rounded bg-gray-100 text-gray-600 text-[10px]">{r.afstandKm} km</span>}
                    </p>
                  </div>
                </label>
              ))}
            </div>
          </div>
        )}

        <div className="flex items-center justify-end gap-2 pt-2 border-t border-gray-100">
          <Button variant="secondary" onClick={onClose} disabled={importerend}>Annuleren</Button>
          <Button onClick={handleImport} disabled={importerend || geselecteerd.size === 0}>
            {importerend ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
            {geselecteerd.size > 0 ? `Toevoegen (${geselecteerd.size})` : 'Toevoegen'}
          </Button>
        </div>
      </div>
    </Dialog>
  )
}
