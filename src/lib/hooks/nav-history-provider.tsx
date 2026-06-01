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
 *
 * Daarnaast bewaart de provider de SCROLLPOSITIE van elke lijst-pagina. Een
 * `router.push` (gebruikt door de terug-knop) scrollt namelijk altijd naar
 * boven. Door de positie te onthouden en na een gemarkeerde terug-navigatie
 * te herstellen, beland je weer op exact dezelfde plek in een lange lijst —
 * je hoeft je relatie/taak niet opnieuw te zoeken.
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
const SCROLL_PREFIX = 'nav-scroll:'
const RESTORE_KEY = 'nav-restore-scroll'
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
  /** Markeer een URL zodat de scrollpositie wordt hersteld zodra die pagina rendert. */
  markScrollRestore: (url: string) => void
}

const NavHistoryContext = createContext<NavHistoryContextValue>({
  getBackUrl: () => null,
  markScrollRestore: () => {},
})

export function NavHistoryProvider({ children }: { children: ReactNode }) {
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const q = searchParams.toString()
  const fullPath = pathname + (q ? `?${q}` : '')

  // Stack bijhouden van bezochte niet-form pagina's.
  useEffect(() => {
    if (typeof window === 'undefined') return
    if (isFormUrl(pathname)) return
    const stack = readStack()
    // Dedupe directe dubbels (zelfde pagina refresh of client-update)
    if (stack[stack.length - 1] === fullPath) return
    stack.push(fullPath)
    while (stack.length > MAX_STACK) stack.shift()
    writeStack(stack)
  }, [pathname, fullPath])

  // Scrollpositie van de huidige lijst-pagina continu bewaren (rAF-gethrottled).
  useEffect(() => {
    if (typeof window === 'undefined') return
    if (isFormUrl(pathname)) return
    let raf = 0
    const onScroll = () => {
      if (raf) return
      raf = requestAnimationFrame(() => {
        raf = 0
        try { sessionStorage.setItem(SCROLL_PREFIX + fullPath, String(window.scrollY)) } catch { /* quota */ }
      })
    }
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => {
      window.removeEventListener('scroll', onScroll)
      if (raf) cancelAnimationFrame(raf)
    }
  }, [pathname, fullPath])

  // Na een gemarkeerde terug-navigatie de scrollpositie herstellen. Blijft een
  // paar frames proberen tot de lijst-content hoog genoeg is (async data).
  useEffect(() => {
    if (typeof window === 'undefined') return
    let target: string | null = null
    try { target = sessionStorage.getItem(RESTORE_KEY) } catch { /* ignore */ }
    if (target !== fullPath) return
    try { sessionStorage.removeItem(RESTORE_KEY) } catch { /* ignore */ }
    let y = 0
    try { y = Number(sessionStorage.getItem(SCROLL_PREFIX + fullPath) || '0') } catch { /* ignore */ }
    if (!y) return
    let tries = 0
    const tick = () => {
      window.scrollTo(0, y)
      if (Math.abs(window.scrollY - y) > 2 && tries++ < 30) requestAnimationFrame(tick)
    }
    requestAnimationFrame(tick)
  }, [pathname, fullPath])

  function getBackUrl() {
    const stack = readStack()
    return stack.length > 0 ? stack[stack.length - 1] : null
  }

  function markScrollRestore(url: string) {
    try { sessionStorage.setItem(RESTORE_KEY, url) } catch { /* ignore */ }
  }

  return (
    <NavHistoryContext.Provider value={{ getBackUrl, markScrollRestore }}>
      {children}
    </NavHistoryContext.Provider>
  )
}

export function useNavHistory() {
  return useContext(NavHistoryContext)
}
