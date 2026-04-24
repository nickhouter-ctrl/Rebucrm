'use client'

import { useRouter } from 'next/navigation'
import { useNavHistory } from './nav-history-provider'

/**
 * Na opslaan/verwijderen navigeert deze hook naar de meest recente
 * niet-form URL uit de globale NavHistoryProvider stack (sessionStorage).
 *
 * De back-URL wordt op het MOMENT van save gelezen — niet bij mount. Zo
 * krijgt de gebruiker altijd de meest recent bezochte detail/lijst pagina
 * als terug-doel, zonder dat 'n vroeg gesnaphot target vastroest.
 */
export function useBackNav(_key: string) {
  const router = useRouter()
  const nav = useNavHistory()

  function navigateBack(fallback: string) {
    const fromHistory = nav.getBackUrl()
    if (fromHistory) {
      router.push(fromHistory)
      return
    }
    // Fallback op document.referrer voor hard-reloads en externe navigatie
    if (typeof window !== 'undefined') {
      const ref = document.referrer
      if (ref) {
        try {
          const url = new URL(ref)
          const current = window.location.pathname + window.location.search
          const refPath = url.pathname + url.search
          if (url.origin === window.location.origin && refPath !== current && !url.pathname.endsWith('/nieuw')) {
            router.push(refPath)
            return
          }
        } catch { /* ignore */ }
      }
    }
    router.push(fallback)
  }

  return { navigateBack }
}
