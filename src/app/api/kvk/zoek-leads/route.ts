import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'

// Rebu zit in Wormerveer — center voor radius filter
const REBU_CENTER = { lat: 52.492, lng: 4.779 }

interface KvkZoekResult {
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
}

// Bounding box in kilometers → approx lat/lng delta
function haversineKm(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371
  const toRad = (x: number) => (x * Math.PI) / 180
  const dLat = toRad(lat2 - lat1)
  const dLng = toRad(lng2 - lng1)
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2
  return 2 * R * Math.asin(Math.sqrt(a))
}

// Geocode postcode via PDOK Locatieserver (gratis, geen key)
async function postcodeNaarLatLng(postcode: string): Promise<{ lat: number; lng: number } | null> {
  if (!postcode) return null
  try {
    const pc = postcode.replace(/\s+/g, '').toUpperCase()
    const url = `https://api.pdok.nl/bzk/locatieserver/search/v3_1/free?q=${encodeURIComponent(pc)}&fq=type:postcode&rows=1`
    const r = await fetch(url)
    if (!r.ok) return null
    const data = await r.json()
    const doc = data?.response?.docs?.[0]
    const ll = doc?.centroide_ll as string | undefined
    if (!ll) return null
    const m = ll.match(/POINT\(([-\d.]+)\s([-\d.]+)\)/)
    if (!m) return null
    return { lat: parseFloat(m[2]), lng: parseFloat(m[1]) }
  } catch {
    return null
  }
}

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const naamFilter = searchParams.get('naam') || ''
  const plaats = searchParams.get('plaats') || ''
  const radiusKm = parseInt(searchParams.get('radius') || '0', 10)
  const maxResults = Math.min(parseInt(searchParams.get('max') || '100', 10), 500)

  const apiKey = process.env.KVK_API_KEY
  if (!apiKey) return NextResponse.json({ error: 'KVK_API_KEY ontbreekt' }, { status: 500 })

  // Haal bestaande CRM relaties op (kvk-nummers + namen) om te filteren
  const supaAdmin = createAdminClient()
  const { data: bestaand } = await supaAdmin
    .from('relaties')
    .select('bedrijfsnaam, kvk_nummer')
  const bestaandeKvk = new Set<string>()
  const bestaandeNamen = new Set<string>()
  for (const r of bestaand || []) {
    if (r.kvk_nummer) bestaandeKvk.add(String(r.kvk_nummer).trim())
    if (r.bedrijfsnaam) bestaandeNamen.add(r.bedrijfsnaam.toLowerCase().trim())
  }

  // Bouw KVK zoek-query, pagineer tot maxResults
  const alle: KvkZoekResult[] = []
  let pagina = 1
  while (alle.length < maxResults && pagina <= 50) {
    const params = new URLSearchParams({
      pagina: String(pagina),
      resultatenPerPagina: '100',
      type: 'hoofdvestiging',
    })
    if (plaats) params.set('plaats', plaats)
    if (naamFilter) params.set('naam', naamFilter)

    const r = await fetch(`https://api.kvk.nl/api/v2/zoeken?${params}`, { headers: { apikey: apiKey } })
    if (!r.ok) {
      const txt = await r.text()
      return NextResponse.json({ error: `KVK (${r.status}): ${txt}` }, { status: 502 })
    }
    const data = await r.json()
    const res = (data?.resultaten || []) as KvkZoekResult[]
    if (res.length === 0) break
    alle.push(...res)
    if (res.length < 100) break
    pagina++
  }

  // Blacklist woorden (sluit duidelijk niet-bouw bedrijven uit)
  const BLACKLIST_WOORDEN = ['computer', 'computerservice', 'automatisering', 'ict', 'software', 'holding', 'beheer', 'makelaar', 'advies', 'consultancy', 'kapper', 'schoonmaak', 'reclame', 'kraan', 'transport', 'taxi', 'horeca', 'restaurant', 'kliniek', 'fysio', 'tandarts', 'uitzend', 'vastgoed', 'verhuur', 'fotograaf', 'juwelier', 'groothandel', 'webdesign']

  // Dedup + filter bestaande CRM relaties
  const gezien = new Set<string>()
  const kandidaten: Array<{
    kvkNummer: string
    naam: string
    adres: string
    postcode: string
    plaats: string
    afstandKm?: number
  }> = []
  for (const r of alle) {
    if (gezien.has(r.kvkNummer)) continue
    gezien.add(r.kvkNummer)
    if (bestaandeKvk.has(r.kvkNummer)) continue
    if (bestaandeNamen.has((r.naam || '').toLowerCase().trim())) continue
    const naamLower = (r.naam || '').toLowerCase()
    if (BLACKLIST_WOORDEN.some(w => naamLower.includes(w))) continue
    const a = r.adres?.binnenlandsAdres
    const huisnr = [a?.huisnummer, a?.huisletter, a?.huisnummerToevoeging].filter(Boolean).join('')
    kandidaten.push({
      kvkNummer: r.kvkNummer,
      naam: r.naam,
      adres: [a?.straatnaam, huisnr].filter(Boolean).join(' '),
      postcode: a?.postcode || '',
      plaats: a?.plaats || '',
    })
  }

  // Radius filter (postcode → lat/lng via PDOK, beperk aantal calls door caching op postcode)
  if (radiusKm > 0) {
    const pcCache = new Map<string, { lat: number; lng: number } | null>()
    async function geo(pc: string) {
      if (!pc) return null
      if (pcCache.has(pc)) return pcCache.get(pc) as { lat: number; lng: number } | null
      const v = await postcodeNaarLatLng(pc)
      pcCache.set(pc, v)
      return v
    }
    const filtered: typeof kandidaten = []
    // Batch geocoding (5 parallel)
    for (let i = 0; i < kandidaten.length; i += 5) {
      const batch = kandidaten.slice(i, i + 5)
      const geos = await Promise.all(batch.map(k => geo(k.postcode)))
      for (let j = 0; j < batch.length; j++) {
        const g = geos[j]
        if (!g) continue
        const d = haversineKm(REBU_CENTER.lat, REBU_CENTER.lng, g.lat, g.lng)
        if (d <= radiusKm) {
          filtered.push({ ...batch[j], afstandKm: Math.round(d) })
        }
      }
    }
    filtered.sort((a, b) => (a.afstandKm || 0) - (b.afstandKm || 0))
    return NextResponse.json({ resultaten: filtered, aantalGevonden: alle.length, aantalGetoond: filtered.length })
  }

  return NextResponse.json({ resultaten: kandidaten.slice(0, maxResults), aantalGevonden: alle.length, aantalGetoond: kandidaten.length })
}
