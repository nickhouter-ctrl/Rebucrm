'use client'

import { useEffect, useRef } from 'react'
import { Bold, Italic, Underline, List, Palette, Type } from 'lucide-react'

/**
 * Minimale rich-text editor op basis van contenteditable + document.execCommand.
 * Ondersteunt: bold, italic, underline, kleur, lettergrootte, bullet-lijst.
 * Waarde is HTML (`<p>...`-georiënteerd). Bij eerste render injecteren we de
 * initialValue; daarna houden we de DOM authoritative om cursor-positie niet te
 * verliezen tussen toetsaanslagen.
 */
export function RichTextEditor({
  value,
  onChange,
  placeholder,
  minHeight = 220,
}: {
  value: string
  onChange: (html: string) => void
  placeholder?: string
  minHeight?: number
}) {
  const editorRef = useRef<HTMLDivElement>(null)
  const initializedRef = useRef(false)

  useEffect(() => {
    if (initializedRef.current) return
    if (editorRef.current) {
      editorRef.current.innerHTML = value || ''
      initializedRef.current = true
    }
  }, [value])

  function exec(command: string, arg?: string) {
    editorRef.current?.focus()
    document.execCommand(command, false, arg)
    if (editorRef.current) onChange(editorRef.current.innerHTML)
  }

  function handleInput() {
    if (editorRef.current) onChange(editorRef.current.innerHTML)
  }

  function handleColor(e: React.ChangeEvent<HTMLInputElement>) {
    exec('foreColor', e.target.value)
  }

  function handleFontSize(e: React.ChangeEvent<HTMLSelectElement>) {
    exec('fontSize', e.target.value)
  }

  function handleFontName(e: React.ChangeEvent<HTMLSelectElement>) {
    exec('fontName', e.target.value)
  }

  return (
    <div className="border border-gray-300 rounded-md overflow-hidden focus-within:ring-2 focus-within:ring-primary focus-within:border-transparent bg-white">
      <div className="flex items-center gap-1 px-2 py-1.5 border-b border-gray-200 bg-gray-50 flex-wrap">
        <button type="button" onMouseDown={e => e.preventDefault()} onClick={() => exec('bold')} className="p-1.5 hover:bg-gray-200 rounded text-gray-700" title="Vet">
          <Bold className="h-3.5 w-3.5" />
        </button>
        <button type="button" onMouseDown={e => e.preventDefault()} onClick={() => exec('italic')} className="p-1.5 hover:bg-gray-200 rounded text-gray-700" title="Schuin">
          <Italic className="h-3.5 w-3.5" />
        </button>
        <button type="button" onMouseDown={e => e.preventDefault()} onClick={() => exec('underline')} className="p-1.5 hover:bg-gray-200 rounded text-gray-700" title="Onderstreept">
          <Underline className="h-3.5 w-3.5" />
        </button>
        <button type="button" onMouseDown={e => e.preventDefault()} onClick={() => exec('insertUnorderedList')} className="p-1.5 hover:bg-gray-200 rounded text-gray-700" title="Lijst">
          <List className="h-3.5 w-3.5" />
        </button>
        <div className="w-px h-5 bg-gray-300 mx-1" />
        <label className="flex items-center gap-1 px-1.5 py-1 hover:bg-gray-200 rounded cursor-pointer text-gray-700" title="Tekstkleur" onMouseDown={e => e.preventDefault()}>
          <Palette className="h-3.5 w-3.5" />
          <input type="color" onChange={handleColor} className="w-4 h-4 border-0 cursor-pointer" />
        </label>
        <div className="flex items-center gap-1 text-gray-700" onMouseDown={e => e.preventDefault()}>
          <Type className="h-3.5 w-3.5" />
          <select onChange={handleFontSize} defaultValue="" className="text-xs border border-gray-300 rounded px-1 py-0.5 bg-white">
            <option value="" disabled>Grootte</option>
            <option value="1">Klein</option>
            <option value="3">Normaal</option>
            <option value="5">Groot</option>
            <option value="7">Extra groot</option>
          </select>
        </div>
        <select onMouseDown={e => e.preventDefault()} onChange={handleFontName} defaultValue="" className="text-xs border border-gray-300 rounded px-1 py-0.5 bg-white text-gray-700">
          <option value="" disabled>Lettertype</option>
          <option value="Arial, sans-serif">Arial</option>
          <option value="Georgia, serif">Georgia</option>
          <option value="'Helvetica Neue', Helvetica, sans-serif">Helvetica</option>
          <option value="'Times New Roman', Times, serif">Times New Roman</option>
          <option value="'Courier New', monospace">Courier New</option>
          <option value="Verdana, sans-serif">Verdana</option>
        </select>
      </div>
      <div
        ref={editorRef}
        contentEditable
        suppressContentEditableWarning
        onInput={handleInput}
        data-placeholder={placeholder || 'Typ je bericht...'}
        className="px-3 py-3 text-sm outline-none prose prose-sm max-w-none rte-content leading-relaxed"
        style={{ minHeight }}
      />
      <style jsx>{`
        .rte-content:empty:before {
          content: attr(data-placeholder);
          color: #9ca3af;
        }
        .rte-content :global(p) { margin: 0 0 8px 0; }
        .rte-content :global(ul) { padding-left: 20px; margin: 0 0 8px 0; }
        .rte-content :global(ol) { padding-left: 20px; margin: 0 0 8px 0; }
      `}</style>
    </div>
  )
}

// Converteer plain-text met newlines naar HTML met <p> paragraafjes, zodat
// bestaande defaults (plaintext met \n) goed renderen in de editor.
export function plainTextToHtml(text: string): string {
  if (!text) return ''
  // Als er al HTML in staat (bevat <p, <br, <div, <b, <i, <u, <ul, <ol, <span, <font) niet wrappen
  if (/<(p|br|div|b|i|u|ul|ol|span|font|strong|em)\b/i.test(text)) return text
  return text
    .split('\n')
    .map(line => line.trim() === '' ? '<p><br></p>' : `<p>${escapeHtml(line)}</p>`)
    .join('')
}

function escapeHtml(s: string) {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
}
