import { NextRequest, NextResponse } from 'next/server'

interface KvkResult {
  kvkNummer: string
  naam: string
  adres: string
  straat: string
  huisnummer: string
  postcode: string
  plaats: string
  email: string
  telefoon: string
  website: string
  type: string
}

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const query = searchParams.get('q') || ''

  if (!query || query.length < 2) {
    return NextResponse.json({ results: [] })
  }

  const apiKey = process.env.KVK_API_KEY

  if (!apiKey) {
    return NextResponse.json({
      results: [],
      error: 'KVK API key niet geconfigureerd. Voeg KVK_API_KEY toe aan .env.local (€6,40/maand via developers.kvk.nl)',
    })
  }

  try {
    const results = await searchKvk(query, apiKey)
    return NextResponse.json({ results })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'KVK zoeken mislukt'
    return NextResponse.json({ results: [], error: message })
  }
}

async function searchKvk(query: string, apiKey: string): Promise<KvkResult[]> {
  // Bepaal of het een KVK-nummer is (8 cijfers) of een naam
  const isKvkNummer = /^\d{8}$/.test(query.trim())

  const params = new URLSearchParams({
    pagina: '1',
    resultatenPerPagina: '10',
  })

  if (isKvkNummer) {
    params.set('kvkNummer', query.trim())
  } else {
    params.set('naam', query)
  }

  const url = `https://api.kvk.nl/api/v2/zoeken?${params}`

  const res = await fetch(url, {
    headers: { apikey: apiKey },
  })

  if (!res.ok) {
    if (res.status === 401 || res.status === 403) {
      throw new Error('KVK API key ongeldig. Controleer je KVK_API_KEY.')
    }
    throw new Error(`KVK API fout (${res.status})`)
  }

  const data = await res.json()
  const resultaten = data.resultaten || []

  return resultaten.map((r: {
    kvkNummer: string
    naam: string
    adres?: {
      binnenlandsAdres?: {
        straatnaam?: string
        huisnummer?: number
        huisletter?: string
        huisnummerToevoeging?: string
        postcode?: string
        plaats?: string
      }
    }
    type?: string
  }) => {
    const adresObj = r.adres?.binnenlandsAdres
    const huisnr = [adresObj?.huisnummer, adresObj?.huisletter, adresObj?.huisnummerToevoeging]
      .filter(Boolean)
      .join('')
    const straat = [adresObj?.straatnaam, huisnr].filter(Boolean).join(' ')

    return {
      kvkNummer: r.kvkNummer,
      naam: r.naam,
      adres: straat,
      postcode: adresObj?.postcode || '',
      plaats: adresObj?.plaats || '',
      type: r.type || '',
    }
  })
}
