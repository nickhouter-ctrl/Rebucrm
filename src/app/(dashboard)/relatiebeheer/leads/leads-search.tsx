'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { saveLeadAsRelatie } from '@/lib/actions'
import { PageHeader } from '@/components/ui/page-header'
import { Card, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { ArrowLeft, Search, UserPlus, Star, Loader2, MapPin } from 'lucide-react'

interface PlaceResult {
  place_id: string
  name: string
  address: string
  rating: number | null
  reviews: number
  types: string[]
  business_status: string | null
}

export function LeadsSearch() {
  const router = useRouter()
  const [query, setQuery] = useState('')
  const [postcode, setPostcode] = useState('')
  const [results, setResults] = useState<PlaceResult[]>([])
  const [searching, setSearching] = useState(false)
  const [saving, setSaving] = useState<string | null>(null)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')

  async function handleSearch(e: React.FormEvent) {
    e.preventDefault()
    if (!query) return

    setSearching(true)
    setError('')
    setSuccess('')

    try {
      const params = new URLSearchParams({ query })
      if (postcode) params.set('postcode', postcode)

      const res = await fetch(`/api/leads/search?${params}`)
      const data = await res.json()

      if (data.error) {
        setError(data.error)
        setResults([])
      } else {
        setResults(data.results || [])
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
    })

    if (result.error) {
      setError(result.error)
    } else {
      setSuccess(`${place.name} opgeslagen als lead`)
    }
    setSaving(null)
  }

  return (
    <div>
      <PageHeader
        title="Leads zoeken"
        description="Zoek potentiele klanten via Google Places"
        actions={
          <Button variant="ghost" onClick={() => router.push('/relatiebeheer')}>
            <ArrowLeft className="h-4 w-4" />
            Terug
          </Button>
        }
      />

      {success && <div className="bg-green-50 text-green-600 text-sm p-3 rounded-md mb-4">{success}</div>}
      {error && <div className="bg-red-50 text-red-600 text-sm p-3 rounded-md mb-4">{error}</div>}

      <Card className="mb-6">
        <CardContent className="pt-6">
          <form onSubmit={handleSearch} className="flex gap-3">
            <div className="flex-1">
              <Input
                id="query"
                placeholder="Bijv. aannemer, kozijnen, schilder..."
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
        <Card>
          <CardContent className="p-0">
            <table className="w-full">
              <thead>
                <tr className="border-b border-gray-200 bg-gray-50">
                  <th className="text-left text-xs font-medium text-gray-500 uppercase px-6 py-3">Bedrijf</th>
                  <th className="text-left text-xs font-medium text-gray-500 uppercase px-6 py-3">Adres</th>
                  <th className="text-left text-xs font-medium text-gray-500 uppercase px-6 py-3">Beoordeling</th>
                  <th className="text-right text-xs font-medium text-gray-500 uppercase px-6 py-3">Actie</th>
                </tr>
              </thead>
              <tbody>
                {results.map(place => (
                  <tr key={place.place_id} className="border-b border-gray-100 hover:bg-gray-50">
                    <td className="px-6 py-3">
                      <p className="text-sm font-medium text-gray-900">{place.name}</p>
                    </td>
                    <td className="px-6 py-3">
                      <div className="flex items-start gap-1.5">
                        <MapPin className="h-3.5 w-3.5 text-gray-400 mt-0.5 flex-shrink-0" />
                        <p className="text-sm text-gray-600">{place.address}</p>
                      </div>
                    </td>
                    <td className="px-6 py-3">
                      {place.rating ? (
                        <div className="flex items-center gap-1">
                          <Star className="h-3.5 w-3.5 text-yellow-400 fill-yellow-400" />
                          <span className="text-sm text-gray-700">{place.rating}</span>
                          <span className="text-xs text-gray-400">({place.reviews})</span>
                        </div>
                      ) : (
                        <span className="text-sm text-gray-400">-</span>
                      )}
                    </td>
                    <td className="px-6 py-3 text-right">
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
                        Opslaan
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </CardContent>
        </Card>
      )}

      {!searching && results.length === 0 && query && (
        <Card>
          <CardContent className="py-12 text-center text-gray-500">
            <Search className="h-8 w-8 mx-auto mb-2 text-gray-300" />
            <p className="text-sm">Geen resultaten gevonden. Probeer een andere zoekterm.</p>
          </CardContent>
        </Card>
      )}
    </div>
  )
}
