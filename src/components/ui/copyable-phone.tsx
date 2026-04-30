'use client'

import { useState } from 'react'
import { Phone, Copy, Check } from 'lucide-react'

// Klikbaar telefoonnummer dat (a) als `tel:`-link werkt en (b) een
// kopieer-knop heeft die ALLEEN het nummer naar het klembord zet —
// geen omringende SVG-titles, iconen of layout-tekst die Safari soms
// per ongeluk meeneemt bij selecteren.
export function CopyablePhone({
  nummer,
  showIcon = true,
  className = '',
}: {
  nummer: string
  showIcon?: boolean
  className?: string
}) {
  const [copied, setCopied] = useState(false)

  async function handleCopy(e: React.MouseEvent) {
    e.preventDefault()
    e.stopPropagation()
    try {
      await navigator.clipboard.writeText(nummer)
      setCopied(true)
      setTimeout(() => setCopied(false), 1200)
    } catch {
      // fallback: laat bel-link gewoon doorgaan
    }
  }

  return (
    <span className={`inline-flex items-center gap-1.5 ${className}`}>
      <a href={`tel:${nummer}`} className="inline-flex items-center gap-1.5 hover:text-[#00a66e]">
        {showIcon && <Phone className="h-3.5 w-3.5 text-gray-400" aria-hidden="true" />}
        <span>{nummer}</span>
      </a>
      <button
        type="button"
        onClick={handleCopy}
        title={copied ? 'Gekopieerd!' : 'Kopieer nummer'}
        className="text-gray-400 hover:text-gray-700 transition-colors"
      >
        {copied
          ? <Check className="h-3 w-3 text-emerald-600" aria-hidden="true" />
          : <Copy className="h-3 w-3" aria-hidden="true" />}
      </button>
    </span>
  )
}
