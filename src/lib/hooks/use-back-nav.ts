'use client'

import { useEffect, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { useNavHistory } from './nav-history-provider'

/**
 * Na opslaan/verwijderen navigeert deze hook terug naar de pagina waar de
 * gebruiker vandaan kwam. Werkt via een globale NavHistoryProvider die een
 * stack van niet-form URLs bijhoudt (document.referrer is onbetrouwbaar bij
 * Next.js client-side navigatie, en sessionStorage leidde tot stale data
 * tussen verschillende nieuwe entities).
 *
 * Bij mount snapshotten we de huidige back-url zodat navigaties tijdens
 * het bewerken (bv. naar een ander detail-scherm) de target niet beïnvloeden.
 */
export function useBackNav(_key: string) {
  const router = useRouter()
  const nav = useNavHistory()
  const backUrlRef = useRef<string | null>(null)
  const initialized = useRef(false)

  useEffect(() => {
    if (initialized.current) return
    initialized.current = true
    // 1) Probeer globale nav-history (client-side tracked stack)
    const fromHistory = nav.getBackUrl()
    if (fromHistory) { backUrlRef.current = fromHistory; return }
    // 2) Fallback op document.referrer (bij hard-reload of externe opening)
    if (typeof window === 'undefined') return
    const ref = document.referrer
    if (!ref) return
    try {
      const url = new URL(ref)
      if (url.origin !== window.location.origin) return
      const currentPath = window.location.pathname + window.location.search
      const refPath = url.pathname + url.search
      if (refPath === currentPath) return
      if (url.pathname.endsWith('/nieuw')) return
      backUrlRef.current = refPath
    } catch { /* ignore */ }
  }, [nav])

  function navigateBack(fallback: string) {
    if (backUrlRef.current) {
      router.push(backUrlRef.current)
      return
    }
    router.push(fallback)
  }

  return { navigateBack }
}
