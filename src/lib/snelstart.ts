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
  btwSoort: string
  btwPercentage: number
  datumVanaf: string
  datumTotEnMet: string
}

// ---------- Relaties ----------

// Cache: alle relaties ophalen en client-side matchen, omdat SnelStart OData filter op
// 'email' een 400 geeft ("Could not find property named 'email'"). Cache 10 min.
let cachedAlleRelaties: { at: number; list: SnelStartRelatie[] } | null = null
async function getAllSnelStartRelaties(): Promise<SnelStartRelatie[]> {
  if (cachedAlleRelaties && Date.now() - cachedAlleRelaties.at < 10 * 60 * 1000) return cachedAlleRelaties.list
  const all: SnelStartRelatie[] = []
  for (let skip = 0; skip < 20000; skip += 100) {
    const list = await snelstartFetch<SnelStartRelatie[]>(`/relaties?$top=100&$skip=${skip}`)
    if (!Array.isArray(list) || list.length === 0) break
    all.push(...list)
    if (list.length < 100) break
  }
  cachedAlleRelaties = { at: Date.now(), list: all }
  return all
}

function isKlant(r: SnelStartRelatie): boolean {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const soort = (r as any).relatiesoort
  if (Array.isArray(soort)) return soort.includes('Klant')
  if (typeof soort === 'string') return soort === 'Klant'
  return false
}

export async function findRelatieByEmail(email: string): Promise<SnelStartRelatie | null> {
  if (!email) return null
  const target = email.toLowerCase().trim()
  const all = await getAllSnelStartRelaties()
  const matches = all.filter(r => (r.email || '').toLowerCase().trim() === target)
  // Voorkeur voor klant-type; anders eerste match die we dan upgraden
  return matches.find(isKlant) || matches[0] || null
}

export async function findRelatieByNaam(naam: string): Promise<SnelStartRelatie | null> {
  if (!naam) return null
  const target = naam.toLowerCase().trim()
  const all = await getAllSnelStartRelaties()
  const matches = all.filter(r => (r.naam || '').toLowerCase().trim() === target)
  return matches.find(isKlant) || matches[0] || null
}

