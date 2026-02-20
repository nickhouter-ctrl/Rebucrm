import { NextRequest, NextResponse } from 'next/server'

interface PlaceResult {
  place_id: string
  name: string
  address: string
  phone: string | null
  website: string | null
  rating: number | null
  reviews: number
  bron: string
}

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const query = searchParams.get('query') || ''
  const postcode = searchParams.get('postcode') || ''
  const radius = parseInt(searchParams.get('radius') || '10000', 10)

  if (!query) {
    return NextResponse.json({ results: [] })
  }

  const googleKey = process.env.GOOGLE_PLACES_API_KEY

  // Zoek parallel in alle beschikbare bronnen
  const searches: Promise<PlaceResult[]>[] = []

  // 1. Google Places (als API key beschikbaar)
  if (googleKey) {
    searches.push(searchGoogle(query, postcode, googleKey).catch(() => []))
  }

  // 2. OpenStreetMap Nominatim (altijd beschikbaar)
  searches.push(searchNominatim(query, postcode).catch(() => []))

  // 3. Overpass API - zoek bedrijven op type in gebied (altijd beschikbaar)
  if (postcode) {
    searches.push(searchOverpass(query, postcode, radius).catch(() => []))
  }

  const allResults = await Promise.all(searches)
  const combined = allResults.flat()

  // Dedupliceer op naam + adres
  const seen = new Set<string>()
  const unique = combined.filter(r => {
    const key = `${r.name.toLowerCase()}_${r.address.toLowerCase().slice(0, 30)}`
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })

  return NextResponse.json({
    results: unique.slice(0, 25),
    bronnen: [
      ...(googleKey ? ['Google Places'] : []),
      'OpenStreetMap',
      ...(postcode ? ['Overpass API'] : []),
    ],
  })
}

// === GOOGLE PLACES ===
async function searchGoogle(query: string, postcode: string, apiKey: string): Promise<PlaceResult[]> {
  const searchQuery = postcode ? `${query} ${postcode} Nederland` : `${query} Nederland`
  const url = `https://maps.googleapis.com/maps/api/place/textsearch/json?query=${encodeURIComponent(searchQuery)}&language=nl&region=nl&key=${apiKey}`

  const response = await fetch(url)
  const data = await response.json()

  if (data.status !== 'OK' && data.status !== 'ZERO_RESULTS') {
    throw new Error(`Google API: ${data.status}`)
  }

  const places = (data.results || []).slice(0, 10)

  return Promise.all(
    places.map(async (place: {
      place_id: string
      name: string
      formatted_address: string
      rating?: number
      user_ratings_total?: number
    }) => {
      let phone: string | null = null
      let website: string | null = null

      try {
        const detailUrl = `https://maps.googleapis.com/maps/api/place/details/json?place_id=${place.place_id}&fields=formatted_phone_number,website&language=nl&key=${apiKey}`
        const detailRes = await fetch(detailUrl)
        const detailData = await detailRes.json()
        if (detailData.result) {
          phone = detailData.result.formatted_phone_number || null
          website = detailData.result.website || null
        }
      } catch {
        // Details ophalen mislukt
      }

      return {
        place_id: place.place_id,
        name: place.name,
        address: place.formatted_address,
        phone,
        website,
        rating: place.rating || null,
        reviews: place.user_ratings_total || 0,
        bron: 'Google',
      }
    })
  )
}

// === OPENSTREETMAP NOMINATIM ===
async function searchNominatim(query: string, postcode: string): Promise<PlaceResult[]> {
  const searchQuery = postcode ? `${query} ${postcode}` : query
  const url = `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(searchQuery)}&format=json&addressdetails=1&countrycodes=nl&limit=15&extratags=1`

  const response = await fetch(url, {
    headers: { 'User-Agent': 'Rebu-CRM/1.0 (verkoop@rebukozijnen.nl)' },
  })

  if (!response.ok) throw new Error('Nominatim fout')

  const data = await response.json()

  return (data || [])
    .filter((item: { class?: string; display_name?: string }) =>
      item.display_name && item.class !== 'highway' && item.class !== 'boundary'
    )
    .map((item: {
      place_id: number
      display_name: string
      name?: string
      address?: { house_number?: string; road?: string; postcode?: string; city?: string; town?: string; village?: string; suburb?: string }
      extratags?: { phone?: string; website?: string; 'contact:phone'?: string; 'contact:website'?: string }
    }) => {
      const addr = item.address || {}
      const straat = [addr.road, addr.house_number].filter(Boolean).join(' ')
      const plaats = addr.city || addr.town || addr.village || addr.suburb || ''
      const pc = addr.postcode || ''

      return {
        place_id: `osm_${item.place_id}`,
        name: item.name || item.display_name?.split(',')[0] || 'Onbekend',
        address: [straat, pc, plaats].filter(Boolean).join(', ') || item.display_name || '',
        phone: item.extratags?.phone || item.extratags?.['contact:phone'] || null,
        website: item.extratags?.website || item.extratags?.['contact:website'] || null,
        rating: null,
        reviews: 0,
        bron: 'OpenStreetMap',
      }
    })
}

