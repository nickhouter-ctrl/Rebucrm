'use client'

import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { getNotificaties } from '@/lib/actions'
import { Bell, Mail, FileText, Receipt, Clock, ChevronRight } from 'lucide-react'

interface Item {
  id: string
  type: string
  titel: string
  subtitle?: string
  href?: string
  datum: string
  nieuw?: boolean
}

const ICONS: Record<string, React.ComponentType<{ className?: string }>> = {
  bericht: Mail,
  offerte_akkoord: FileText,
  factuur_betaald: Receipt,
  taak_deadline: Clock,
}

const COLORS: Record<string, string> = {
  bericht: 'text-purple-600',
  offerte_akkoord: 'text-amber-600',
  factuur_betaald: 'text-green-600',
  taak_deadline: 'text-red-600',
}

function relativeTime(d: string): string {
  const diff = (Date.now() - new Date(d).getTime()) / 1000
  if (diff < 60) return 'zojuist'
  if (diff < 3600) return `${Math.floor(diff / 60)}m`
  if (diff < 86400) return `${Math.floor(diff / 3600)}u`
  if (diff < 86400 * 7) return `${Math.floor(diff / 86400)}d`
  return new Date(d).toLocaleDateString('nl-NL', { day: '2-digit', month: 'short' })
}

// Bell-icoon in header met dropdown van recente notificaties.
// Pollt elke 60s op nieuwe items + triggert browser-notificatie bij nieuwe
// items (vereist permission, één keer gevraagd op eerste render).
export function NotificationBell() {
  const [open, setOpen] = useState(false)
  const [items, setItems] = useState<Item[]>([])
  const [ongelezen, setOngelezen] = useState(0)
  const containerRef = useRef<HTMLDivElement>(null)
  // Bewaar gezien-IDs in sessionStorage zodat een herhaalde poll niet
  // dezelfde notificatie opnieuw toont, zelfs niet na refresh.
  const seenRef = useRef<Set<string>>(new Set())

  async function fetchData() {
    try {
      const data = await getNotificaties()
      const nieuweItems = data.items as Item[]

      // Eerste fetch: alle bestaande items markeren als 'gezien' zodat we
      // niet onmiddellijk een storm aan notificaties triggeren.
      if (seenRef.current.size === 0) {
        for (const it of nieuweItems) seenRef.current.add(it.id)
      } else if (typeof window !== 'undefined' && 'Notification' in window && Notification.permission === 'granted') {
        for (const it of nieuweItems) {
          if (!seenRef.current.has(it.id) && it.nieuw) {
            try {
              new Notification(it.titel, {
                body: it.subtitle || '',
                tag: it.id,
                icon: '/images/logo-rebu.png',
              })
            } catch { /* sommige browsers blokkeren dit in onbekende contexten */ }
          }
          seenRef.current.add(it.id)
        }
      }

      setItems(nieuweItems)
      setOngelezen(data.ongelezen)
    } catch { /* niet kritiek */ }
  }

  useEffect(() => {
    // Vraag éénmalig om permission — non-blocking, klant kan deny zonder gevolg.
    if (typeof window !== 'undefined' && 'Notification' in window && Notification.permission === 'default') {
      Notification.requestPermission().catch(() => {})
    }
    fetchData()
    const interval = setInterval(fetchData, 60_000)
    return () => clearInterval(interval)
  }, [])

  useEffect(() => {
    if (!open) return
    function onClick(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onClick)
    return () => document.removeEventListener('mousedown', onClick)
  }, [open])

  return (
    <div ref={containerRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        className="p-2 hover:bg-gray-100 rounded text-gray-600 hover:text-gray-900 relative"
        aria-label="Notificaties"
      >
        <Bell className="h-4.5 w-4.5" />
        {ongelezen > 0 && (
          <span className="absolute top-1 right-1 h-4 min-w-4 px-1 bg-red-500 text-white text-[9px] font-medium rounded-full flex items-center justify-center">
            {ongelezen > 9 ? '9+' : ongelezen}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 top-full mt-1 w-80 bg-white border border-gray-200 rounded-lg shadow-lg z-30 overflow-hidden">
          <div className="px-3 py-2 border-b border-gray-100 flex items-center justify-between">
            <span className="text-sm font-semibold text-gray-900">Notificaties</span>
            {items.length > 0 && (
              <span className="text-[10px] text-gray-400">{items.length} recente items</span>
            )}
          </div>
          <div className="max-h-96 overflow-y-auto">
            {items.length === 0 ? (
              <div className="px-4 py-8 text-center text-xs text-gray-400">
                Niets te melden — alle taken op orde.
              </div>
            ) : (
              items.map(it => {
                const Icon = ICONS[it.type] || Bell
                const inner = (
                  <div className={`px-3 py-2 hover:bg-gray-50 flex items-start gap-2 ${it.nieuw ? 'bg-blue-50/40' : ''}`}>
                    <Icon className={`h-3.5 w-3.5 mt-0.5 flex-shrink-0 ${COLORS[it.type] || 'text-gray-500'}`} />
                    <div className="flex-1 min-w-0">
                      <div className="text-xs font-medium text-gray-900 truncate">{it.titel}</div>
                      {it.subtitle && <div className="text-[11px] text-gray-500 truncate">{it.subtitle}</div>}
                      <div className="text-[10px] text-gray-400 mt-0.5">{relativeTime(it.datum)}</div>
                    </div>
                    {it.href && <ChevronRight className="h-3 w-3 text-gray-300 flex-shrink-0 mt-1" />}
                  </div>
                )
                return it.href ? (
                  <Link
                    key={it.id}
                    href={it.href}
                    onClick={() => setOpen(false)}
                    className="block border-b border-gray-50 last:border-0"
                  >
                    {inner}
                  </Link>
                ) : (
                  <div key={it.id} className="border-b border-gray-50 last:border-0">{inner}</div>
                )
              })
            )}
          </div>
        </div>
      )}
    </div>
  )
}
