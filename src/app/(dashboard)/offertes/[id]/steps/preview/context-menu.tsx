'use client'

import { useEffect, useRef, useState } from 'react'
import { Eye, EyeOff, Trash2, Pencil, Move } from 'lucide-react'

export type CorrectieType = 'verbergen' | 'verwijderen' | 'aanpassen' | 'verplaatsen'

export interface ContextMenuState {
  x: number
  y: number
  target: string
  targetType: 'element' | 'regel' | 'tekening'
}

interface Props {
  state: ContextMenuState | null
  onAction: (type: CorrectieType, target: string, targetType: ContextMenuState['targetType'], detail?: string) => void
  onClose: () => void
}

// Lichtgewicht context-menu dat verschijnt bij rechtermuisklik op een element/regel.
// Gebruiker kan kiezen voor verbergen, verwijderen, aanpassen (met inline input)
// of verplaatsen (met inline target-input). Acties worden naar correcties[] gepusht
// in de parent en pas verwerkt bij "Toepassen" zodat de gebruiker meerdere kan stapelen.
export function PreviewContextMenu({ state, onAction, onClose }: Props) {
  const menuRef = useRef<HTMLDivElement>(null)
  const [editMode, setEditMode] = useState<null | 'aanpassen' | 'verplaatsen'>(null)
  const [editValue, setEditValue] = useState('')

  useEffect(() => {
    setEditMode(null)
    setEditValue('')
  }, [state])

  useEffect(() => {
    if (!state) return
    function onDoc(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) onClose()
    }
    function onEsc(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('mousedown', onDoc)
    document.addEventListener('keydown', onEsc)
    return () => {
      document.removeEventListener('mousedown', onDoc)
      document.removeEventListener('keydown', onEsc)
    }
  }, [state, onClose])

  if (!state) return null

  function fire(type: CorrectieType, detail?: string) {
    onAction(type, state!.target, state!.targetType, detail)
    onClose()
  }

  function submitEdit() {
    if (!editMode) return
    if (!editValue.trim()) return
    fire(editMode, editValue.trim())
  }

  // Adjust position so menu stays in viewport
  const menuStyle: React.CSSProperties = {
    position: 'fixed',
    top: state.y,
    left: state.x,
    zIndex: 1000,
    minWidth: 200,
  }

  return (
    <div
      ref={menuRef}
      style={menuStyle}
      className="bg-white border border-gray-200 rounded-lg shadow-lg py-1 text-sm"
      onClick={(e) => e.stopPropagation()}
    >
      <div className="px-3 py-1.5 text-[11px] uppercase tracking-wide text-gray-400 border-b border-gray-100">
        {state.targetType}: {state.target.length > 30 ? state.target.slice(0, 30) + '…' : state.target}
      </div>

      {!editMode && (
        <div>
          <MenuButton icon={<EyeOff className="h-3.5 w-3.5" />} label="Verbergen" onClick={() => fire('verbergen')} />
          <MenuButton icon={<Trash2 className="h-3.5 w-3.5 text-red-500" />} label="Verwijderen" onClick={() => fire('verwijderen')} />
          <MenuButton icon={<Pencil className="h-3.5 w-3.5" />} label="Aanpassen naar…" onClick={() => { setEditMode('aanpassen'); setEditValue('') }} />
          <MenuButton icon={<Move className="h-3.5 w-3.5" />} label="Verplaatsen naar…" onClick={() => { setEditMode('verplaatsen'); setEditValue('') }} />
        </div>
      )}

      {editMode && (
        <div className="px-3 py-2 space-y-2">
          <label className="block text-[11px] text-gray-500">
            {editMode === 'aanpassen' ? 'Nieuwe waarde (bv. nieuwe prijs of marge%)' : 'Verplaats naar (bv. positie 3, of pagina 2)'}
          </label>
          <input
            type="text"
            autoFocus
            value={editValue}
            onChange={(e) => setEditValue(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') submitEdit() }}
            className="w-full px-2 py-1 text-sm border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-primary"
          />
          <div className="flex justify-end gap-1.5">
            <button type="button" onClick={() => setEditMode(null)} className="text-xs text-gray-500 hover:text-gray-700 px-2 py-1">Annuleren</button>
            <button type="button" onClick={submitEdit} className="text-xs bg-primary text-white rounded px-2 py-1 hover:opacity-90">OK</button>
          </div>
        </div>
      )}
    </div>
  )
}

function MenuButton({ icon, label, onClick }: { icon: React.ReactNode; label: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="w-full flex items-center gap-2 px-3 py-1.5 hover:bg-gray-100 text-left text-gray-700"
    >
      {icon}
      <span>{label}</span>
    </button>
  )
}

// Voor visuele highlight op rechts: laat zien welke items aan de correctie-stack zijn toegevoegd
export function CorrectieBadge({ type }: { type: CorrectieType }) {
  const bg = type === 'verbergen' ? 'bg-amber-100 text-amber-700'
    : type === 'verwijderen' ? 'bg-red-100 text-red-700'
    : type === 'aanpassen' ? 'bg-blue-100 text-blue-700'
    : 'bg-purple-100 text-purple-700'
  const Icon = type === 'verbergen' ? EyeOff : type === 'verwijderen' ? Trash2 : type === 'aanpassen' ? Pencil : Move
  return (
    <span className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-medium ${bg}`}>
      <Icon className="h-2.5 w-2.5" />
      {type}
    </span>
  )
}

// Re-export voor backward-compat
export { Eye }
