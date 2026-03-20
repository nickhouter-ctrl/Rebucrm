'use client'

import { useState, useEffect, useRef } from 'react'
import { parseLeverancierPdfOnly } from '@/lib/actions'
import { Button } from '@/components/ui/button'
import { ArrowLeft, Upload, FileText, Trash2, ArrowRight, Loader2, CheckCircle } from 'lucide-react'

export interface ParsedPdfResult {
  totaal: number
  elementen: { naam: string; hoeveelheid: number; systeem: string; kleur: string; afmetingen: string; type: string; prijs: number; glasType: string; beslag: string; uwWaarde: string; drapirichting: string; dorpel: string; sluiting: string; scharnieren: string; gewicht: string; omtrek: string; paneel: string; commentaar: string; hoekverbinding: string; montageGaten: string; afwatering: string; scharnierenKleur: string; sluitcilinder: string; aantalSleutels: string; gelijksluitend: string; krukBinnen: string; krukBuiten: string; lakKleur: string }[]
  aantalElementen: number
}

export interface RenderedTekening {
  pageNum: number
  naam: string
  blob: Blob
  pageIndex: number    // 0-based index within the element's pages
  totalPages: number   // total number of pages for this element
}

export function StapTekeningen({
  pendingPdfFile,
  parsedPdfResult,
  renderedTekeningen,
  onUploadPdf,
  onPdfProcessed,
  onRemovePdf,
  onSkip,
  onNext,
  onBack,
}: {
  pendingPdfFile: File | null
  parsedPdfResult: ParsedPdfResult | null
  renderedTekeningen: RenderedTekening[]
  onUploadPdf: (file: File) => void
  onPdfProcessed: (result: ParsedPdfResult, tekeningen: RenderedTekening[]) => void
  onRemovePdf: () => void
  onSkip: () => void
  onNext: () => void
  onBack: () => void
}) {
  const [processing, setProcessing] = useState(false)
  const [progress, setProgress] = useState('')
  const [error, setError] = useState('')
  const processedFileRef = useRef<string | null>(null)

  // Auto-process when a file is present but not yet processed
  useEffect(() => {
    if (pendingPdfFile && !parsedPdfResult && !processing) {
      const fileKey = `${pendingPdfFile.name}-${pendingPdfFile.size}-${pendingPdfFile.lastModified}`
      if (processedFileRef.current !== fileKey) {
        processedFileRef.current = fileKey
        processUploadedPdf(pendingPdfFile)
      }
    }
  }, [pendingPdfFile, parsedPdfResult]) // eslint-disable-line react-hooks/exhaustive-deps

  async function processUploadedPdf(file: File) {
    setProcessing(true)
    setError('')

    try {
      // Step 1: Server-side text parsing
      setProgress('PDF tekst analyseren...')
      let parsed: ParsedPdfResult
      try {
        const formData = new FormData()
        formData.set('pdf', file)
        const result = await parseLeverancierPdfOnly(formData)

        if ('error' in result && result.error) {
          setError(result.error as string)
          setProcessing(false)
          setProgress('')
          return
        }

        parsed = result as ParsedPdfResult
      } catch (serverErr) {
        console.error('Server action error:', serverErr)
        setError(`Fout bij analyseren van PDF: ${serverErr instanceof Error ? serverErr.message : String(serverErr)}`)
        setProcessing(false)
        setProgress('')
        return
      }

      // Step 2: Client-side page rendering with pdfjs-dist
      setProgress(`Tekeningen extraheren (0/${parsed.aantalElementen})...`)

      const pdfjsLib = await import('pdfjs-dist')
      pdfjsLib.GlobalWorkerOptions.workerSrc = `https://unpkg.com/pdfjs-dist@${pdfjsLib.version}/build/pdf.worker.min.mjs`

      const arrayBuffer = await file.arrayBuffer()
      const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise
      const totalPages = pdf.numPages

      // Scan all pages for element names and drawing markers
      const elementHeaderPattern = /(?:Gekoppeld\s+element|Deur|Element)\s+\d{3}(?:\/\d+)?|Merk\s+\d+/i
      const standaloneProductPattern = /\b(Rolluik|Rolladen|Rollo|Zonwering|Screen|Hor(?:re)?|Insecten\s*hor|Fly\s*screen)\b/i
      const allPageScans: { pageNum: number; naam: string | null; hasDrawing: boolean; isStandaloneProduct: boolean }[] = []
      for (let pageNum = 2; pageNum <= totalPages; pageNum++) {
        const page = await pdf.getPage(pageNum)
        const textContent = await page.getTextContent()
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const pageText = textContent.items.map((item: any) => ('str' in item ? item.str : '')).join(' ')
        const headerMatch = pageText.match(elementHeaderPattern)
        const hasDrawing = /Binnenaanzicht|Binnenzicht|Buitenaanzicht|Buitenzicht|BUITEN\s*ZICHT|BINNEN\s*ZICHT/i.test(pageText)
        const isStandaloneProduct = standaloneProductPattern.test(pageText)
        allPageScans.push({ pageNum, naam: headerMatch ? headerMatch[0] : null, hasDrawing, isStandaloneProduct })
      }

      // Group pages per element: pages with same element name are combined.
      // Drawing-only pages (no header) are assigned to the PREVIOUS element
      // UNLESS they contain standalone product keywords (e.g. Rolluik, Zonwering).
      const elementGroupMap = new Map<string, number[]>()
      const elementOrder: string[] = []

      for (const scan of allPageScans) {
        if (scan.naam) {
          if (!elementGroupMap.has(scan.naam)) {
            elementGroupMap.set(scan.naam, [])
            elementOrder.push(scan.naam)
          }
          const pages = elementGroupMap.get(scan.naam)!
          if (scan.hasDrawing && !pages.includes(scan.pageNum)) {
            pages.push(scan.pageNum)
          }
        } else if (scan.hasDrawing && elementOrder.length > 0) {
          if (scan.isStandaloneProduct) {
            // Standalone product page (rolluik, hor, etc.) → create separate element
            const orphanName = `Pagina ${scan.pageNum}`
            elementGroupMap.set(orphanName, [scan.pageNum])
            elementOrder.push(orphanName)
          } else {
            // Continuation page (e.g. schuifpui buitenaanzicht) → assign to previous element
            const lastElement = elementOrder[elementOrder.length - 1]
            const pages = elementGroupMap.get(lastElement)!
            if (!pages.includes(scan.pageNum)) pages.push(scan.pageNum)
          }
        }
      }
      // For elements with no drawing pages, add their first header page as fallback
      for (const scan of allPageScans) {
        if (scan.naam && elementGroupMap.has(scan.naam) && elementGroupMap.get(scan.naam)!.length === 0) {
          elementGroupMap.get(scan.naam)!.push(scan.pageNum)
        }
      }
      // Sort pages per element
      for (const pages of elementGroupMap.values()) {
        pages.sort((a, b) => a - b)
      }

      // Helper: render page with only the top leverancier header cropped away
      async function renderPageWithHeaderCrop(pageNum: number) {
        const page = await pdf.getPage(pageNum)
        const viewport = page.getViewport({ scale: 2 })
        const canvas = document.createElement('canvas')
        canvas.width = viewport.width
        canvas.height = viewport.height
        const ctx = canvas.getContext('2d')!
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        await page.render({ canvasContext: ctx, viewport, canvas } as any).promise as void

        const w = Math.floor(viewport.width)
        const h = Math.floor(viewport.height)

        const textContent = await page.getTextContent()
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const textItems = (textContent.items as any[])
          .filter((item: any) => 'str' in item && item.str.trim())
          .map((item: any) => ({
            str: item.str.trim(),
            cx: Math.round(item.transform[4] * 2),
            cy: Math.round(h - item.transform[5] * 2),
          }))

        // Find the element header line (e.g. "Element 001", "Deur 001", "Merk 1")
        const headerMatch = textItems.find((i: { str: string; cy: number }) =>
          i.cy < h * 0.20 && /(?:Gekoppeld\s+)?(?:Deur|Element)\s+\d{3}|Merk\s+\d+/i.test(i.str)
        )
        const isGealanPage = headerMatch && /Merk\s+\d+/i.test(headerMatch.str)

        // Crop just above the element header (remove leverancier branding)
        let cropTop = Math.floor(h * 0.04)
        if (headerMatch) {
          cropTop = Math.max(0, headerMatch.cy - 30)
        }
        // Skip colored header bars (only for non-Gealan — Gealan uses text tables, not solid bars)
        if (!isGealanPage) {
          const sampleW = Math.floor(w * 0.25)
          const samples = Math.floor(sampleW / 2)
          for (let y = cropTop; y < Math.floor(h * 0.25); y += 2) {
            const rowData = ctx.getImageData(0, y, sampleW, 1).data
            let darkPx = 0
            for (let px = 0; px < sampleW; px += 2) {
              if (rowData[px * 4] < 200 || rowData[px * 4 + 1] < 200 || rowData[px * 4 + 2] < 200) darkPx++
            }
            if (darkPx > samples * 0.80) cropTop = y + 4
          }
        }

        // Hide supplier prices on green bars
        // Detect green bars (>30% of row green, ≥12px tall), then paint over
        // text with the bar's own green color. This preserves the bar as a
        // visual separator (no white stripes) while hiding price text.
        const imgData = ctx.getImageData(0, 0, w, h)
        const greenBarRows: boolean[] = new Array(h).fill(false)
        for (let y = 0; y < h; y++) {
          let greenCount = 0
          for (let x = 0; x < w; x += 2) {
            const idx = (y * w + x) * 4
            const r = imgData.data[idx], g = imgData.data[idx + 1], b = imgData.data[idx + 2]
            if (g > 80 && g > r + 20 && g > b + 20) greenCount++
          }
          greenBarRows[y] = greenCount > (w / 2) * 0.30
        }
        const bars: { start: number; end: number }[] = []
        let barStart = -1
        for (let y = 0; y <= h; y++) {
          if (y < h && greenBarRows[y]) {
            if (barStart === -1) barStart = y
          } else if (barStart !== -1) {
            if (y - barStart >= 12) bars.push({ start: barStart, end: y })
            barStart = -1
          }
        }
        // For each green bar, find the actual green pixel range per row
        // and fill only that range with white (not the full page width)
        for (const bar of bars) {
          for (let y = bar.start; y < bar.end; y++) {
            let left = w, right = 0
            for (let x = 0; x < w; x++) {
              const idx = (y * w + x) * 4
              const r = imgData.data[idx], g = imgData.data[idx + 1], b = imgData.data[idx + 2]
              if (g > 80 && g > r + 20 && g > b + 20) {
                if (x < left) left = x
                if (x > right) right = x
              }
            }
            if (right > left) {
              ctx.fillStyle = '#FFFFFF'
              ctx.fillRect(left, y, right - left + 1, 1)
            }
          }
        }

        // Hide "geen garantie" text
        for (const ti of textItems) {
          if (/geen\s*garantie/i.test(ti.str)) {
            ctx.fillStyle = '#FFFFFF'
            ctx.fillRect(Math.max(0, ti.cx - 5), ti.cy - 14, w - ti.cx + 10, 20)
          }
        }

        // Keep everything from cropTop to bottom (minus small footer margin)
        const cropBottom = Math.floor(h * 0.97)
        const cropH = cropBottom - cropTop
        const croppedCanvas = document.createElement('canvas')
        croppedCanvas.width = w
        croppedCanvas.height = cropH
        croppedCanvas.getContext('2d')!.drawImage(canvas, 0, cropTop, w, cropH, 0, 0, w, cropH)
        canvas.remove()
        return croppedCanvas
      }

      // Render each element's pages individually (no combining)
      const tekeningen: RenderedTekening[] = []
      for (let ei = 0; ei < elementOrder.length; ei++) {
        const naam = elementOrder[ei]
        const pageNums = elementGroupMap.get(naam)!
        if (pageNums.length === 0) continue
        setProgress(`Tekeningen extraheren (${ei + 1}/${elementOrder.length})...`)

        for (let pi = 0; pi < pageNums.length; pi++) {
          const croppedCanvas = await renderPageWithHeaderCrop(pageNums[pi])
          const blob = await new Promise<Blob>((resolve) => {
            croppedCanvas.toBlob((b) => resolve(b!), 'image/png', 0.9)
          })
          croppedCanvas.remove()

          tekeningen.push({
            pageNum: pageNums[pi],
            naam,
            blob,
            pageIndex: pi,
            totalPages: pageNums.length,
          })
        }
      }

      setProgress('')
      setProcessing(false)
      onPdfProcessed(parsed, tekeningen)
    } catch (err) {
      console.error('PDF processing error:', err)
      setError(`Fout bij verwerken van PDF: ${err instanceof Error ? err.message : String(err)}`)
      setProcessing(false)
      setProgress('')
    }
  }

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (file) {
      const fileKey = `${file.name}-${file.size}-${file.lastModified}`
      processedFileRef.current = fileKey
      onUploadPdf(file)
      processUploadedPdf(file)
      e.target.value = ''
    }
  }

  function formatCurrency(amount: number) {
    return new Intl.NumberFormat('nl-NL', { style: 'currency', currency: 'EUR' }).format(amount)
  }

  const isProcessed = !!parsedPdfResult && (renderedTekeningen.length > 0 || parsedPdfResult.elementen.length > 0)

  return (
    <div className="max-w-2xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-xl font-semibold text-gray-900">Leverancier tekeningen</h2>
          <p className="text-sm text-gray-500 mt-1">Upload de PDF van de leverancier met kozijntekeningen, of sla deze stap over</p>
        </div>
        <Button variant="ghost" onClick={onBack}>
          <ArrowLeft className="h-4 w-4" />
          Terug
        </Button>
      </div>

      {error && <div className="bg-red-50 text-red-600 text-sm p-3 rounded-md mb-4">{error}</div>}

      {/* Processing state */}
      {pendingPdfFile && processing && (
        <div className="bg-blue-50 border border-blue-200 rounded-xl p-6 mb-6">
          <div className="flex items-center gap-4">
            <Loader2 className="h-12 w-12 text-blue-600 flex-shrink-0 animate-spin" />
            <div className="flex-1 min-w-0">
              <p className="font-medium text-gray-900 truncate">{pendingPdfFile.name}</p>
              <p className="text-sm text-blue-700 mt-1">{progress}</p>
            </div>
          </div>
        </div>
      )}

      {/* Processed state */}
      {pendingPdfFile && isProcessed && !processing && (
        <div className="bg-green-50 border border-green-200 rounded-xl p-6 mb-6">
          <div className="flex items-center gap-4">
            <CheckCircle className="h-12 w-12 text-green-600 flex-shrink-0" />
            <div className="flex-1 min-w-0">
              <p className="font-medium text-gray-900 truncate">{pendingPdfFile.name}</p>
              <p className="text-sm text-green-700 mt-1">
                {parsedPdfResult!.aantalElementen} kozijntekeningen gevonden
                {parsedPdfResult!.totaal > 0 && <> &middot; Totaalprijs: <strong>{formatCurrency(parsedPdfResult!.totaal)}</strong></>}
              </p>
            </div>
            <div className="flex items-center gap-2 flex-shrink-0">
              <label className="cursor-pointer">
                <input type="file" accept=".pdf" className="hidden" onChange={handleFileChange} />
                <span className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50">
                  <Upload className="h-3 w-3" />
                  Vervangen
                </span>
              </label>
              <button type="button" onClick={onRemovePdf} className="p-1.5 text-gray-400 hover:text-red-500">
                <Trash2 className="h-4 w-4" />
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Pending but not yet processing (shouldn't happen normally, but fallback) */}
      {pendingPdfFile && !processing && !isProcessed && !error && (
        <div className="bg-blue-50 border border-blue-200 rounded-xl p-6 mb-6">
          <div className="flex items-center gap-4">
            <FileText className="h-12 w-12 text-blue-600 flex-shrink-0" />
            <div className="flex-1 min-w-0">
              <p className="font-medium text-gray-900 truncate">{pendingPdfFile.name}</p>
              <p className="text-sm text-blue-700 mt-1">PDF wordt voorbereid...</p>
            </div>
          </div>
        </div>
      )}

      {/* No file uploaded yet */}
      {!pendingPdfFile && (
        <label className="flex flex-col items-center justify-center py-16 border-2 border-dashed border-gray-300 rounded-xl cursor-pointer hover:border-primary hover:bg-gray-50 transition-colors mb-6">
          <Upload className="h-12 w-12 text-gray-400 mb-3" />
          <span className="text-base font-medium text-gray-700">Klik om leverancier PDF te uploaden</span>
          <span className="text-sm text-gray-500 mt-2">De kozijntekeningen en totaalprijs worden automatisch ingelezen</span>
          <input type="file" accept=".pdf" className="hidden" onChange={handleFileChange} />
        </label>
      )}

      <div className="flex items-center justify-between">
        <Button variant="ghost" onClick={onSkip}>
          Overslaan &mdash; handmatig invoeren
        </Button>
        {isProcessed && (
          <Button onClick={onNext}>
            Volgende
            <ArrowRight className="h-4 w-4" />
          </Button>
        )}
      </div>
    </div>
  )
}
