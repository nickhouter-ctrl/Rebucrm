'use client'

import { useEffect, useRef, useState, useCallback } from 'react'
import { Loader2, X, Trash2, Plus, Save, Sparkles } from 'lucide-react'
import { Button } from '@/components/ui/button'

export interface EditableRegion {
  id: string
  x: number      // PDF native coords (scale=1)
  y: number
  w: number
  h: number
  reden?: string
  // door gebruiker toegevoegd of aangepast → zet vlag zodat we weten of we 'm
  // moeten meenemen in de leverancier-template-save
  userAdded?: boolean
  userEdited?: boolean
}

interface Props {
  open: boolean
  pdfFile: File | null
  pageNum: number
  initialRegions: EditableRegion[]
  leverancierLabel?: string
  onClose: () => void
  // Wordt aangeroepen na opslaan met de actuele lijst regions (in PDF native coords).
  // Parent bouwt dan de tekening-blob opnieuw met deze regions als wis-rechthoeken.
  onSave: (regions: EditableRegion[], opts: { saveAsTemplate: boolean }) => void | Promise<void>
}

// Volledig in-browser bbox-editor voor 1 pagina:
// - Render PDF page op canvas via pdfjs
// - Toon huidige regio's als draggable/resizable boxen
// - Toelaten: nieuwe box slepen op leeg canvas, bestaande box slepen of resize via hoek-handle, delete via X
// - Save: callback naar parent met de actuele lijst regions
export function RegionEditor({
  open, pdfFile, pageNum, initialRegions, leverancierLabel, onClose, onSave,
}: Props) {
  const containerRef = useRef<HTMLDivElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [regions, setRegions] = useState<EditableRegion[]>(initialRegions)
  const [pdfDoc, setPdfDoc] = useState<unknown | null>(null)
  const [loading, setLoading] = useState(false)
  const [pageSize, setPageSize] = useState<{ w: number; h: number }>({ w: 1, h: 1 })
  const [scale, setScale] = useState(1)
  const [saving, setSaving] = useState(false)

  const [selectedId, setSelectedId] = useState<string | null>(null)
  const dragRef = useRef<{
    mode: 'new' | 'move' | 'resize'
    id: string
    handle?: 'nw' | 'ne' | 'sw' | 'se'
    startX: number
    startY: number
    origRegion?: EditableRegion
  } | null>(null)

  // Laad PDF
  useEffect(() => {
    if (!open || !pdfFile) return
    let cancelled = false
    setLoading(true)
    ;(async () => {
      const pdfjsLib = await import('pdfjs-dist')
      pdfjsLib.GlobalWorkerOptions.workerSrc = `https://unpkg.com/pdfjs-dist@${pdfjsLib.version}/build/pdf.worker.min.mjs`
      const buf = await pdfFile.arrayBuffer()
      if (cancelled) return
      const doc = await pdfjsLib.getDocument({ data: buf }).promise
      if (cancelled) return
      setPdfDoc(doc)
      setLoading(false)
    })()
    return () => { cancelled = true }
  }, [open, pdfFile])

  // Sync initial regions wanneer de modal opnieuw opent
  useEffect(() => {
    if (open) setRegions(initialRegions)
  }, [open, initialRegions])

  // Render de juiste pagina
  useEffect(() => {
    if (!open || !pdfDoc || !canvasRef.current || !containerRef.current) return
    let cancelled = false
    ;(async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const doc = pdfDoc as any
      const page = await doc.getPage(pageNum)
      if (cancelled) return
      const baseViewport = page.getViewport({ scale: 1 })
      const containerWidth = containerRef.current?.clientWidth ?? 600
      const containerHeight = (containerRef.current?.clientHeight ?? 800) - 50
      const sx = (containerWidth - 16) / baseViewport.width
      const sy = containerHeight / baseViewport.height
      const renderScale = Math.max(0.5, Math.min(2.5, Math.min(sx, sy)))
      const viewport = page.getViewport({ scale: renderScale })
      const canvas = canvasRef.current!
      canvas.width = viewport.width
      canvas.height = viewport.height
      const ctx = canvas.getContext('2d')!
      await page.render({ canvasContext: ctx, viewport, canvas }).promise
      setPageSize({ w: baseViewport.width, h: baseViewport.height })
      setScale(renderScale)
    })()
    return () => { cancelled = true }
  }, [open, pdfDoc, pageNum])

  // Coords helper: client (px) → PDF native coords
  const clientToPdf = useCallback((clientX: number, clientY: number) => {
    if (!canvasRef.current) return { x: 0, y: 0 }
    const rect = canvasRef.current.getBoundingClientRect()
    const px = (clientX - rect.left) / scale
    const py = (clientY - rect.top) / scale
    return { x: px, y: py }
  }, [scale])

  // ---- Mouse handlers ----
  function onMouseDown(e: React.MouseEvent) {
    if (e.button !== 0) return
    const target = e.target as HTMLElement
    const regionId = target.dataset.rid
    const handle = target.dataset.handle as 'nw' | 'ne' | 'sw' | 'se' | undefined
    const { x, y } = clientToPdf(e.clientX, e.clientY)

    if (regionId) {
      const reg = regions.find(r => r.id === regionId)
      if (!reg) return
      setSelectedId(regionId)
      if (handle) {
        dragRef.current = { mode: 'resize', id: regionId, handle, startX: x, startY: y, origRegion: reg }
      } else {
        dragRef.current = { mode: 'move', id: regionId, startX: x, startY: y, origRegion: reg }
      }
      e.preventDefault()
    } else {
      // Nieuwe region beginnen
      const id = `new-${Date.now()}`
      const newReg: EditableRegion = { id, x, y, w: 1, h: 1, userAdded: true, reden: 'user' }
      setRegions(prev => [...prev, newReg])
      setSelectedId(id)
      dragRef.current = { mode: 'new', id, startX: x, startY: y, origRegion: newReg }
    }
  }

  useEffect(() => {
    function onMove(e: MouseEvent) {
      if (!dragRef.current) return
      const drag = dragRef.current
      const { x, y } = clientToPdf(e.clientX, e.clientY)
      const dx = x - drag.startX
      const dy = y - drag.startY
      setRegions(prev => prev.map(r => {
        if (r.id !== drag.id) return r
        const orig = drag.origRegion!
        if (drag.mode === 'new') {
          const w = x - orig.x
          const h = y - orig.y
          return { ...r, x: w < 0 ? x : orig.x, y: h < 0 ? y : orig.y, w: Math.abs(w), h: Math.abs(h) }
        }
        if (drag.mode === 'move') {
          return { ...r, x: orig.x + dx, y: orig.y + dy, userEdited: true }
        }
        // resize
        const minSize = 5
        let nx = orig.x, ny = orig.y, nw = orig.w, nh = orig.h
        if (drag.handle === 'nw') { nx = orig.x + dx; ny = orig.y + dy; nw = orig.w - dx; nh = orig.h - dy }
        if (drag.handle === 'ne') { ny = orig.y + dy; nw = orig.w + dx; nh = orig.h - dy }
        if (drag.handle === 'sw') { nx = orig.x + dx; nw = orig.w - dx; nh = orig.h + dy }
        if (drag.handle === 'se') { nw = orig.w + dx; nh = orig.h + dy }
        return { ...r, x: nx, y: ny, w: Math.max(minSize, nw), h: Math.max(minSize, nh), userEdited: true }
      }))
    }
    function onUp() {
      if (dragRef.current?.mode === 'new') {
        // Valideer minimum grootte; te klein → verwijder
        setRegions(prev => prev.filter(r => r.id !== dragRef.current?.id || (r.w >= 10 && r.h >= 10)))
      }
      dragRef.current = null
    }
    document.addEventListener('mousemove', onMove)
    document.addEventListener('mouseup', onUp)
    return () => {
      document.removeEventListener('mousemove', onMove)
      document.removeEventListener('mouseup', onUp)
    }
  }, [clientToPdf])

  function deleteRegion(id: string) {
    setRegions(prev => prev.filter(r => r.id !== id))
    if (selectedId === id) setSelectedId(null)
  }

  async function handleSave() {
    setSaving(true)
    try {
      // Altijd als template opslaan — AI leert automatisch van elke aanpassing
      await onSave(regions.filter(r => r.w >= 5 && r.h >= 5), { saveAsTemplate: true })
      onClose()
    } finally {
      setSaving(false)
    }
  }

  if (!open) return null

  return (
    <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose() }}>
      <div className="bg-white rounded-xl shadow-2xl flex flex-col max-w-6xl w-full" style={{ height: '90vh' }}>
        <div className="px-4 py-3 border-b border-gray-200 flex items-center justify-between">
          <div>
            <h3 className="font-semibold text-gray-900">Wis-regio's bewerken — pagina {pageNum}</h3>
            <p className="text-xs text-gray-500 mt-0.5">
              Sleep op leeg canvas voor nieuwe regio • Klik op regio + sleep hoek om te resizen • Hover op regio voor verwijder-knop
            </p>
          </div>
          <button type="button" onClick={onClose} className="p-1 hover:bg-gray-100 rounded">
            <X className="h-5 w-5 text-gray-500" />
          </button>
        </div>

        <div ref={containerRef} className="flex-1 overflow-auto bg-gray-100 relative p-2">
          {loading && (
            <div className="absolute inset-0 flex items-center justify-center">
              <Loader2 className="h-6 w-6 animate-spin text-gray-500" />
            </div>
          )}
          <div className="relative inline-block mx-auto">
            <canvas
              ref={canvasRef}
              className="bg-white shadow-md cursor-crosshair"
              onMouseDown={onMouseDown}
            />
            <div className="absolute inset-0 pointer-events-none">
              {regions.map(r => {
                const left = r.x * scale
                const top = r.y * scale
                const width = r.w * scale
                const height = r.h * scale
                const sel = selectedId === r.id
                return (
                  <div
                    key={r.id}
                    data-rid={r.id}
                    style={{ position: 'absolute', left, top, width, height, pointerEvents: 'auto' }}
                    className={`border-2 ${sel ? 'border-blue-500 bg-blue-500/30' : 'border-red-500/70 bg-red-500/15 hover:bg-red-500/25'} cursor-move`}
                    onMouseDown={(e) => { e.stopPropagation(); onMouseDown(e) }}
                  >
                    <span className="absolute -top-4 left-0 text-[9px] bg-red-500 text-white px-1 rounded-sm">
                      {r.userAdded ? 'jij' : r.userEdited ? 'aangepast' : (r.reden || 'wist')}
                    </span>
                    <button
                      type="button"
                      onMouseDown={(e) => { e.stopPropagation(); e.preventDefault() }}
                      onClick={(e) => { e.stopPropagation(); e.preventDefault(); deleteRegion(r.id) }}
                      className="absolute -top-2 -right-2 bg-red-500 text-white rounded-full w-5 h-5 flex items-center justify-center text-xs font-bold hover:bg-red-600 z-10 cursor-pointer"
                      title="Verwijder regio"
                    >
                      ×
                    </button>
                    {sel && (
                      <>
                        <div data-rid={r.id} data-handle="nw" className="absolute -top-1.5 -left-1.5 w-3 h-3 bg-blue-500 cursor-nwse-resize" />
                        <div data-rid={r.id} data-handle="ne" className="absolute -top-1.5 -right-1.5 w-3 h-3 bg-blue-500 cursor-nesw-resize" />
                        <div data-rid={r.id} data-handle="sw" className="absolute -bottom-1.5 -left-1.5 w-3 h-3 bg-blue-500 cursor-nesw-resize" />
                        <div data-rid={r.id} data-handle="se" className="absolute -bottom-1.5 -right-1.5 w-3 h-3 bg-blue-500 cursor-nwse-resize" />
                      </>
                    )}
                  </div>
                )
              })}
            </div>
          </div>
        </div>

        <div className="px-4 py-3 border-t border-gray-200 flex items-center justify-between bg-gray-50">
          <div className="flex items-center gap-3 text-xs">
            <span className="text-gray-600">
              {regions.length} regio{regions.length !== 1 ? 's' : ''}
            </span>
            <button
              type="button"
              onClick={() => { setRegions([]); setSelectedId(null) }}
              className="text-red-600 hover:underline flex items-center gap-1"
            >
              <Trash2 className="h-3 w-3" />
              Alles wissen
            </button>
            {leverancierLabel && (
              <span className="flex items-center gap-1.5 text-blue-700">
                <Sparkles className="h-3 w-3" />
                <span>AI leert deze correctie automatisch op voor <strong>{leverancierLabel}</strong></span>
              </span>
            )}
          </div>
          <div className="flex items-center gap-2">
            <Button variant="ghost" onClick={onClose}>Annuleren</Button>
            <Button onClick={handleSave} disabled={saving}>
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
              Toepassen op tekening
            </Button>
          </div>
        </div>
      </div>
    </div>
  )
}

