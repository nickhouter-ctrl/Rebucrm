export type RecentVisitType = 'klant' | 'taak' | 'offerte' | 'verkoopkans'

export interface RecentVisit {
  type: RecentVisitType
  id: string
  label: string
  sub?: string | null
  email?: string | null
  telefoon?: string | null
  deadline?: string | null
  status?: string | null
  bedrag?: number | null
  href: string
  visited_at: number
}

const STORAGE_KEY = 'rebu:recent-visits'
const MAX_ENTRIES = 8

export function getRecentVisits(): RecentVisit[] {
  if (typeof window === 'undefined') return []
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw) as RecentVisit[]
    return Array.isArray(parsed) ? parsed.slice(0, MAX_ENTRIES) : []
  } catch {
    return []
  }
}

export function addRecentVisit(entry: Omit<RecentVisit, 'visited_at'>) {
  if (typeof window === 'undefined') return
  try {
    const current = getRecentVisits()
    const filtered = current.filter(v => !(v.type === entry.type && v.id === entry.id))
    const next = [{ ...entry, visited_at: Date.now() }, ...filtered].slice(0, MAX_ENTRIES)
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next))
    window.dispatchEvent(new CustomEvent('rebu:recent-visits-updated'))
  } catch {}
}
