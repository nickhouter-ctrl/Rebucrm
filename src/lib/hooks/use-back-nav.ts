'use client'

import { useEffect, useRef } from 'react'
import { useRouter } from 'next/navigation'

/**
 * Onthoud de pagina waar de gebruiker vandaan kwam zodat we na opslaan/verwijderen
 * exact daarheen kunnen navigeren. Slaat op in sessionStorage per `key` zodat de
 * opgeslagen URL blijft werken ook na page-refresh of meerdere saves.
 *
 * router.back() bleek onbetrouwbaar: Next.js pusht soms extra history-entries bij
 * client-side navigatie waardoor je te ver teruggaat.
 */
export function useBackNav(key: string) {
  const router = useRouter()
  const backUrlRef = useRef<string | null>(null)
  const storageKey = `back-nav-${key}`

  useEffect(() => {
    if (typeof window === 'undefined') return
    const stored = sessionStorage.getItem(storageKey)
    if (stored) {
      backUrlRef.current = stored
      return
    }
    const ref = document.referrer
    if (!ref) return
    try {
      const url = new URL(ref)
      if (url.origin !== window.location.origin) return
      const currentPath = window.location.pathname + window.location.search
      const refPath = url.pathname + url.search
      if (refPath === currentPath) return
      backUrlRef.current = refPath
      sessionStorage.setItem(storageKey, refPath)
    } catch {
      // ignore
    }
  }, [storageKey])

  function navigateBack(fallback: string) {
    if (typeof window !== 'undefined' && backUrlRef.current) {
      const target = backUrlRef.current
      sessionStorage.removeItem(storageKey)
      router.push(target)
      return
    }
    router.push(fallback)
  }

  return { navigateBack }
}