// Helper: render een PDF-pagina op een canvas, pas wis-regio's toe (wit) en
// retourneer als JPEG-blob. Gebruikt door parent-component om de tekening-blob
// te vervangen na region-editing.
export async function rerenderPageWithRegions(
  pdfFile: File,
  pageNum: number,
  regions: { x: number; y: number; w: number; h: number }[],
  scale = 2,
  // Optionele crop: net als de oorspronkelijke pipeline cropten we de leveranciers-header weg
  cropTop = 0,
): Promise<Blob> {
  const pdfjsLib = await import('pdfjs-dist')
  pdfjsLib.GlobalWorkerOptions.workerSrc = `https://unpkg.com/pdfjs-dist@${pdfjsLib.version}/build/pdf.worker.min.mjs`
  const buf = await pdfFile.arrayBuffer()
  const doc = await pdfjsLib.getDocument({ data: buf }).promise
  const page = await doc.getPage(pageNum)
  const viewport = page.getViewport({ scale })
  const canvas = document.createElement('canvas')
  canvas.width = viewport.width
  canvas.height = viewport.height
  const ctx = canvas.getContext('2d')!
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await page.render({ canvasContext: ctx, viewport, canvas } as any).promise
  // Pas wis-regio's toe (regions in PDF-native coords → schaal naar render-scale)
  ctx.fillStyle = '#FFFFFF'
  for (const r of regions) {
    ctx.fillRect(r.x * scale, r.y * scale, r.w * scale, r.h * scale)
  }
  // Crop top als gevraagd
  let outputCanvas = canvas
  if (cropTop > 0) {
    const cropY = Math.round(cropTop * scale)
    const cropped = document.createElement('canvas')
    cropped.width = canvas.width
    cropped.height = canvas.height - cropY
    cropped.getContext('2d')!.drawImage(canvas, 0, cropY, canvas.width, cropped.height, 0, 0, canvas.width, cropped.height)
    outputCanvas = cropped
  }
  return await new Promise((resolve) => {
    outputCanvas.toBlob((b) => resolve(b!), 'image/jpeg', 0.85)
  })
}
