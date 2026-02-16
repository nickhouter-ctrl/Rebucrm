'use client'

import { useState, useRef, useEffect, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Search, Users, FileText, FolderKanban } from 'lucide-react'
import { globalSearch } from '@/lib/actions'

interface SearchResults {
  relaties: { id: string; bedrijfsnaam: string; contactpersoon: string | null; plaats: string | null }[]
  offertes: { id: string; offertenummer: string; onderwerp: string | null; status: string; relatie: { bedrijfsnaam: string } | null }[]
  projecten: { id: string; naam: string; status: string; relatie: { bedrijfsnaam: string } | null }[]
}

export function SearchBar() {
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<SearchResults>({ relaties: [], offertes: [], projecten: [] })
  const [open, setOpen] = useState(false)
  const [isPending, startTransition] = useTransition()
  const [activeIndex, setActiveIndex] = useState(-1)
  const debounceRef = useRef<NodeJS.Timeout>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const router = useRouter()

  // Close on click outside
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  // Cmd+K shortcut
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
      setOpen(false)
      return
    }
    debounceRef.current = setTimeout(() => {
      startTransition(async () => {
        const res = await globalSearch(value)
        setResults(res)
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

  const allItems = [
    ...results.relaties.map(r => ({ href: `/relatiebeheer/${r.id}`, label: r.bedrijfsnaam, sub: r.plaats, type: 'klanten' })),
    ...results.offertes.map(o => ({ href: `/offertes/${o.id}`, label: o.offertenummer, sub: o.onderwerp || o.relatie?.bedrijfsnaam, type: 'offertes' })),
    ...results.projecten.map(p => ({ href: `/projecten/${p.id}`, label: p.naam, sub: p.relatie?.bedrijfsnaam, type: 'projecten' })),
  ]

  function handleKeyDown(e: React.KeyboardEvent) {
    if (!open) return
    if (e.key === 'ArrowDown') { e.preventDefault(); setActiveIndex(i => Math.min(i + 1, allItems.length - 1)) }
    if (e.key === 'ArrowUp') { e.preventDefault(); setActiveIndex(i => Math.max(i - 1, 0)) }
    if (e.key === 'Enter' && activeIndex >= 0) { e.preventDefault(); navigate(allItems[activeIndex].href) }
    if (e.key === 'Escape') { setOpen(false); inputRef.current?.blur() }
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
          onFocus={() => { if (allItems.length > 0) setOpen(true) }}
          className="w-full pl-9 pr-4 py-1.5 bg-gray-50 border border-gray-200 rounded-lg text-sm placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent focus:bg-white transition-colors"
        />
      </div>

      {open && (
        <div className="absolute top-full mt-1 w-full bg-white border border-gray-200 rounded-lg shadow-lg z-50 overflow-hidden max-h-80 overflow-y-auto">
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
        </div>
      )}
    </div>
  )
}
