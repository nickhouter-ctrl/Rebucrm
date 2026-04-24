'use client'

import { createContext, useContext, useEffect, ReactNode } from 'react'
import { usePathname, useSearchParams } from 'next/navigation'

/**
 * Houdt een stack van niet-form URLs bij in sessionStorage. Form-pagina's
 * (detail/edit/nieuw schermen) gebruiken die stack om na opslaan te
 * navigeren naar waar je ECHT vandaan kwam — ook als je via meerdere
 * form-pagina's bent heen gehopt.
 *
 * Waarom sessionStorage ipv in-memory ref: de stack moet een page-refresh
 * overleven, anders klopt de 'terug'-target niet na een F5 of na een
 * server-side navigatie.
 */
// Alleen pure form/edit-pagina's overslaan. Detail-pagina's zoals
// /relatiebeheer/[id], /projecten/[id] en /leads/[id] worden WEL in de
// stack opgenomen omdat gebruikers daar vandaan navigeren naar taken,
// offertes, facturen — en daar weer naar terug willen na opslaan.
const NAV_IGNORE_PATTERNS: RegExp[] = [
  /^\/taken\/[^/]+\/?$/,
  /^\/offertes\/[^/]+\/?/,
  /^\/facturatie\/[^/]+\/?/,
  /^\/offertes\/orders\/[^/]+\/?/,
  /^\/producten\/[^/]+\/?/,
  /^\/faalkosten\/[^/]+\/?/,
  /^\/medewerkers\/[^/]+\/?/,
]

const STORAGE_KEY = 'nav-history-stack'
const MAX_STACK = 30

function isFormUrl(pathname: string) {
  return NAV_IGNORE_PATTERNS.some(p => p.test(pathname))
}

function readStack(): string[] {
  if (typeof window === 'undefined') return []
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY)
    return raw ? JSON.parse(raw) : []
  } catch { return [] }
}

function writeStack(stack: string[]) {
  if (typeof window === 'undefined') return
  try { sessionStorage.setItem(STORAGE_KEY, JSON.stringify(stack)) } catch { /* quota */ }
}

interface NavHistoryContextValue {
  getBackUrl: () => string | null
}

const NavHistoryContext = createContext<NavHistoryContextValue>({ getBackUrl: () => null })

export function NavHistoryProvider({ children }: { children: ReactNode }) {
  const pathname = usePathname()
  const searchParams = useSearchParams()

  useEffect(() => {
    if (typeof window === 'undefined') return
    const q = searchParams.toString()
    const fullPath = pathname + (q ? `?${q}` : '')
    if (isFormUrl(pathname)) return
    const stack = readStack()
    // Dedupe directe dubbels (zelfde pagina refresh of client-update)
    if (stack[stack.length - 1] === fullPath) return
    stack.push(fullPath)
    while (stack.length > MAX_STACK) stack.shift()
    writeStack(stack)
  }, [pathname, searchParams])

  function getBackUrl() {
    const stack = readStack()
    return stack.length > 0 ? stack[stack.length - 1] : null
  }

  return <NavHistoryContext.Provider value={{ getBackUrl }}>{children}</NavHistoryContext.Provider>
}

export function useNavHistory() {
  return useContext(NavHistoryContext)
}
