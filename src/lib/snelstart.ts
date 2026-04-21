// SnelStart B2B API client
// Docs: https://b2b.snelstart.nl/docs
//
// Auth: POST https://auth.snelstart.nl/b2b/token met subscription key + clientkey
// API:  https://b2bapi.snelstart.nl/v2/*

const AUTH_URL = 'https://auth.snelstart.nl/b2b/token'
const API_BASE = 'https://b2bapi.snelstart.nl/v2'

let cachedToken: { token: string; expiresAt: number } | null = null

async function getAccessToken(): Promise<string> {
  const subscriptionKey = process.env.SNELSTART_SUBSCRIPTION_KEY
  const clientKey = process.env.SNELSTART_CLIENT_KEY
  if (!subscriptionKey || !clientKey) {
    throw new Error('SNELSTART_SUBSCRIPTION_KEY en/of SNELSTART_CLIENT_KEY ontbreken')
  }

  // Hergebruik cached token tot 30s voor verval
  if (cachedToken && Date.now() < cachedToken.expiresAt - 30000) {
    return cachedToken.token
  }

  const body = new URLSearchParams({
    grant_type: 'clientkey',
    clientkey: clientKey,
  })

  const res = await fetch(AUTH_URL, {
    method: 'POST',
    headers: {
      'Ocp-Apim-Subscription-Key': subscriptionKey,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: body.toString(),
  })

  if (!res.ok) {
    const txt = await res.text()
    throw new Error(`SnelStart auth mislukt (${res.status}): ${txt}`)
  }

  const data = (await res.json()) as { access_token: string; expires_in: number; token_type: string }
  cachedToken = {
    token: data.access_token,
    expiresAt: Date.now() + data.expires_in * 1000,
  }
  return data.access_token
}

async function snelstartFetch<T>(path: string, options: RequestInit = {}): Promise<T> {
  const subscriptionKey = process.env.SNELSTART_SUBSCRIPTION_KEY
  if (!subscriptionKey) throw new Error('SNELSTART_SUBSCRIPTION_KEY ontbreekt')

  const token = await getAccessToken()
  const res = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers: {
      Authorization: `Bearer ${token}`,
      'Ocp-Apim-Subscription-Key': subscriptionKey,
      'Content-Type': 'application/json',
      Accept: 'application/json',
      ...(options.headers || {}),
    },
  })

  if (!res.ok) {
    const txt = await res.text()
    throw new Error(`SnelStart ${options.method || 'GET'} ${path} faalde (${res.status}): ${txt}`)
  }

  if (res.status === 204) return null as T
  return (await res.json()) as T
}

// ---------- Types ----------
export interface SnelStartRelatie {
  id: string
  relatieCode?: string
  relatiesoort: string[]
  naam: string
  email?: string
  vestigingsAdres?: { contactpersoon?: string; straat?: string; postcode?: string; plaats?: string; landISOCode?: string }
  correspondentieAdres?: { contactpersoon?: string; straat?: string; postcode?: string; plaats?: string; landISOCode?: string }
  btwNummer?: string
  kvkNummer?: string
  iban?: string
}

export interface SnelStartGrootboek {
  id: string
  nummer: number
  omschrijving: string
  rekeningCode?: { omschrijving?: string }
}

export interface SnelStartBtwTarief {
  id: string
  omschrijving: string
}

// ---------- Relaties ----------

export async function findRelatieByEmail(email: string): Promise<SnelStartRelatie | null> {
  if (!email) return null
  const filter = encodeURIComponent(`email eq '${email.replace(/'/g, "''")}'`)
  const list = await snelstartFetch<SnelStartRelatie[]>(`/relaties?$filter=${filter}&$top=1`)
  return list && list.length > 0 ? list[0] : null
}

export async function findRelatieByNaam(naam: string): Promise<SnelStartRelatie | null> {
  if (!naam) return null
  const filter = encodeURIComponent(`naam eq '${naam.replace(/'/g, "''")}'`)
  const list = await snelstartFetch<SnelStartRelatie[]>(`/relaties?$filter=${filter}&$top=1`)
  return list && list.length > 0 ? list[0] : null
}

