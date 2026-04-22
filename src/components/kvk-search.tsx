'use client'

import { useState, useRef, useEffect, useCallback } from 'react'
import { Search, Loader2, Building2, X } from 'lucide-react'

export interface KvkResult {
  kvkNummer: string
  naam: string
  adres: string
  straat?: string
  huisnummer?: string
  postcode: string
  plaats: string
  email?: string
  telefoon?: string
  website?: string
  type: string
}

interface Props {
  onSelect: (result: KvkResult) => void
  placeholder?: string
  label?: string
  className?: string
}

export function KvkSearch({ onSelect, placeholder = 'Zoek op bedrijfsnaam of KVK-nummer...', label = 'KVK zoeken', className = '' }: Props) {
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<KvkResult[]>([])
  const [searching, setSearching] = useState(false)
  const [error, setError] = useState('')
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  const debounceRef = useRef<ReturnType<typeof setTimeout>>(null)

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [])

  const search = useCallback(async (q: string) => {
    if (q.length < 2) { setResults([]); setOpen(false); return }
    setSearching(true); setError('')
    try {
      const res = await fetch(`/api/kvk/search?q=${encodeURIComponent(q)}`)
      const data = await res.json()
      if (data.error) { setError(data.error); setResults([]); setOpen(false) }
      else { setResults(data.results || []); setOpen((data.results || []).length > 0) }
    } catch {
      setResults([])
    } finally {
      setSearching(false)
    }
  }, [])

  function handleInput(v: string) {
    setQuery(v)
    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => search(v), 300)
  }

  async function pick(r: KvkResult) {
    setOpen(false)
    setSearching(true)
    try {
      // Verrijk met contactgegevens uit basisprofiel/hoofdvestiging
      const res = await fetch(`/api/kvk/detail?kvkNummer=${encodeURIComponent(r.kvkNummer)}`)
      if (res.ok) {
        const detail = await res.json()
        onSelect({ ...r, ...detail })
      } else {
        onSelect(r)
      }
    } catch {
      onSelect(r)
    } finally {
      setSearching(false)
    }
    setQuery('')
    setResults([])
  }

  return (
    <div ref={ref} className={`relative ${className}`}>
      {label && <label className="block text-sm font-medium text-gray-700 mb-1">{label}</label>}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400 pointer-events-none" />
        <input
          type="text"
          placeholder={placeholder}
          value={query}
          onChange={e => handleInput(e.target.value)}
          onFocus={() => { if (results.length > 0) setOpen(true) }}
          className="w-full pl-9 pr-10 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent"
        />
        {searching && <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400 animate-spin" />}
        {!searching && query && (
          <button type="button" onClick={() => { setQuery(''); setResults([]); setOpen(false) }} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600">
            <X className="h-4 w-4" />
          </button>
        )}
      </div>
      {error && <p className="mt-1 text-xs text-red-600">{error}</p>}
      {open && results.length > 0 && (
        <div className="absolute z-50 top-full mt-1 w-full bg-white border border-gray-200 rounded-md shadow-lg max-h-72 overflow-y-auto">
          {results.map(r => (
            <button
              key={r.kvkNummer}
              type="button"
              onClick={() => pick(r)}
              className="w-full text-left px-3 py-2 hover:bg-blue-50 border-b border-gray-100 last:border-0"
            >
              <div className="flex items-start gap-2">
                <Building2 className="h-4 w-4 text-gray-400 mt-0.5 shrink-0" />
                <div className="min-w-0 flex-1">
                  <p className="font-medium text-sm text-gray-900 truncate">{r.naam}</p>
                  <p className="text-xs text-gray-500 truncate">
                    KVK {r.kvkNummer}{r.adres ? ` • ${r.adres}` : ''}{r.plaats ? `, ${r.plaats}` : ''}
                  </p>
                </div>
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
