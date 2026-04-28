'use client'

import { useEffect, useState, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import { Search, ArrowRight, Building2, Receipt, FolderKanban, CheckSquare, Mail, Plus, Hash } from 'lucide-react'
import { cn } from '@/lib/utils'

// Snel-actie command-palette: ⌘K / Ctrl+K
// Toont navigatie + acties + recente klanten/offertes (later uit te breiden)
type Cmd = {
  id: string
  label: string
  hint?: string
  shortcut?: string
  icon?: React.ComponentType<{ className?: string }>
  group: 'navigeer' | 'maak' | 'zoek'
  action: () => void
}

export function CommandPalette() {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [activeIdx, setActiveIdx] = useState(0)

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault()
        setOpen(o => !o)
      }
      if (open && e.key === 'Escape') setOpen(false)
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [open])

  useEffect(() => { if (!open) { setQuery(''); setActiveIdx(0) } }, [open])

  const all: Cmd[] = useMemo(() => [
    // Navigeer
    { id: 'nav-home', label: 'Vandaag (dashboard)', icon: Hash, group: 'navigeer', action: () => router.push('/') },
    { id: 'nav-relaties', label: 'Relaties', icon: Building2, group: 'navigeer', action: () => router.push('/relatiebeheer') },
    { id: 'nav-projecten', label: 'Verkoopkansen', icon: FolderKanban, group: 'navigeer', action: () => router.push('/projecten') },
    { id: 'nav-kanban', label: 'Kanban-pipeline', icon: FolderKanban, group: 'navigeer', action: () => router.push('/projecten/kanban') },
    { id: 'nav-offertes', label: 'Offertes', icon: Receipt, group: 'navigeer', action: () => router.push('/offertes') },
    { id: 'nav-aanvragen', label: 'Aanvragen', icon: Mail, group: 'navigeer', action: () => router.push('/aanvragen') },
    { id: 'nav-facturatie', label: 'Facturatie', icon: Receipt, group: 'navigeer', action: () => router.push('/facturatie') },
    { id: 'nav-taken', label: 'Taken', icon: CheckSquare, group: 'navigeer', action: () => router.push('/taken') },
    { id: 'nav-email', label: 'E-mail inbox', icon: Mail, group: 'navigeer', action: () => router.push('/email') },
    { id: 'nav-agenda', label: 'Agenda', icon: FolderKanban, group: 'navigeer', action: () => router.push('/agenda') },
    // Maak
    { id: 'new-relatie', label: 'Nieuwe relatie', icon: Plus, group: 'maak', action: () => router.push('/relatiebeheer/nieuw') },
    { id: 'new-offerte', label: 'Nieuwe offerte', icon: Plus, group: 'maak', action: () => router.push('/offertes/nieuw') },
    { id: 'new-project', label: 'Nieuwe verkoopkans', icon: Plus, group: 'maak', action: () => router.push('/projecten/nieuw') },
    { id: 'new-factuur', label: 'Nieuwe factuur', icon: Plus, group: 'maak', action: () => router.push('/facturatie/nieuw') },
    { id: 'new-taak', label: 'Nieuwe taak', icon: Plus, group: 'maak', action: () => router.push('/taken/nieuw') },
  ], [router])

  const filtered = useMemo(() => {
    const q = query.toLowerCase().trim()
    if (!q) return all
    return all.filter(c => c.label.toLowerCase().includes(q))
  }, [query, all])

  const grouped = useMemo(() => {
    const m = new Map<string, Cmd[]>()
    for (const c of filtered) {
      const arr = m.get(c.group) || []
      arr.push(c)
      m.set(c.group, arr)
    }
    return m
  }, [filtered])

  function execute(idx: number) {
    const cmd = filtered[idx]
    if (!cmd) return
    cmd.action()
    setOpen(false)
  }

  if (!open) return null

  return (
    <div
      className="fixed inset-0 z-[100] flex items-start justify-center pt-[10vh] px-4 bg-black/40"
      onClick={() => setOpen(false)}
      onKeyDown={(e) => {
        if (e.key === 'ArrowDown') { e.preventDefault(); setActiveIdx(i => Math.min(filtered.length - 1, i + 1)) }
        if (e.key === 'ArrowUp')   { e.preventDefault(); setActiveIdx(i => Math.max(0, i - 1)) }
        if (e.key === 'Enter')     { e.preventDefault(); execute(activeIdx) }
      }}
    >
      <div
        className="w-full max-w-xl bg-white rounded-xl shadow-2xl overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-2 px-4 py-3 border-b border-gray-200">
          <Search className="h-4 w-4 text-gray-400" />
          <input
            type="text"
            autoFocus
            value={query}
            onChange={(e) => { setQuery(e.target.value); setActiveIdx(0) }}
            placeholder="Zoek of navigeer…"
            className="flex-1 outline-none text-sm"
            onKeyDown={(e) => {
              if (e.key === 'ArrowDown') { e.preventDefault(); setActiveIdx(i => Math.min(filtered.length - 1, i + 1)) }
              if (e.key === 'ArrowUp')   { e.preventDefault(); setActiveIdx(i => Math.max(0, i - 1)) }
              if (e.key === 'Enter')     { e.preventDefault(); execute(activeIdx) }
            }}
          />
          <span className="text-[10px] text-gray-400 bg-gray-100 px-1.5 py-0.5 rounded">esc</span>
        </div>
        <div className="max-h-[400px] overflow-y-auto py-1">
          {filtered.length === 0 ? (
            <div className="px-4 py-6 text-sm text-gray-400 text-center">Geen resultaten</div>
          ) : (
            <>
              {(['navigeer', 'maak', 'zoek'] as const).map(g => {
                const list = grouped.get(g)
                if (!list || list.length === 0) return null
                return (
                  <div key={g} className="mb-1">
                    <div className="px-4 py-1 text-[10px] uppercase tracking-wider text-gray-400 font-semibold">{g}</div>
                    {list.map((cmd) => {
                      const idx = filtered.indexOf(cmd)
                      const isActive = idx === activeIdx
                      const Icon = cmd.icon || ArrowRight
                      return (
                        <button
                          key={cmd.id}
                          onClick={() => execute(idx)}
                          onMouseEnter={() => setActiveIdx(idx)}
                          className={cn(
                            'w-full text-left px-4 py-2 text-sm flex items-center gap-2 transition-colors',
                            isActive ? 'bg-blue-50 text-blue-900' : 'text-gray-700 hover:bg-gray-50',
                          )}
                        >
                          <Icon className="h-3.5 w-3.5 text-gray-500" />
                          <span className="flex-1">{cmd.label}</span>
                          {cmd.hint && <span className="text-xs text-gray-400">{cmd.hint}</span>}
                        </button>
                      )
                    })}
                  </div>
                )
              })}
            </>
          )}
        </div>
        <div className="px-4 py-2 border-t border-gray-100 flex items-center justify-between text-[10px] text-gray-400">
          <span>↑↓ navigeren · ↵ kiezen</span>
          <span>⌘K / Ctrl+K openen</span>
        </div>
      </div>
    </div>
  )
}