export async function createRelatie(input: {
  naam: string
  email?: string | null
  contactpersoon?: string | null
  adres?: string | null
  postcode?: string | null
  plaats?: string | null
  btw_nummer?: string | null
  kvk_nummer?: string | null
  iban?: string | null
}): Promise<SnelStartRelatie> {
  const body: Record<string, unknown> = {
    relatiesoort: ['Klant'],
    naam: input.naam,
  }
  if (input.email) body.email = input.email
  if (input.btw_nummer) body.btwNummer = input.btw_nummer
  if (input.kvk_nummer) body.kvkNummer = input.kvk_nummer
  if (input.iban) body.iban = input.iban
  if (input.adres || input.postcode || input.plaats || input.contactpersoon) {
    body.vestigingsAdres = {
      contactpersoon: input.contactpersoon || undefined,
      straat: input.adres || undefined,
      postcode: input.postcode || undefined,
      plaats: input.plaats || undefined,
      landISOCode: 'NL',
    }
  }

  return snelstartFetch<SnelStartRelatie>('/relaties', {
    method: 'POST',
    body: JSON.stringify(body),
  })
}

// ---------- Grootboeken & BTW ----------
let cachedOmzetGrootboekId: string | null = null

export async function getDefaultOmzetGrootboekId(): Promise<string | null> {
  if (cachedOmzetGrootboekId) return cachedOmzetGrootboekId
  // SnelStart omzet grootboeken beginnen typisch met 80xx
  const grootboeken = await snelstartFetch<SnelStartGrootboek[]>('/grootboeken?$top=200')
  const omzet = grootboeken.find(g => g.nummer >= 8000 && g.nummer < 9000)
  cachedOmzetGrootboekId = omzet?.id || grootboeken[0]?.id || null
  return cachedOmzetGrootboekId
}

let cachedBtwTarieven: SnelStartBtwTarief[] | null = null

export async function getBtwTariefId(percentage: number): Promise<string | null> {
  if (!cachedBtwTarieven) {
    cachedBtwTarieven = await snelstartFetch<SnelStartBtwTarief[]>('/btwtarieven')
  }
  // Matchen op omschrijving die het percentage bevat
  const match = cachedBtwTarieven.find(t => t.omschrijving?.includes(`${percentage}%`) || t.omschrijving?.includes(`${percentage},`))
  if (match) return match.id
  // Fallback: 'Geen' bij 0%
  if (percentage === 0) {
    const geen = cachedBtwTarieven.find(t => /geen/i.test(t.omschrijving || ''))
    if (geen) return geen.id
  }
  return null
}

// ---------- Verkoopboekingen (facturen) ----------

export interface SnelStartVerkoopboekingInput {
  factuurnummer: string
  factuurDatum: string // YYYY-MM-DD
  vervalDatum: string // YYYY-MM-DD
  omschrijving: string
  relatieId: string
  regels: {
    omschrijving: string
    aantal: number
    bedrag: number // excl btw
    btwPercentage: number
  }[]
}

export interface SnelStartVerkoopboeking {
  id: string
  factuurNummer: string
}

export async function createVerkoopboeking(input: SnelStartVerkoopboekingInput): Promise<SnelStartVerkoopboeking> {
  const grootboekId = await getDefaultOmzetGrootboekId()
  if (!grootboekId) throw new Error('Geen omzet-grootboek gevonden in SnelStart')

  // Bereken per regel: bedrag excl btw, btw bedrag, btw tarief id
  const boekingsregels = await Promise.all(input.regels.map(async r => {
    const bedragExcl = r.aantal * r.bedrag
    const btwTariefId = await getBtwTariefId(r.btwPercentage)
    return {
      omschrijving: r.omschrijving.slice(0, 200),
      bedrag: Number(bedragExcl.toFixed(2)),
      grootboek: { id: grootboekId },
      ...(btwTariefId ? { btwTarief: { id: btwTariefId } } : {}),
    }
  }))

  const factuurBedragIncl = input.regels.reduce((sum, r) => {
    const excl = r.aantal * r.bedrag
    return sum + excl + (excl * r.btwPercentage) / 100
  }, 0)

  const body = {
    factuurNummer: input.factuurnummer,
    factuurDatum: input.factuurDatum,
    boekingsDatum: input.factuurDatum,
    vervalDatum: input.vervalDatum,
    factuurBedrag: Number(factuurBedragIncl.toFixed(2)),
    omschrijving: input.omschrijving.slice(0, 200),
    relatie: { id: input.relatieId },
    boekingsregels,
  }

  return snelstartFetch<SnelStartVerkoopboeking>('/verkoopboekingen', {
    method: 'POST',
    body: JSON.stringify(body),
  })
}

// ---------- High-level: sync relatie + post factuur ----------

export function isSnelStartEnabled(): boolean {
  return Boolean(process.env.SNELSTART_SUBSCRIPTION_KEY && process.env.SNELSTART_CLIENT_KEY)
}
