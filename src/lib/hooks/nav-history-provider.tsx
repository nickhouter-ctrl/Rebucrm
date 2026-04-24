'use client'

import { createContext, useContext, useEffect, useRef, ReactNode } from 'react'
import { usePathname, useSearchParams } from 'next/navigation'

/**
 * Houdt een interne stack van bezochte URLs bij zodat form-pagina's na
 * opslaan/verwijderen terug kunnen naar de pagina waar de gebruiker ECHT
 * vandaan kwam. `document.referrer` werkt niet voor Next.js client-side
 * navigatie — die updatet alleen bij een echte page-reload.
 *
 * "Form"-pagina's (detail/edit/nieuw schermen) willen we overslaan zodat
 * een keten X → offerte/abc → nieuwe-versie alsnog X als back-target geeft.
 */
const NAV_IGNORE_PATTERNS: RegExp[] = [
  /^\/taken\/[^/]+\/?$/,
  /^\/offertes\/[^/]+\/?/,
  /^\/facturatie\/[^/]+\/?/,
  /^\/projecten\/[^/]+\/?/,
  /^\/offertes\/orders\/[^/]+\/?/,
  /^\/producten\/[^/]+\/?/,
  /^\/faalkosten\/[^/]+\/?/,
  /^\/medewerkers\/[^/]+\/?/,
  /^\/leads\/[^/]+\/?/,
]

function isFormUrl(pathname: string) {
  return NAV_IGNORE_PATTERNS.some(p => p.test(pathname))
}

interface NavHistoryContextValue {
  // Laatste URL vóór de huidige form-pagina. Null als onbekend.
  getBackUrl: () => string | null
}

const NavHistoryContext = createContext<NavHistoryContextValue>({ getBackUrl: () => null })

export function NavHistoryProvider({ children }: { children: ReactNode }) {
  const pathname = usePathname()
  const searchParams = useSearchParams()
  // Stack van laatste 'niet-form' URLs. Alleen pagina's die geen
  // detail/edit-schermen zijn worden opgeslagen — zo hop je voorbij
  // tussenliggende form-pagina's heen naar de echte herkomst.
  const historyRef = useRef<string[]>([])
  const lastPathRef = useRef<string>('')

  useEffect(() => {
    if (typeof window === 'undefined') return
    const q = searchParams.toString()
    const fullPath = pathname + (q ? `?${q}` : '')
    if (fullPath === lastPathRef.current) return
    lastPathRef.current = fullPath
    if (!isFormUrl(pathname)) {
      const hist = historyRef.current
      if (hist[hist.length - 1] !== fullPath) {
        hist.push(fullPath)
        if (hist.length > 30) hist.shift()
      }
    }
  }, [pathname, searchParams])

  function getBackUrl() {
    const hist = historyRef.current
    return hist.length > 0 ? hist[hist.length - 1] : null
  }

  return <NavHistoryContext.Provider value={{ getBackUrl }}>{children}</NavHistoryContext.Provider>
}

export function useNavHistory() {
  return useContext(NavHistoryContext)
}
