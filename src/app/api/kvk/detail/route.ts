import { NextRequest, NextResponse } from 'next/server'

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const kvkNummer = searchParams.get('kvkNummer')
  if (!kvkNummer) return NextResponse.json({ error: 'kvkNummer vereist' }, { status: 400 })

  const apiKey = process.env.KVK_API_KEY
  if (!apiKey) return NextResponse.json({ error: 'KVK_API_KEY ontbreekt' }, { status: 500 })

  try {
    // Haal basisprofiel op (bevat materieleRegistratie en hoofdvestiging links)
    const basisUrl = `https://api.kvk.nl/api/v1/basisprofielen/${encodeURIComponent(kvkNummer)}?geoData=false`
    const basisRes = await fetch(basisUrl, { headers: { apikey: apiKey } })
    if (!basisRes.ok) {
      const txt = await basisRes.text()
      return NextResponse.json({ error: `KVK basisprofiel (${basisRes.status}): ${txt}` }, { status: 502 })
    }
    const basis = await basisRes.json()

    // Hoofdvestiging info met contactgegevens
    let vestiging: Record<string, unknown> | null = null
    const hoofdUrl = `https://api.kvk.nl/api/v1/basisprofielen/${encodeURIComponent(kvkNummer)}/hoofdvestiging?geoData=false`
    const hvRes = await fetch(hoofdUrl, { headers: { apikey: apiKey } })
    if (hvRes.ok) {
      vestiging = await hvRes.json()
    }

    // Bouw samengestelde response
    const naam = (basis?.handelsnamen?.[0]?.naam as string) || (basis?.naam as string) || ''

    const adresObj = (vestiging?.adressen as Array<Record<string, unknown>> | undefined)?.find(a => a.type === 'bezoekadres')
      || (vestiging?.adressen as Array<Record<string, unknown>> | undefined)?.[0]
    const huisnr = [adresObj?.huisnummer, adresObj?.huisletter, adresObj?.huisnummerToevoeging]
      .filter(Boolean)
      .join('')
    const straat = (adresObj?.straatnaam as string) || ''
    const adres = [straat, huisnr].filter(Boolean).join(' ')
    const postcode = (adresObj?.postcode as string) || ''
    const plaats = (adresObj?.plaats as string) || ''

    // Contactgegevens: kan zowel op basisprofiel als hoofdvestiging staan
    const websites = (vestiging?.websites as string[] | undefined) || (basis?._embedded?.hoofdvestiging?.websites as string[] | undefined) || []
    const email = (vestiging?.eersteEmail as string | undefined)
      || ((vestiging?.emails as string[] | undefined)?.[0])
      || (basis?._embedded?.hoofdvestiging?.emails?.[0] as string | undefined)
      || ''
    const telefoon = (vestiging?.eersteTelefoonnummer as string | undefined)
      || ((vestiging?.telefoonnummers as string[] | undefined)?.[0])
      || (basis?._embedded?.hoofdvestiging?.telefoonnummers?.[0] as string | undefined)
      || ''

    return NextResponse.json({
      kvkNummer,
      naam,
      straat,
      huisnummer: String(huisnr || ''),
      adres,
      postcode,
      plaats,
      email,
      telefoon,
      website: websites[0] || '',
    })
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : 'KVK detail mislukt' }, { status: 500 })
  }
}
