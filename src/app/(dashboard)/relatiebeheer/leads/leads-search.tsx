'use client'

import { useState } from 'react'
import { saveLeadAsRelatie } from '@/lib/actions'
import { Card, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Search, UserPlus, Star, Loader2, MapPin, Phone, Globe, CheckCircle } from 'lucide-react'

interface PlaceResult {
  place_id: string
  name: string
  address: string
  phone: string | null
  website: string | null
  rating: number | null
  reviews: number
  types: string[]
  bron: string
}

export function LeadsSearch() {
  const [query, setQuery] = useState('')
  const [postcode, setPostcode] = useState('')
  const [results, setResults] = useState<PlaceResult[]>([])
  const [searching, setSearching] = useState(false)
  const [saving, setSaving] = useState<string | null>(null)
  const [saved, setSaved] = useState<Set<string>>(new Set())
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  const [straal, setStraal] = useState('10000')
  const [bronnen, setBronnen] = useState<string[]>([])

  async function handleSearch(e: React.FormEvent) {
    e.preventDefault()
    if (!query) return

    setSearching(true)
    setError('')
    setSuccess('')

    try {
      const params = new URLSearchParams({ query })
      if (postcode) {
        params.set('postcode', postcode)
        params.set('radius', straal)
      }

      const res = await fetch(`/api/leads/search?${params}`)
      const data = await res.json()

      if (data.error) {
        setError(data.error)
        setResults([])
      } else {
        setResults(data.results || [])
        setBronnen(data.bronnen || [])
      }
    } catch {
      setError('Zoeken mislukt')
    } finally {
      setSearching(false)
    }
  }

  async function handleSaveLead(place: PlaceResult) {
    setSaving(place.place_id)
    setError('')
    setSuccess('')

    const result = await saveLeadAsRelatie({
      name: place.name,
      address: place.address,
      place_id: place.place_id,
      phone: place.phone || undefined,
      website: place.website || undefined,
    })

    if (result.error) {
      setError(result.error)
    } else {
      setSuccess(`${place.name} opgeslagen als klant`)
      setSaved(prev => new Set(prev).add(place.place_id))
    }
    setSaving(null)
  }

  return (
    <div>
      {success && <div className="bg-green-50 text-green-600 text-sm p-3 rounded-md mb-4">{success}</div>}
      {error && <div className="bg-red-50 text-red-600 text-sm p-3 rounded-md mb-4">{error}</div>}

      <Card className="mb-6">
        <CardContent className="pt-6">
          <form onSubmit={handleSearch} className="flex gap-3">
            <div className="flex-1">
              <Input
                id="query"
                placeholder="Bijv. aannemer, schilder, vastgoedbeheer..."
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                label="Zoekterm / branche"
              />
            </div>
            <div className="w-48">
              <Input
                id="postcode"
                placeholder="Bijv. 1521 of Wormerveer"
                value={postcode}
                onChange={(e) => setPostcode(e.target.value)}
                label="Postcode / plaats"
              />
            </div>
            <div className="w-32">
              <label htmlFor="straal" className="block text-sm font-medium text-gray-700 mb-1.5">Straal</label>
              <select
                id="straal"
                value={straal}
                onChange={(e) => setStraal(e.target.value)}
                className="w-full rounded-md border border-gray-200 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent"
              >
                <option value="10000">10 km</option>
                <option value="25000">25 km</option>
                <option value="50000">50 km</option>
                <option value="100000">100 km</option>
              </select>
            </div>
            <div className="flex items-end">
              <Button type="submit" disabled={searching || !query}>
                {searching ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
                Zoeken
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>

      {results.length > 0 && (
        <>
          {bronnen.length > 0 && (
            <div className="flex items-center gap-2 mb-3 text-xs text-gray-500">
              <span>{results.length} resultaten via {bronnen.join(', ')}</span>
            </div>
          )}
          <Card>
            <CardContent className="p-0">
              <div className="divide-y divide-gray-100">
                {results.map(place => {
                  const isSaved = saved.has(place.place_id)
                  return (
                    <div key={place.place_id} className="px-6 py-4 hover:bg-gray-50 transition-colors">
                      <div className="flex items-start justify-between gap-4">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <p className="text-sm font-semibold text-gray-900">{place.name}</p>
                            <span className="text-[10px] px-1.5 py-0.5 rounded bg-gray-100 text-gray-500 font-medium">{place.bron}</span>
                          </div>
                          <div className="flex items-start gap-1.5 mt-1">
                            <MapPin className="h-3.5 w-3.5 text-gray-400 mt-0.5 flex-shrink-0" />
                            <p className="text-sm text-gray-600">{place.address}</p>
                          </div>
                          <div className="flex items-center gap-4 mt-1.5 flex-wrap">
                            {place.phone && (
                              <a href={`tel:${place.phone}`} className="flex items-center gap-1 text-xs text-primary hover:underline">
                                <Phone className="h-3 w-3" />
                                {place.phone}
                              </a>
                            )}
                            {place.website && (
                              <a href={place.website} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1 text-xs text-primary hover:underline truncate max-w-[200px]">
                                <Globe className="h-3 w-3 flex-shrink-0" />
                                {place.website.replace(/^https?:\/\/(www\.)?/, '').replace(/\/$/, '')}
                              </a>
                            )}
                            {place.rating && (
                              <div className="flex items-center gap-1">
                                <Star className="h-3 w-3 text-yellow-400 fill-yellow-400" />
                                <span className="text-xs text-gray-700">{place.rating}</span>
                                <span className="text-xs text-gray-400">({place.reviews})</span>
                              </div>
                            )}
                          </div>
                        </div>
                        <div className="flex-shrink-0">
                          {isSaved ? (
                            <div className="flex items-center gap-1 text-green-600 text-xs font-medium px-3 py-1.5">
                              <CheckCircle className="h-3.5 w-3.5" />
                              Opgeslagen
                            </div>
                          ) : (
                            <Button
                              size="sm"
                              variant="secondary"
                              onClick={() => handleSaveLead(place)}
                              disabled={saving === place.place_id}
                            >
                              {saving === place.place_id ? (
                                <Loader2 className="h-3 w-3 animate-spin" />
                              ) : (
                                <UserPlus className="h-3 w-3" />
                              )}
                              Opslaan als klant
                            </Button>
                          )}
                        </div>
                      </div>
                    </div>
                  )
                })}
              </div>
            </CardContent>
          </Card>
        </>
      )}

      {!searching && results.length === 0 && !error && (
        <Card>
          <CardContent className="py-12 text-center text-gray-500">
            <Search className="h-8 w-8 mx-auto mb-3 text-gray-300" />
            <p className="text-sm font-medium mb-1">Zoek naar bedrijven en potentiële klanten</p>
            <p className="text-xs text-gray-400">Voer een branche of bedrijfsnaam in samen met een locatie</p>
          </CardContent>
        </Card>
      )}
    </div>
  )
}
