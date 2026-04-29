'use client'

import { useEffect, useRef, useState } from 'react'
import { Sparkles, X, Send, Loader2 } from 'lucide-react'

type Msg = { rol: 'user' | 'assistant'; tekst: string }

const VOORBEELD_VRAGEN = [
  'Hoeveel offertes staan er open?',
  'Welke facturen zijn meer dan 14 dagen vervallen?',
  'Wat was de omzet in maart 2026?',
  'Welke klanten hebben offertes boven €20.000?',
  'Hoeveel aanvragen kwamen er deze maand binnen?',
]

export function VraagAanRebu() {
  const [open, setOpen] = useState(false)
  const [vraag, setVraag] = useState('')
  const [bezig, setBezig] = useState(false)
  const [berichten, setBerichten] = useState<Msg[]>([])
  const scrollRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight
  }, [berichten, bezig])

  // Sluit met Escape
  useEffect(() => {
    if (!open) return
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open])

  async function sendVraag(tekst: string) {
    if (!tekst.trim() || bezig) return
    const nieuwe: Msg = { rol: 'user', tekst: tekst.trim() }
    const updated = [...berichten, nieuwe]
    setBerichten(updated)
    setVraag('')
    setBezig(true)
    try {
      const res = await fetch('/api/ai/vraag-aan-rebu', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ vraag: tekst.trim(), geschiedenis: berichten.slice(-6) }),
      })
      const data = await res.json()
      if (!res.ok) {
        setBerichten([...updated, { rol: 'assistant', tekst: `Fout: ${data.error || 'onbekend'}` }])
      } else {
        setBerichten([...updated, { rol: 'assistant', tekst: data.antwoord || '(leeg antwoord)' }])
      }
    } catch (e) {
      setBerichten([...updated, { rol: 'assistant', tekst: `Fout: ${e instanceof Error ? e.message : 'netwerk'}` }])
    } finally {
      setBezig(false)
    }
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-gradient-to-r from-[#00a66e] to-[#22d3ae] text-white text-sm font-medium hover:from-[#008f5f] hover:to-[#00a66e] shadow-sm"
        title="Vraag aan Rebu (AI assistent)"
      >
        <Sparkles className="h-3.5 w-3.5" />
        Vraag aan Rebu
      </button>

      {open && (
        <div className="fixed inset-0 z-50 flex justify-end" onClick={(e) => { if (e.target === e.currentTarget) setOpen(false) }}>
          <div className="absolute inset-0 bg-black/40" />
          <div className="relative bg-white w-full max-w-md h-full flex flex-col shadow-2xl">
            <div className="px-4 py-3 border-b border-gray-200 flex items-center justify-between bg-gradient-to-r from-[#00a66e] to-[#22d3ae] text-white">
              <div className="flex items-center gap-2">
                <Sparkles className="h-4 w-4" />
                <h3 className="font-semibold">Vraag aan Rebu</h3>
              </div>
              <button type="button" onClick={() => setOpen(false)} className="p-1 hover:bg-white/20 rounded">
                <X className="h-4 w-4" />
              </button>
            </div>

            <div ref={scrollRef} className="flex-1 overflow-y-auto p-4 space-y-3 bg-gray-50">
              {berichten.length === 0 && (
                <div className="space-y-3">
                  <p className="text-sm text-gray-600">Stel een vraag over je offertes, facturen, klanten, omzet — of probeer een voorbeeld:</p>
                  <div className="space-y-1.5">
                    {VOORBEELD_VRAGEN.map(v => (
                      <button
                        key={v}
                        type="button"
                        onClick={() => sendVraag(v)}
                        className="block w-full text-left px-3 py-2 text-xs bg-white border border-gray-200 rounded-lg hover:border-[#00a66e] hover:bg-green-50 transition-colors"
                      >
                        {v}
                      </button>
                    ))}
                  </div>
                </div>
              )}
              {berichten.map((m, i) => (
                <div key={i} className={`flex ${m.rol === 'user' ? 'justify-end' : 'justify-start'}`}>
                  <div
                    className={`max-w-[85%] px-3 py-2 rounded-lg text-sm whitespace-pre-wrap ${
                      m.rol === 'user'
                        ? 'bg-[#00a66e] text-white rounded-br-sm'
                        : 'bg-white border border-gray-200 text-gray-800 rounded-bl-sm'
                    }`}
                    // markdown-light: bold + code via simpele replace
                    dangerouslySetInnerHTML={m.rol === 'assistant' ? {
                      __html: m.tekst
                        .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
                        .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
                        .replace(/`([^`]+)`/g, '<code class="bg-gray-100 px-1 py-0.5 rounded text-xs">$1</code>')
                    } : undefined}
                  >
                    {m.rol === 'user' ? m.tekst : null}
                  </div>
                </div>
              ))}
              {bezig && (
                <div className="flex justify-start">
                  <div className="bg-white border border-gray-200 px-3 py-2 rounded-lg flex items-center gap-2 text-sm text-gray-500">
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    Aan het denken…
                  </div>
                </div>
              )}
            </div>

            <form
              className="border-t border-gray-200 p-3 bg-white flex items-center gap-2"
              onSubmit={(e) => { e.preventDefault(); sendVraag(vraag) }}
            >
              <input
                type="text"
                value={vraag}
                onChange={(e) => setVraag(e.target.value)}
                placeholder="Stel je vraag..."
                disabled={bezig}
                className="flex-1 px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#00a66e] focus:border-transparent disabled:bg-gray-50"
              />
              <button
                type="submit"
                disabled={bezig || !vraag.trim()}
                className="p-2 bg-[#00a66e] text-white rounded-lg hover:bg-[#008f5f] disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <Send className="h-4 w-4" />
              </button>
            </form>

            {berichten.length > 0 && (
              <button
                type="button"
                onClick={() => setBerichten([])}
                className="text-xs text-gray-400 hover:text-gray-700 px-3 pb-2"
              >
                Gesprek wissen
              </button>
            )}
          </div>
        </div>
      )}
    </>
  )
}
