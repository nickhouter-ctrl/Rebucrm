'use client'

import { useEffect, useRef, useState, useCallback, useImperativeHandle, forwardRef, useMemo } from 'react'
import { Loader2, ChevronLeft, ChevronRight, Maximize2 } from 'lucide-react'

export interface PdfViewerHandle {
  jumpToPage: (pageNum: number) => void
  highlightPage: (pageNum: number) => void
}

export interface WipedRegionLite {
  pageNum: number
  x: number    // PDF native coords (scale=1)
  y: number
  w: number
  h: number
  reden?: string
}

// Side-by-side preview viewer — toont de originele leverancier-PDF met:
// - bladzijde-navigatie
// - pulserende highlight wanneer ouder-component vraagt om naar pagina N te scrollen
// - zoom (later)
export const PdfViewer = forwardRef<PdfViewerHandle, {
  file: File | null
  wipedRegions?: WipedRegionLite[]
  className?: string
}>(function PdfViewer({ file, wipedRegions, className }, ref) {
  const containerRef = useRef<HTMLDivElement>(null)
  const canvasRefs = useRef<Map<number, HTMLCanvasElement>>(new Map())
  const [pdf, setPdf] = useState<unknown | null>(null)
  const [totalPages, setTotalPages] = useState(0)
  const [currentPage, setCurrentPage] = useState(1)
  const [loading, setLoading] = useState(false)
  const [highlightPage, setHighlightPage] = useState<number | null>(null)
  // Native page sizes (scale=1) — nodig om overlay-coords te schalen
  const [pageSizes, setPageSizes] = useState<Map<number, { w: number; h: number }>>(new Map())
  // Render-scale die we hebben gebruikt per pagina (afhankelijk van containerWidth)
  const [pageScales, setPageScales] = useState<Map<number, number>>(new Map())
  const [showOverlay, setShowOverlay] = useState(true)

  // Load PDF
  useEffect(() => {
    if (!file) {
      setPdf(null)
      setTotalPages(0)
      return
    }
    let cancelled = false
    setLoading(true)
    ;(async () => {
      const pdfjsLib = await import('pdfjs-dist')
      pdfjsLib.GlobalWorkerOptions.workerSrc = `https://unpkg.com/pdfjs-dist@${pdfjsLib.version}/build/pdf.worker.min.mjs`
      const arrayBuffer = await file.arrayBuffer()
      if (cancelled) return
      const doc = await pdfjsLib.getDocument({ data: arrayBuffer }).promise
      if (cancelled) return
      setPdf(doc)
      setTotalPages(doc.numPages)
      setCurrentPage(1)
      setLoading(false)
    })()
    return () => { cancelled = true }
  }, [file])

  // Render alle pagina's (eenmalig na load)
  useEffect(() => {
    if (!pdf || !containerRef.current) return
    let cancelled = false
    ;(async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const doc = pdf as any
      const newSizes = new Map<number, { w: number; h: number }>()
      const newScales = new Map<number, number>()
      for (let p = 1; p <= doc.numPages; p++) {
        if (cancelled) return
        const canvas = canvasRefs.current.get(p)
        if (!canvas) continue
        const page = await doc.getPage(p)
        const containerWidth = containerRef.current?.clientWidth ?? 600
        const baseViewport = page.getViewport({ scale: 1 })
        const scale = Math.min(2, Math.max(1, (containerWidth - 32) / baseViewport.width))
        const viewport = page.getViewport({ scale })
        canvas.width = viewport.width
        canvas.height = viewport.height
        canvas.style.height = 'auto'
        newSizes.set(p, { w: baseViewport.width, h: baseViewport.height })
        newScales.set(p, scale)
        const ctx = canvas.getContext('2d')
        if (!ctx) continue
        await page.render({ canvasContext: ctx, viewport, canvas }).promise
      }
      if (!cancelled) {
        setPageSizes(newSizes)
        setPageScales(newScales)
      }
    })()
    return () => { cancelled = true }
  }, [pdf])

  // Group wiped regions per page
  const regionsPerPage = useMemo(() => {
    const m = new Map<number, WipedRegionLite[]>()
    for (const r of (wipedRegions || [])) {
      const arr = m.get(r.pageNum) ?? []
      arr.push(r)
      m.set(r.pageNum, arr)
    }
    return m
  }, [wipedRegions])

  // Highlight pulse
  useEffect(() => {
    if (highlightPage == null) return
    const t = setTimeout(() => setHighlightPage(null), 2000)
    return () => clearTimeout(t)
  }, [highlightPage])

  // Track which page is currently in viewport
  const handleScroll = useCallback(() => {
    if (!containerRef.current) return
    const rect = containerRef.current.getBoundingClientRect()
    const center = rect.top + rect.height / 2
    let closestPage = 1
    let closestDist = Infinity
    for (const [p, canvas] of canvasRefs.current) {
      const r = canvas.getBoundingClientRect()
      const dist = Math.abs((r.top + r.height / 2) - center)
      if (dist < closestDist) {
        closestDist = dist
        closestPage = p
      }
    }
    setCurrentPage(closestPage)
  }, [])

  useImperativeHandle(ref, () => ({
    jumpToPage: (pageNum: number) => {
      const canvas = canvasRefs.current.get(pageNum)
      if (canvas) {
        canvas.scrollIntoView({ behavior: 'smooth', block: 'start' })
      }
    },
    highlightPage: (pageNum: number) => {
      setHighlightPage(pageNum)
      const canvas = canvasRefs.current.get(pageNum)
      if (canvas) canvas.scrollIntoView({ behavior: 'smooth', block: 'start' })
    },
  }), [])

  return (
    <div className={`flex flex-col bg-gray-100 ${className || ''}`}>
      {/* Toolbar */}
      <div className="flex items-center justify-between px-3 py-2 bg-white border-b border-gray-200 sticky top-0 z-10">
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => {
              const next = Math.max(1, currentPage - 1)
              const canvas = canvasRefs.current.get(next)
              canvas?.scrollIntoView({ behavior: 'smooth', block: 'start' })
            }}
            className="p-1 hover:bg-gray-100 rounded disabled:opacity-30"
            disabled={currentPage <= 1}
          >
            <ChevronLeft className="h-4 w-4" />
          </button>
          <span className="text-xs text-gray-600 font-medium">
            {totalPages > 0 ? `${currentPage} / ${totalPages}` : '—'}
          </span>
          <button
            type="button"
            onClick={() => {
              const next = Math.min(totalPages, currentPage + 1)
              const canvas = canvasRefs.current.get(next)
              canvas?.scrollIntoView({ behavior: 'smooth', block: 'start' })
            }}
            className="p-1 hover:bg-gray-100 rounded disabled:opacity-30"
            disabled={currentPage >= totalPages}
          >
            <ChevronRight className="h-4 w-4" />
          </button>
        </div>
        <span className="text-xs text-gray-500">Origineel</span>
        <div className="flex items-center gap-1">
          {(wipedRegions?.length ?? 0) > 0 && (
            <label className="flex items-center gap-1 text-[10px] text-gray-600 cursor-pointer">
              <input type="checkbox" checked={showOverlay} onChange={e => setShowOverlay(e.target.checked)} className="h-3 w-3" />
              Toon weggewist
            </label>
          )}
          <button type="button" className="p-1 hover:bg-gray-100 rounded" title="Origineel openen in nieuwe tab"
            onClick={() => {
              if (file) window.open(URL.createObjectURL(file), '_blank')
            }}
          >
            <Maximize2 className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>

      {/* Pagina-canvas-stack */}
      <div ref={containerRef} onScroll={handleScroll} className="flex-1 overflow-y-auto p-3 space-y-3">
        {loading && (
          <div className="flex items-center justify-center py-12 text-gray-500">
            <Loader2 className="h-5 w-5 animate-spin mr-2" /> Origineel laden...
          </div>
        )}
        {!file && !loading && (
          <div className="flex items-center justify-center py-12 text-gray-400 text-sm">
            Geen leveranciersofferte
          </div>
        )}
        {Array.from({ length: totalPages }, (_, i) => i + 1).map(p => {
          const scale = pageScales.get(p) ?? 1
          const regions = regionsPerPage.get(p) || []
          return (
            <div key={p} className="relative">
              <div className={`absolute -left-1 top-2 px-1.5 py-0.5 text-[10px] font-medium rounded text-white z-10 ${highlightPage === p ? 'bg-amber-500' : 'bg-gray-400'}`}>
                p{p}
                {regions.length > 0 && <span className="ml-1 text-[9px] bg-red-500/90 px-1 rounded">{regions.length}×</span>}
              </div>
              <div className="relative">
                <canvas
                  ref={(el) => {
                    if (el) canvasRefs.current.set(p, el)
                    else canvasRefs.current.delete(p)
                  }}
                  className={`w-full bg-white rounded shadow-sm transition-all ${highlightPage === p ? 'ring-4 ring-amber-400 ring-opacity-75' : 'ring-1 ring-gray-200'}`}
                />
                {showOverlay && regions.length > 0 && (
                  <div className="absolute inset-0 pointer-events-none">
                    {regions.map((r, i) => {
                      const left = `${(r.x * scale * 100) / Math.max(1, (pageSizes.get(p)?.w ?? 1) * scale)}%`
                      const top = `${(r.y * scale * 100) / Math.max(1, (pageSizes.get(p)?.h ?? 1) * scale)}%`
                      const width = `${(r.w * scale * 100) / Math.max(1, (pageSizes.get(p)?.w ?? 1) * scale)}%`
                      const height = `${(r.h * scale * 100) / Math.max(1, (pageSizes.get(p)?.h ?? 1) * scale)}%`
                      return (
                        <div
                          key={i}
                          className="absolute border-2 border-red-500/70 bg-red-500/10"
                          style={{ left, top, width, height }}
                          title={`Weggewist door ${r.reden || 'systeem'}`}
                        >
                          <span className="absolute -top-3 -left-0.5 text-[9px] bg-red-500 text-white px-1 rounded-sm whitespace-nowrap">
                            {r.reden === 'ai' ? 'AI wist' : 'wist'}
                          </span>
                        </div>
                      )
                    })}
                  </div>
                )}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
})
