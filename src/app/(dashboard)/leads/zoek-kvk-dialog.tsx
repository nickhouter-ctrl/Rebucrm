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

const SBI_OPTIES = [
  { value: '', label: '— Alle sectoren —' },
  { value: '41', label: 'Algemene burgerlijke & utiliteitsbouw (41)' },
  { value: '4120', label: 'Algemene bouwkundige aannemers (4120)' },
  { value: '43', label: 'Gespecialiseerde bouw (43)' },
  { value: '4332', label: 'Timmerwerk / kozijnen plaatsen (4332)' },
  { value: '4391', label: 'Dakbedekking & bouw dakconstructies (4391)' },
  { value: '4399', label: 'Overige gespecialiseerde bouw (4399)' },
  { value: '42', label: 'Grond-, water- en wegenbouw (42)' },
  { value: '2222', label: 'Kunststof bouwmaterialen (2222)' },
  { value: '2314', label: 'Vlakglas bewerking (2314)' },
]

export function ZoekKvkDialog({ open, onClose, onImported }: { open: boolean; onClose: () => void; onImported: (aantal: number) => void }) {
  const [sbi, setSbi] = useState('4120')
  const [plaats, setPlaats] = useState('')
  const [naam, setNaam] = useState('')
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
      if (sbi) params.set('sbi', sbi)
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

        {/* Zoekvorm */}
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
          <div className="col-span-2">
            <Select id="sbi" label="Sector (SBI-code)" value={sbi} onChange={e => setSbi((e.target as HTMLSelectElement).value)} options={SBI_OPTIES} />
          </div>
          <Input id="naam" label="Naam bevat (optioneel)" value={naam} onChange={e => setNaam(e.target.value)} placeholder="bijv. bouw" />
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
