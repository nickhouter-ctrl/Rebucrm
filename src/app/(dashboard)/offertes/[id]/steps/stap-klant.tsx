'use client'

import { useState } from 'react'
import { createRelatieInline } from '@/lib/actions'
import { Card, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Search, UserPlus, ArrowLeft } from 'lucide-react'
import { KvkSearch } from '@/components/kvk-search'

interface RelatieData {
  id: string
  bedrijfsnaam: string
  contactpersoon?: string | null
  email?: string | null
  telefoon?: string | null
  plaats?: string | null
}

export function StapKlant({
  relaties: initialRelaties,
  onSelectRelatie,
  onBack,
}: {
  relaties: RelatieData[]
  onSelectRelatie: (id: string, naam: string) => void
  onBack: () => void
}) {
  const [searchQuery, setSearchQuery] = useState('')
  const [showNewRelatie, setShowNewRelatie] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [relatiesList, setRelatiesList] = useState(initialRelaties)
  const [nieuwRelatieData, setNieuwRelatieData] = useState({
    bedrijfsnaam: '', contactpersoon: '', email: '', telefoon: '', adres: '', postcode: '', plaats: '',
  })

  const filteredRelaties = relatiesList.filter(r =>
    r.bedrijfsnaam.toLowerCase().includes(searchQuery.toLowerCase()) ||
    (r.contactpersoon && r.contactpersoon.toLowerCase().includes(searchQuery.toLowerCase())) ||
    (r.plaats && r.plaats.toLowerCase().includes(searchQuery.toLowerCase()))
  )

  async function handleNieuweRelatie() {
    if (!nieuwRelatieData.bedrijfsnaam) return
    setLoading(true)
    const result = await createRelatieInline(nieuwRelatieData)
    if (result.error) {
      setError(result.error)
      setLoading(false)
      return
    }
    const newRelatie = { id: result.id!, bedrijfsnaam: result.bedrijfsnaam!, contactpersoon: nieuwRelatieData.contactpersoon || null, email: nieuwRelatieData.email || null, telefoon: nieuwRelatieData.telefoon || null, plaats: nieuwRelatieData.plaats || null }
    setRelatiesList(prev => [...prev, newRelatie])
    setShowNewRelatie(false)
    setLoading(false)
    onSelectRelatie(result.id!, result.bedrijfsnaam!)
  }

  return (
    <div className="max-w-3xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-xl font-semibold text-gray-900">Selecteer klant</h2>
          <p className="text-sm text-gray-500 mt-1">Kies een bestaande klant of maak een nieuwe aan</p>
        </div>
        <Button variant="ghost" onClick={onBack}>
          <ArrowLeft className="h-4 w-4" />
          Terug
        </Button>
      </div>

      {error && <div className="bg-red-50 text-red-600 text-sm p-3 rounded-md mb-4">{error}</div>}

      <div className="flex items-center gap-3 mb-4">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
          <input
            type="text"
            placeholder="Zoek klant op naam, contactpersoon of plaats..."
            className="w-full pl-10 pr-4 py-2.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent"
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            autoFocus
          />
        </div>
        <Button variant="secondary" onClick={() => setShowNewRelatie(true)}>
          <UserPlus className="h-4 w-4" />
          Nieuwe klant
        </Button>
      </div>

      {showNewRelatie && (
        <Card className="mb-4">
          <CardContent className="pt-6 space-y-3">
            <h3 className="font-semibold text-gray-900 mb-2">Nieuwe klant aanmaken</h3>
            <KvkSearch
              label="Zoek in KVK-register (optioneel)"
              onSelect={r => setNieuwRelatieData(d => ({ ...d, bedrijfsnaam: r.naam, adres: r.adres, postcode: r.postcode, plaats: r.plaats }))}
            />
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <Input id="n_bedrijfsnaam" label="Naam / Bedrijfsnaam *" value={nieuwRelatieData.bedrijfsnaam} onChange={e => setNieuwRelatieData(d => ({ ...d, bedrijfsnaam: e.target.value }))} required />
              <Input id="n_contactpersoon" label="Contactpersoon" value={nieuwRelatieData.contactpersoon} onChange={e => setNieuwRelatieData(d => ({ ...d, contactpersoon: e.target.value }))} />
              <Input id="n_email" label="E-mail" type="email" value={nieuwRelatieData.email} onChange={e => setNieuwRelatieData(d => ({ ...d, email: e.target.value }))} />
              <Input id="n_telefoon" label="Telefoon" value={nieuwRelatieData.telefoon} onChange={e => setNieuwRelatieData(d => ({ ...d, telefoon: e.target.value }))} />
              <Input id="n_adres" label="Adres" value={nieuwRelatieData.adres} onChange={e => setNieuwRelatieData(d => ({ ...d, adres: e.target.value }))} />
              <div className="grid grid-cols-2 gap-2">
                <Input id="n_postcode" label="Postcode" value={nieuwRelatieData.postcode} onChange={e => setNieuwRelatieData(d => ({ ...d, postcode: e.target.value }))} />
                <Input id="n_plaats" label="Plaats" value={nieuwRelatieData.plaats} onChange={e => setNieuwRelatieData(d => ({ ...d, plaats: e.target.value }))} />
              </div>
            </div>
            <div className="flex gap-2 justify-end pt-2">
              <Button variant="ghost" onClick={() => setShowNewRelatie(false)}>Annuleren</Button>
              <Button onClick={handleNieuweRelatie} disabled={loading || !nieuwRelatieData.bedrijfsnaam}>
                {loading ? 'Aanmaken...' : 'Aanmaken & selecteren'}
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      <div className="space-y-2">
        {filteredRelaties.length === 0 ? (
          <div className="text-center py-8 text-gray-500 text-sm">
            {searchQuery ? 'Geen klanten gevonden' : 'Nog geen klanten'}
          </div>
        ) : (
          filteredRelaties.map(r => (
            <button
              key={r.id}
              onClick={() => onSelectRelatie(r.id, r.bedrijfsnaam)}
              className="w-full text-left p-4 rounded-lg border border-gray-200 hover:border-primary hover:bg-blue-50/50 transition-all flex items-center justify-between group"
            >
              <div>
                <p className="font-medium text-gray-900">{r.bedrijfsnaam}</p>
                <p className="text-sm text-gray-500">
                  {[r.contactpersoon, r.email, r.plaats].filter(Boolean).join(' \u00B7 ')}
                </p>
              </div>
              <ArrowLeft className="h-4 w-4 text-gray-400 group-hover:text-primary rotate-180" />
            </button>
          ))
        )}
      </div>
    </div>
  )
}
