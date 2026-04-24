'use client'

import { useEffect, useRef } from 'react'
import { useRouter } from 'next/navigation'

/**
 * Onthoud de pagina waar de gebruiker vandaan kwam (document.referrer bij mount)
 * zodat we na opslaan/verwijderen daarheen kunnen navigeren.
 *
 * We gebruiken BEWUST geen sessionStorage: dat zorgt voor stale hergebruik
 * tussen verschillende instanties (bv. "nieuwe" taken of nieuwe offerte-versies
 * die dezelfde key deelden), waardoor je bij iemand anders uitkwam.
 *
 * Gevolg: page-refresh halverwege het bewerken resette de back-url. Dat is
 * acceptabel — in dat geval valt navigateBack terug op de fallback.
 */
export function useBackNav(_key: string) {
  const router = useRouter()
  const backUrlRef = useRef<string | null>(null)

  useEffect(() => {
    if (typeof window === 'undefined') return
    const ref = document.referrer
    if (!ref) return
    try {
      const url = new URL(ref)
      if (url.origin !== window.location.origin) return
      const currentPath = window.location.pathname + window.location.search
      const refPath = url.pathname + url.search
      if (refPath === currentPath) return
      // Nooit teruggaan naar een "nieuw" pagina — daar komt de gebruiker nooit
      // heen willen.
      if (url.pathname.endsWith('/nieuw')) return
      backUrlRef.current = refPath
    } catch { /* ignore */ }
  }, [])

  function navigateBack(fallback: string) {
    if (typeof window !== 'undefined' && backUrlRef.current) {
      router.push(backUrlRef.current)
      return
    }
    router.push(fallback)
  }

  return { navigateBack }
}
