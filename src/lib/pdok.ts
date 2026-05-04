// PDOK Locatieserver (Kadaster) — gratis adres-lookup op postcode + huisnummer.
// Docs: https://api.pdok.nl/bzk/locatieserver/search/v3_1/

export interface PdokAdres {
  straat: string
  huisnummer: string
  toevoeging: string | null
  postcode: string
  plaats: string
}

interface PdokDoc {
  type: string
  weergavenaam: string
  straatnaam?: string
  huisnummer?: number
  huisletter?: string
  huisnummertoevoeging?: string
  postcode?: string
  woonplaatsnaam?: string
}

export async function lookupAdres(postcode: string, huisnummer: string): Promise<PdokAdres | null> {
  const cleanPostcode = postcode.replace(/\s+/g, '').toUpperCase()
  const cleanHuisnummer = huisnummer.trim()
  if (!/^[1-9][0-9]{3}[A-Z]{2}$/.test(cleanPostcode)) return null
  if (!cleanHuisnummer) return null

  const huisnummerOnly = cleanHuisnummer.match(/^\d+/)?.[0] || ''
  if (!huisnummerOnly) return null

  const url = new URL('https://api.pdok.nl/bzk/locatieserver/search/v3_1/free')
  url.searchParams.set('q', `${cleanPostcode} ${huisnummerOnly}`)
  url.searchParams.set('fq', 'type:adres')
  url.searchParams.set('fl', 'weergavenaam,straatnaam,huisnummer,huisletter,huisnummertoevoeging,postcode,woonplaatsnaam')
  url.searchParams.set('rows', '5')

  const res = await fetch(url, { signal: AbortSignal.timeout(5000) })
  if (!res.ok) return null
  const json = await res.json() as { response?: { docs?: PdokDoc[] } }
  const docs = json.response?.docs || []
  if (docs.length === 0) return null

  const toevoegingZoek = cleanHuisnummer.slice(huisnummerOnly.length).trim().toUpperCase()
  const match = toevoegingZoek
    ? docs.find(d => {
        const t = (d.huisletter || d.huisnummertoevoeging || '').toUpperCase().replace(/\s+/g, '')
        return t === toevoegingZoek.replace(/\s+/g, '')
      }) || docs[0]
    : docs[0]

  if (!match.straatnaam || !match.woonplaatsnaam) return null

  return {
    straat: match.straatnaam,
    huisnummer: String(match.huisnummer || huisnummerOnly),
    toevoeging: match.huisletter || match.huisnummertoevoeging || null,
    postcode: match.postcode || cleanPostcode,
    plaats: match.woonplaatsnaam,
  }
}
