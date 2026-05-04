import { NextRequest, NextResponse } from 'next/server'
import { lookupAdres } from '@/lib/pdok'

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const postcode = searchParams.get('postcode')
  const huisnummer = searchParams.get('huisnummer')
  if (!postcode || !huisnummer) {
    return NextResponse.json({ error: 'postcode en huisnummer vereist' }, { status: 400 })
  }
  try {
    const adres = await lookupAdres(postcode, huisnummer)
    if (!adres) return NextResponse.json({ error: 'Niet gevonden' }, { status: 404 })
    return NextResponse.json(adres)
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Lookup mislukt' }, { status: 502 })
  }
}
