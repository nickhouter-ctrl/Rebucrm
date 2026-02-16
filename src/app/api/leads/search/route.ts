import { NextRequest, NextResponse } from 'next/server'

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const query = searchParams.get('query') || ''
  const postcode = searchParams.get('postcode') || ''

  if (!query) {
    return NextResponse.json({ results: [] })
  }

  const apiKey = process.env.GOOGLE_PLACES_API_KEY
  if (!apiKey) {
    return NextResponse.json({ error: 'Google Places API key niet geconfigureerd' }, { status: 500 })
  }

  const searchQuery = postcode ? `${query} ${postcode}` : query
  const url = `https://maps.googleapis.com/maps/api/place/textsearch/json?query=${encodeURIComponent(searchQuery)}&language=nl&region=nl&key=${apiKey}`

  try {
    const response = await fetch(url)
    const data = await response.json()

    if (data.status !== 'OK' && data.status !== 'ZERO_RESULTS') {
      return NextResponse.json({ error: `Google API fout: ${data.status}` }, { status: 500 })
    }

    const results = (data.results || []).map((place: {
      place_id: string
      name: string
      formatted_address: string
      rating?: number
      user_ratings_total?: number
      types?: string[]
      business_status?: string
    }) => ({
      place_id: place.place_id,
      name: place.name,
      address: place.formatted_address,
      rating: place.rating || null,
      reviews: place.user_ratings_total || 0,
      types: place.types || [],
      business_status: place.business_status || null,
    }))

    return NextResponse.json({ results })
  } catch {
    return NextResponse.json({ error: 'Kan Google Places niet bereiken' }, { status: 500 })
  }
}