// === OVERPASS API (OSM bedrijven zoeken in een gebied) ===
async function searchOverpass(query: string, postcode: string, radius: number = 10000): Promise<PlaceResult[]> {
  // Eerst geocode de postcode/plaats naar coördinaten via Nominatim
  const geoUrl = `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(postcode)}&format=json&countrycodes=nl&limit=1`
  const geoRes = await fetch(geoUrl, {
    headers: { 'User-Agent': 'Rebu-CRM/1.0 (verkoop@rebukozijnen.nl)' },
  })
  const geoData = await geoRes.json()

  if (!geoData || geoData.length === 0) return []

  const lat = parseFloat(geoData[0].lat)
  const lon = parseFloat(geoData[0].lon)
  // radius komt van de query parameter (standaard 10km)

  // Zoek bedrijven binnen de straal met de zoekterm in de naam
  const overpassQuery = `
    [out:json][timeout:25];
    (
      node["name"~"${escapeOverpass(query)}",i]["shop"](around:${radius},${lat},${lon});
      node["name"~"${escapeOverpass(query)}",i]["office"](around:${radius},${lat},${lon});
      node["name"~"${escapeOverpass(query)}",i]["craft"](around:${radius},${lat},${lon});
      node["name"~"${escapeOverpass(query)}",i]["amenity"](around:${radius},${lat},${lon});
      node["name"~"${escapeOverpass(query)}",i]["company"](around:${radius},${lat},${lon});
      way["name"~"${escapeOverpass(query)}",i]["shop"](around:${radius},${lat},${lon});
      way["name"~"${escapeOverpass(query)}",i]["office"](around:${radius},${lat},${lon});
      way["name"~"${escapeOverpass(query)}",i]["craft"](around:${radius},${lat},${lon});
      way["name"~"${escapeOverpass(query)}",i]["amenity"](around:${radius},${lat},${lon});
      way["name"~"${escapeOverpass(query)}",i]["company"](around:${radius},${lat},${lon});
    );
    out center 15;
  `

  const overpassUrl = 'https://overpass-api.de/api/interpreter'
  const overpassRes = await fetch(overpassUrl, {
    method: 'POST',
    body: `data=${encodeURIComponent(overpassQuery)}`,
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
  })

  if (!overpassRes.ok) throw new Error('Overpass fout')

  const overpassData = await overpassRes.json()
  const elements = overpassData.elements || []

  return elements
    .filter((el: { tags?: { name?: string } }) => el.tags?.name)
    .map((el: {
      id: number
      tags?: {
        name?: string
        'addr:street'?: string
        'addr:housenumber'?: string
        'addr:postcode'?: string
        'addr:city'?: string
        phone?: string
        'contact:phone'?: string
        website?: string
        'contact:website'?: string
      }
    }) => {
      const tags = el.tags || {}
      const straat = [tags['addr:street'], tags['addr:housenumber']].filter(Boolean).join(' ')
      const adres = [straat, tags['addr:postcode'], tags['addr:city']].filter(Boolean).join(', ')

      return {
        place_id: `overpass_${el.id}`,
        name: tags.name || 'Onbekend',
        address: adres || postcode,
        phone: tags.phone || tags['contact:phone'] || null,
        website: tags.website || tags['contact:website'] || null,
        rating: null,
        reviews: 0,
        bron: 'Overpass',
      }
    })
}

function escapeOverpass(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\"/]/g, '\\$&')
}
