'use client'

import { useState, useRef, useEffect, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Search, Users, FileText, FolderKanban, CheckSquare, Mail, Phone, Clock } from 'lucide-react'
import { globalSearch } from '@/lib/actions'
import { getRecentVisits, type RecentVisit } from '@/lib/recent-visits'

interface SearchResults {
  relaties: { id: string; bedrijfsnaam: string; contactpersoon: string | null; plaats: string | null; email: string | null; telefoon: string | null }[]
  offertes: { id: string; offertenummer: string; onderwerp: string | null; status: string; relatie: { bedrijfsnaam: string } | null }[]
  projecten: { id: string; naam: string; status: string; relatie: { bedrijfsnaam: string } | null }[]
}

const TYPE_LABEL: Record<RecentVisit['type'], string> = {
  klant: 'Klant',
  taak: 'Taak',
  offerte: 'Offerte',
  verkoopkans: 'Verkoopkans',
}

const TYPE_ICON: Record<RecentVisit['type'], typeof Users> = {
  klant: Users,
  taak: CheckSquare,
  offerte: FileText,
  verkoopkans: FolderKanban,
}

export function SearchBar() {
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<SearchResults>({ relaties: [], offertes: [], projecten: [] })
  const [open, setOpen] = useState(false)
  const [recents, setRecents] = useState<RecentVisit[]>([])
  const [, startTransition] = useTransition()
  const [activeIndex, setActiveIndex] = useState(-1)
  const debounceRef = useRef<NodeJS.Timeout>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const router = useRouter()

  useEffect(() => {
    setRecents(getRecentVisits())
    function onUpdate() { setRecents(getRecentVisits()) }
    window.addEventListener('rebu:recent-visits-updated', onUpdate)
    return () => window.removeEventListener('rebu:recent-visits-updated', onUpdate)
  }, [])

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  useEffect(() => {
    function handleShortcut(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault()
        inputRef.current?.focus()
      }
    }
    document.addEventListener('keydown', handleShortcut)
    return () => document.removeEventListener('keydown', handleShortcut)
  }, [])

  function handleChange(value: string) {
    setQuery(value)
    if (debounceRef.current) clearTimeout(debounceRef.current)
    if (value.trim().length < 2) {
      setResults({ relaties: [], offertes: [], projecten: [] })
      setOpen(recents.length > 0)
      return
    }
    debounceRef.current = setTimeout(() => {
      startTransition(async () => {
        const res = await globalSearch(value)
        setResults(res as unknown as SearchResults)
        const hasResults = res.relaties.length > 0 || res.offertes.length > 0 || res.projecten.length > 0
        setOpen(hasResults)
        setActiveIndex(-1)
      })
    }, 300)
  }

  function navigate(href: string) {
    setOpen(false)
    setQuery('')
    router.push(href)
  }

  const showRecents = query.trim().length < 2 && recents.length > 0

  const allItems = showRecents
    ? recents.map(r => ({ href: r.href }))
    : [
        ...results.relaties.map(r => ({ href: `/relatiebeheer/${r.id}` })),
        ...results.offertes.map(o => ({ href: `/offertes/${o.id}` })),
        ...results.projecten.map(p => ({ href: `/projecten/${p.id}` })),
      ]

  function handleKeyDown(e: React.KeyboardEvent) {
    if (!open) return
    if (e.key === 'ArrowDown') { e.preventDefault(); setActiveIndex(i => Math.min(i + 1, allItems.length - 1)) }
    if (e.key === 'ArrowUp') { e.preventDefault(); setActiveIndex(i => Math.max(i - 1, 0)) }
    if (e.key === 'Enter' && activeIndex >= 0) { e.preventDefault(); navigate(allItems[activeIndex].href) }
    if (e.key === 'Escape') { setOpen(false); inputRef.current?.blur() }
  }

  function formatDeadline(d?: string | null) {
    if (!d) return ''
    try {
      const date = new Date(d)
      return date.toLocaleDateString('nl-NL', { day: '2-digit', month: 'short', year: '2-digit' }) + (d.length > 10 ? ` ${d.slice(11, 16)}` : '')
    } catch { return d }
  }

  return (
    <div ref={containerRef} className="relative w-full max-w-md">
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
        <input
          ref={inputRef}
          type="text"
          placeholder="Zoeken... (⌘K)"
          value={query}
          onChange={e => handleChange(e.target.value)}
          onKeyDown={handleKeyDown}
          onFocus={() => {
            if (query.trim().length < 2 && recents.length > 0) setOpen(true)
            else if (allItems.length > 0) setOpen(true)
          }}
          className="w-full pl-9 pr-4 py-1.5 bg-gray-50 border border-gray-200 rounded-lg text-sm placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent focus:bg-white transition-colors"
        />
      </div>

      {open && (
        <div className="absolute top-full mt-1 w-full bg-white border border-gray-200 rounded-lg shadow-lg z-50 overflow-hidden max-h-[28rem] overflow-y-auto">
          {showRecents ? (
            <div>
              <div className="px-3 py-1.5 text-xs font-semibold text-gray-500 bg-gray-50 flex items-center gap-1.5 uppercase tracking-wide">
                <Clock className="h-3 w-3" /> Recent bezocht
              </div>
              {recents.map((r, i) => {
                const Icon = TYPE_ICON[r.type]
                const isTaakVerlopen = r.type === 'taak' && r.deadline && new Date(r.deadline) < new Date()
                return (
                  <button
                    key={`${r.type}-${r.id}`}
                    onClick={() => navigate(r.href)}
                    className={`w-full text-left px-3 py-2.5 text-sm hover:bg-gray-50 border-b border-gray-100 last:border-0 ${activeIndex === i ? 'bg-gray-50' : ''}`}
                  >
                    <p className="text-[11px] text-gray-400 mb-0.5">{TYPE_LABEL[r.type]}</p>
                    <div className="flex items-start gap-2">
                      <div className={`h-7 w-7 rounded-full flex items-center justify-center text-xs font-semibold shrink-0 ${
                        r.type === 'klant' ? 'bg-blue-100 text-blue-700' :
                        r.type === 'taak' ? 'bg-emerald-50 text-emerald-600' :
                        r.type === 'offerte' ? 'bg-amber-50 text-amber-700' :
                        'bg-violet-50 text-violet-700'
                      }`}>
                        {r.type === 'klant' ? (r.label[0] || '?').toUpperCase() : <Icon className="h-3.5 w-3.5" />}
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="font-medium text-gray-900 truncate">{r.label}</p>
                        {r.sub && <p className="text-xs text-gray-500 truncate">{r.sub}</p>}
                        <div className="flex items-center gap-3 mt-1 flex-wrap text-[11px] text-gray-500">
                          {r.email && <span className="inline-flex items-center gap-1"><Mail className="h-3 w-3" />{r.email}</span>}
                          {r.telefoon && <span className="inline-flex items-center gap-1"><Phone className="h-3 w-3" />{r.telefoon}</span>}
                          {r.deadline && (
                            <span className={`inline-flex items-center gap-1 ${isTaakVerlopen ? 'text-red-600' : 'text-amber-700'}`}>
                              <Clock className="h-3 w-3" />{formatDeadline(r.deadline)}
                            </span>
                          )}
                          {typeof r.bedrag === 'number' && (
                            <span className="inline-flex items-center px-1.5 py-0.5 rounded bg-emerald-50 text-emerald-700 font-medium">
                              € {r.bedrag.toLocaleString('nl-NL', { minimumFractionDigits: 2 })}
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                  </button>
                )
              })}
            </div>
          ) : (
            <>
              {results.relaties.length > 0 && (
                <div>
                  <div className="px-3 py-1.5 text-xs font-semibold text-gray-500 bg-gray-50 flex items-center gap-1.5">
                    <Users className="h-3 w-3" /> Klanten
                  </div>
                  {results.relaties.map((r, i) => (
                    <button
                      key={r.id}
                      onClick={() => navigate(`/relatiebeheer/${r.id}`)}
                      className={`w-full text-left px-3 py-2 text-sm hover:bg-blue-50 ${activeIndex === i ? 'bg-blue-50' : ''}`}
                    >
                      <p className="font-medium text-gray-900">{r.bedrijfsnaam}</p>
                      {(r.contactpersoon || r.plaats) && (
                        <p className="text-xs text-gray-500">{[r.contactpersoon, r.plaats].filter(Boolean).join(' · ')}</p>
                      )}
                      {(r.email || r.telefoon) && (
                        <div className="flex items-center gap-3 mt-0.5 text-[11px] text-gray-500">
                          {r.email && <span className="inline-flex items-center gap-1"><Mail className="h-3 w-3" />{r.email}</span>}
                          {r.telefoon && <span className="inline-flex items-center gap-1"><Phone className="h-3 w-3" />{r.telefoon}</span>}
                        </div>
                      )}
                    </button>
                  ))}
                </div>
              )}
              {results.offertes.length > 0 && (
                <div>
                  <div className="px-3 py-1.5 text-xs font-semibold text-gray-500 bg-gray-50 flex items-center gap-1.5">
                    <FileText className="h-3 w-3" /> Offertes
                  </div>
                  {results.offertes.map((o, i) => {
                    const idx = results.relaties.length + i
                    return (
                      <button
                        key={o.id}
                        onClick={() => navigate(`/offertes/${o.id}`)}
                        className={`w-full text-left px-3 py-2 text-sm hover:bg-blue-50 ${activeIndex === idx ? 'bg-blue-50' : ''}`}
                      >
                        <p className="font-medium text-gray-900">{o.offertenummer}</p>
                        <p className="text-xs text-gray-500">{o.onderwerp || o.relatie?.bedrijfsnaam || ''}</p>
                      </button>
                    )
                  })}
                </div>
              )}
              {results.projecten.length > 0 && (
                <div>
                  <div className="px-3 py-1.5 text-xs font-semibold text-gray-500 bg-gray-50 flex items-center gap-1.5">
                    <FolderKanban className="h-3 w-3" /> Projecten
                  </div>
                  {results.projecten.map((p, i) => {
                    const idx = results.relaties.length + results.offertes.length + i
                    return (
                      <button
                        key={p.id}
                        onClick={() => navigate(`/projecten/${p.id}`)}
                        className={`w-full text-left px-3 py-2 text-sm hover:bg-blue-50 ${activeIndex === idx ? 'bg-blue-50' : ''}`}
                      >
                        <p className="font-medium text-gray-900">{p.naam}</p>
                        <p className="text-xs text-gray-500">{p.relatie?.bedrijfsnaam || ''}</p>
                      </button>
                    )
                  })}
                </div>
              )}
            </>
          )}
        </div>
      )}
    </div>
  )
}