/** Voegt 'Klant' toe aan een bestaande SnelStart-relatie als die het nog niet is. */
export async function ensureRelatieIsKlant(relatieId: string): Promise<void> {
  const existing = await snelstartFetch<SnelStartRelatie>(`/relaties/${relatieId}`)
  if (isKlant(existing)) return
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const huidigeSoorten = Array.isArray((existing as any).relatiesoort) ? (existing as any).relatiesoort as string[] : []
  const nieuweSoorten = [...new Set([...huidigeSoorten, 'Klant'])]
  await snelstartFetch(`/relaties/${relatieId}`, {
    method: 'PUT',
    body: JSON.stringify({ ...existing, relatiesoort: nieuweSoorten }),
  })
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
  // SnelStart: naam max 50 chars
  const naam = input.naam.length > 50 ? input.naam.slice(0, 50).trim() : input.naam
  const body: Record<string, unknown> = {
    relatiesoort: ['Klant'],
    naam,
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

// ---------- Grootboeken ----------
// Cache grootboeken per btwSoort — SnelStart vereist dat btwSoort op regel overeenkomt met grootboekrekening
interface CachedGrootboeken {
  hoog: SnelStartGrootboek | null
  laag: SnelStartGrootboek | null
  geen: SnelStartGrootboek | null
}
let cachedGrootboeken: CachedGrootboeken | null = null

async function loadGrootboeken(): Promise<CachedGrootboeken> {
  if (cachedGrootboeken) return cachedGrootboeken
  const list = await snelstartFetch<(SnelStartGrootboek & { btwSoort?: string; grootboekfunctie?: string })[]>('/grootboeken?$top=200')
  const omzet = list.filter(g => g.nummer >= 8000 && g.nummer < 9000)
  cachedGrootboeken = {
    // 8000 "Omzet hoog (productiegoederen)" voor 21% BTW
    hoog: omzet.find(g => g.nummer === 8000) || omzet.find(g => g.btwSoort === 'Hoog') || null,
    // 8110 "Omzet laag (handelsgoederen)" voor 9% BTW
    laag: omzet.find(g => g.nummer === 8110) || omzet.find(g => g.btwSoort === 'Laag') || null,
    // 8199 "Vrijgestelde omzet" voor 0% / geen BTW
    geen: omzet.find(g => g.nummer === 8199) || omzet.find(g => g.btwSoort === 'Geen') || null,
  }
  return cachedGrootboeken
}

function getBtwSoortRegel(pct: number): 'Hoog' | 'Laag' | 'Geen' {
  if (pct === 21) return 'Hoog'
  if (pct === 9) return 'Laag'
  return 'Geen'
}

function getBtwSoortVerkopen(pct: number): 'VerkopenHoog' | 'VerkopenLaag' | null {
  if (pct === 21) return 'VerkopenHoog'
  if (pct === 9) return 'VerkopenLaag'
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
  const grootboeken = await loadGrootboeken()

  // Boekingsregels: bedrag EXCL BTW, grootboek passend bij btwSoort
  const boekingsregels = input.regels.map(r => {
    const bedragExcl = r.aantal * r.bedrag
    const soort = getBtwSoortRegel(r.btwPercentage)
    const grootboek = soort === 'Hoog' ? grootboeken.hoog : soort === 'Laag' ? grootboeken.laag : grootboeken.geen
    if (!grootboek) throw new Error(`Geen SnelStart omzet-grootboek gevonden voor BTW-soort ${soort} (${r.btwPercentage}%)`)
    return {
      omschrijving: r.omschrijving.slice(0, 200),
      bedrag: Number(bedragExcl.toFixed(2)),
      grootboek: { id: grootboek.id },
      btwSoort: soort,
    }
  })

  // BTW array: gebruik veld 'btwBedrag' (niet 'bedrag') — SnelStart specifieke naming
  const btwMap: Record<string, number> = {}
  let factuurBedragIncl = 0
  for (const r of input.regels) {
    const excl = r.aantal * r.bedrag
    const btwBedrag = excl * r.btwPercentage / 100
    factuurBedragIncl += excl + btwBedrag
    const verkoop = getBtwSoortVerkopen(r.btwPercentage)
    if (verkoop) btwMap[verkoop] = (btwMap[verkoop] || 0) + btwBedrag
  }
  const btw = Object.entries(btwMap).map(([btwSoort, btwBedrag]) => ({ btwSoort, btwBedrag: Number(btwBedrag.toFixed(2)) }))

  const body = {
    factuurNummer: input.factuurnummer,
    factuurDatum: input.factuurDatum,
    boekingsDatum: input.factuurDatum,
    vervalDatum: input.vervalDatum,
    factuurBedrag: Number(factuurBedragIncl.toFixed(2)),
    omschrijving: input.omschrijving.slice(0, 200),
    klant: { id: input.relatieId },
    boekingsregels,
    btw,
  }

  return snelstartFetch<SnelStartVerkoopboeking>('/verkoopboekingen', {
    method: 'POST',
    body: JSON.stringify(body),
  })
}

export async function deleteVerkoopboeking(boekingId: string): Promise<void> {
  await snelstartFetch(`/verkoopboekingen/${boekingId}`, { method: 'DELETE' })
}

// Zoek verkoopboeking-id op basis van factuurnummer (fallback voor delete sync)
export async function findVerkoopboekingByFactuurnummer(factuurnummer: string): Promise<string | null> {
  try {
    for (let skip = 0; skip < 2000; skip += 100) {
      const list = await snelstartFetch<Array<{ factuurnummer: string; verkoopBoeking?: { id: string } }>>(
        `/verkoopfacturen?$top=100&$skip=${skip}`,
      )
      if (!Array.isArray(list) || list.length === 0) break
      const hit = list.find(v => v.factuurnummer === factuurnummer)
      if (hit?.verkoopBoeking?.id) return hit.verkoopBoeking.id
      if (list.length < 100) break
    }
  } catch (err) {
    console.error('SnelStart factuur zoeken mislukt:', err)
  }
  return null
}

// ---------- Openstaand / betaling sync ----------

export interface SnelStartFactuurStatus {
  factuurnummer: string
  factuurBedrag: number
  openstaand: number
  boekingsDatum?: string
  vervaldatum?: string
  gecrediteerd?: boolean
}

// Haalt ALLE verkoopfacturen op met hun openstaand-saldo.
// LET OP: SnelStart gebruikt 'openstaandSaldo' (niet 'openstaand') en 'factuurDatum' /
// 'vervalDatum' in kamelcase. Paginatie via $top/$skip; max 100 per call.
export async function listAllVerkoopfacturen(): Promise<SnelStartFactuurStatus[]> {
  const all: SnelStartFactuurStatus[] = []
  for (let skip = 0; skip < 20000; skip += 100) {
    const list = await snelstartFetch<Array<{
      factuurnummer?: string
      factuurBedrag?: number
      openstaandSaldo?: number
      factuurDatum?: string
      vervalDatum?: string
    }>>(`/verkoopfacturen?$top=100&$skip=${skip}`)
    if (!Array.isArray(list) || list.length === 0) break
    for (const v of list) {
      if (!v.factuurnummer) continue
      all.push({
        factuurnummer: v.factuurnummer,
        factuurBedrag: Number(v.factuurBedrag ?? 0),
        openstaand: Number(v.openstaandSaldo ?? 0),
        boekingsDatum: v.factuurDatum,
        vervaldatum: v.vervalDatum,
        gecrediteerd: false,
      })
    }
    if (list.length < 100) break
  }
  return all
}

// ---------- High-level: sync relatie + post factuur ----------

export function isSnelStartEnabled(): boolean {
  return Boolean(process.env.SNELSTART_SUBSCRIPTION_KEY && process.env.SNELSTART_CLIENT_KEY)
}
