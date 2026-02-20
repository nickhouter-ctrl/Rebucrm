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
      const elementHeaderPattern = /(?:Gekoppeld\s+element|Deur|Element)\s+\d{3}(?:\/\d+)?/i
      const standaloneProductPattern = /\b(Rolluik|Rolladen|Rollo|Zonwering|Screen|Hor(?:re)?|Insecten\s*hor|Fly\s*screen)\b/i
      const allPageScans: { pageNum: number; naam: string | null; hasDrawing: boolean; isStandaloneProduct: boolean }[] = []
      for (let pageNum = 2; pageNum < totalPages; pageNum++) {
        const page = await pdf.getPage(pageNum)
        const textContent = await page.getTextContent()
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const pageText = textContent.items.map((item: any) => ('str' in item ? item.str : '')).join(' ')
        const headerMatch = pageText.match(elementHeaderPattern)
        const hasDrawing = /Binnenaanzicht|Binnenzicht|Buitenaanzicht|Buitenzicht/.test(pageText)
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

      // Helper: render and crop a single page
      async function cropPage(pageNum: number) {
        const page = await pdf.getPage(pageNum)
        const viewport = page.getViewport({ scale: 3 })
        const fullCanvas = document.createElement('canvas')
        fullCanvas.width = viewport.width
        fullCanvas.height = viewport.height
        const fullCtx = fullCanvas.getContext('2d')!
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        await page.render({ canvasContext: fullCtx, viewport, canvas: fullCanvas } as any).promise as void

        const w = viewport.width
        const h = viewport.height

        // 1. Find header bottom using text positions
        const pageTC = await page.getTextContent()
        const headerPatterns = [/(?:Gekoppeld\s+)?(?:Deur|Element)\s+\d/i, /Hoeveelheid|Hoev\./, /^Systeem\s*:/, /^Kleur\s*:/]
        const specKeywords = /^(Vullingen|Beslag|Sluiting|Scharnieren|Gevraagd|Paneel|Afwatering|Hoekverbinding|Montage|Sluitcilinder|Commentaar|Dorpel|Lak\s*kleur|Buitenkader|Glazing|Muur|Versterking|Berichten|Bijprofiel|Eenheidsgewicht|Omtrek|Total\s+perimeter|Toebehoren|Prijs|Thermische|Kader|Toelaatbare|Stijl|Montage\s*ankers|Samen|Gemiddelde|Rolluikkast|Rolluikblad|Geleiders|Handling)/i
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const allTextItems = (pageTC.items as any[])
          .filter((item: any) => 'str' in item && item.str.trim())
          .map((item: any) => ({
            str: item.str.trim(),
            cy: Math.round(h - item.transform[5] * 3),
            cx: Math.round(item.transform[4] * 3),
          }))
        const headerCandidates = allTextItems.filter((i: { str: string; cy: number }) =>
          i.cy < h * 0.25 && headerPatterns.some(p => p.test(i.str))
        )
        let headerBottom = Math.floor(h * 0.06)
        if (headerCandidates.length > 0) {
          const maxHeaderCy = Math.max(...headerCandidates.map((i: { cy: number }) => i.cy))
          const leftItems = allTextItems
            .filter((i: { cx: number; cy: number }) => i.cx < w * 0.45 && i.cy >= maxHeaderCy)
            .sort((a: { cy: number }, b: { cy: number }) => a.cy - b.cy)
          let clusterBottom = maxHeaderCy
          const isDimLabel = (s: string) => /^\d+([.,]\d+)?$/.test(s)
          for (let idx = 1; idx < leftItems.length; idx++) {
            if (leftItems[idx].cy - leftItems[idx - 1].cy > 80) break
            // Stop if we hit drawing dimension labels (e.g. "600", "120") beyond the header area
            if (isDimLabel(leftItems[idx].str) && leftItems[idx].cy > maxHeaderCy + 50) break
            // Stop if we hit spec keyword labels (e.g. "Buitenkader", "Muur configuratie")
            if (specKeywords.test(leftItems[idx].str)) break
            clusterBottom = leftItems[idx].cy
          }
          headerBottom = clusterBottom + 20
        }

        // 1b. Skip colored header bar (solid-color rows below text header)
        for (let y = headerBottom; y < Math.floor(h * 0.30); y += 2) {
          const sampleW = Math.floor(w * 0.60)
          const rowData = fullCtx.getImageData(0, y, sampleW, 1).data
          const samples = Math.floor(sampleW / 2)
          let darkPx = 0
          for (let px = 0; px < sampleW; px += 2) {
            const r = rowData[px * 4], g = rowData[px * 4 + 1], b = rowData[px * 4 + 2]
            if (r < 200 || g < 200 || b < 200) darkPx++
          }
          if (darkPx < samples * 0.15) { headerBottom = y; break }
        }

        // 2. Find right boundary using spec keyword detection
        //    (dimension labels like "4600", "1185.2" on drawings should NOT trigger spec detection)
        //    Find view labels first to distinguish side-column specs from bottom-section specs
        const viewLabelItemsForBound = allTextItems.filter((i: { str: string; cy: number }) =>
          /Binnenaanzicht|Binnenzicht|Buitenaanzicht|Buitenzicht/i.test(i.str) && i.cy > headerBottom
        )
        const firstViewLabelCy = viewLabelItemsForBound.length > 0
          ? Math.min(...viewLabelItemsForBound.map((i: { cy: number }) => i.cy))
          : Infinity
        const specLabelItems = allTextItems.filter((i: { str: string; cx: number; cy: number }) =>
          i.cx > w * 0.35 && i.cy > headerBottom && i.cy < h * 0.90 && specKeywords.test(i.str)
        )
        let rightBound: number
        if (specLabelItems.length >= 2) {
          // Only treat as side-column if spec items exist ABOVE the first view label.
          // Specs below view labels are bottom sections (e.g. schuifpui buitenaanzicht page),
          // not side columns, and should not constrain the drawing width.
          const sideColumnSpecs = specLabelItems.filter((i: { cy: number }) => i.cy < firstViewLabelCy)
          if (sideColumnSpecs.length >= 2) {
            const specLeftX = Math.min(...sideColumnSpecs.map((i: { cx: number }) => i.cx))
            rightBound = specLeftX - 30
            rightBound = Math.max(rightBound, Math.floor(w * 0.35))
          } else {
            rightBound = Math.floor(w * 0.92)
          }
        } else {
          // No spec table (drawing-only page): use almost full width
          rightBound = Math.floor(w * 0.92)
        }

        // 3. Find "SPECIFICATIES" or "Specificaties" text — hard boundary to exclude leverancier spec sections
        const specsHeaderItems = allTextItems.filter((i: { str: string; cy: number }) =>
          /^SPECIFICATIES$|^Specificaties$/i.test(i.str) && i.cy > headerBottom
        )
        let specsHeaderCy = Infinity
        if (specsHeaderItems.length > 0) {
          specsHeaderCy = Math.min(...specsHeaderItems.map((i: { cy: number }) => i.cy))
        }

        // 3b. Find bottom of drawing content (scan up from SPECIFICATIES or page bottom)
        const scanBottomStart = specsHeaderCy < Infinity ? specsHeaderCy - 10 : Math.floor(h * 0.90)
        let bottomBound = scanBottomStart
        for (let y = scanBottomStart; y > Math.floor(h * 0.30); y -= 3) {
          const rowData = fullCtx.getImageData(0, y, rightBound, 1).data
          let nonWhite = 0
          for (let px = 0; px < rightBound; px += 2) {
            const r = rowData[px * 4], g = rowData[px * 4 + 1], b = rowData[px * 4 + 2]
            if (r < 230 || g < 230 || b < 230) nonWhite++
          }
          if (nonWhite > 5) { bottomBound = Math.min(y + 30, scanBottomStart); break }
        }

        // 3b2. Constrain bottom to just below the last view label.
        //      Content below view labels (like Samenvatting tables) is not part of the drawing.
        if (viewLabelItemsForBound.length > 0) {
          const lastViewLabelCy = Math.max(...viewLabelItemsForBound.map((i: { cy: number }) => i.cy))
          bottomBound = Math.min(bottomBound, lastViewLabelCy + 60)
        }

        // 3c. On full-width pages, constrain bottom only if spec keywords appear below the drawing
        if (rightBound > Math.floor(w * 0.70)) {
          const viewLabels = allTextItems.filter((i: { str: string; cy: number }) =>
            /Binnenaanzicht|Binnenzicht|Buitenaanzicht|Buitenzicht/i.test(i.str) && i.cy > headerBottom
          )
          if (viewLabels.length > 0) {
            const lastLabelCy = Math.max(...viewLabels.map((i: { cy: number }) => i.cy))
            const specsBelowDrawing = allTextItems.filter((i: { str: string; cy: number }) =>
              i.cy > lastLabelCy + 20 && specKeywords.test(i.str)
            )
            if (specsBelowDrawing.length > 0) {
              const firstSpecCy = Math.min(...specsBelowDrawing.map((i: { cy: number }) => i.cy))
              bottomBound = Math.min(bottomBound, firstSpecCy - 15)
            }
            // Detect colored bars (e.g. purple Samenvatting table header) below the drawing
            for (let y = lastLabelCy + 30; y < bottomBound; y += 3) {
              const rd = fullCtx.getImageData(0, y, rightBound, 1).data
              let colored = 0
              for (let px = 0; px < rightBound; px += 2) {
                const r = rd[px * 4], g = rd[px * 4 + 1], b = rd[px * 4 + 2]
                const mx = Math.max(r, g, b), mn = Math.min(r, g, b)
                if (mx - mn > 40 && mx > 50 && r + g + b < 600) colored++
              }
              if (colored > Math.floor(rightBound / 4) * 0.10) {
                bottomBound = Math.min(bottomBound, y - 15)
                break
              }
            }
            // Detect summary tables below drawing via white gap after view labels.
            // If a gap >= 40px of white rows is followed by content, it's a table to exclude.
            let whiteGapStart = -1
            for (let y = lastLabelCy + 40; y < bottomBound; y += 3) {
              const rd = fullCtx.getImageData(0, y, rightBound, 1).data
              let nw = 0
              for (let px = 0; px < rightBound; px += 2) {
                const r = rd[px * 4], g = rd[px * 4 + 1], b = rd[px * 4 + 2]
                if (r < 230 || g < 230 || b < 230) nw++
              }
              if (nw <= 3) {
                if (whiteGapStart < 0) whiteGapStart = y
              } else {
                if (whiteGapStart >= 0 && y - whiteGapStart >= 40) {
                  bottomBound = Math.min(bottomBound, whiteGapStart)
                  break
                }
                whiteGapStart = -1
              }
            }
          }
        }

        // 4. Find top of content
        let contentTop = headerBottom
        let firstContentY = headerBottom
        for (let y = headerBottom; y < Math.floor(h * 0.40); y += 3) {
          const rowData = fullCtx.getImageData(0, y, rightBound, 1).data
          let nonWhite = 0
          for (let px = 0; px < rightBound; px += 2) {
            const r = rowData[px * 4], g = rowData[px * 4 + 1], b = rowData[px * 4 + 2]
            if (r < 230 || g < 230 || b < 230) nonWhite++
          }
          if (nonWhite > 5) { firstContentY = y; contentTop = Math.max(headerBottom, y - 80); break }
        }

        // 4b. Skip remark text between header and drawing (pixel-based gap detection).
        //     If there's a small content block (< 150px) followed by a large white gap
        //     (>= 60px), it's likely Commentaar/remark text that should be skipped.
        if (firstViewLabelCy < Infinity) {
          const maxScanY = Math.min(firstContentY + Math.floor(h * 0.15), firstViewLabelCy - 150)
          let consecutiveWhite = 0
          let lastContentBeforeGap = firstContentY
          for (let y = firstContentY + 3; y < maxScanY; y += 3) {
            const rowData = fullCtx.getImageData(0, y, rightBound, 1).data
            let nonWhite = 0
            for (let px = 0; px < rightBound; px += 2) {
              const r = rowData[px * 4], g = rowData[px * 4 + 1], b = rowData[px * 4 + 2]
              if (r < 230 || g < 230 || b < 230) nonWhite++
            }
            if (nonWhite > 3) {
              if (consecutiveWhite >= 60) {
                const preGapHeight = lastContentBeforeGap - firstContentY
                if (preGapHeight >= 10 && preGapHeight < 150) {
                  const preGapText = allTextItems.filter((i: { str: string; cy: number; cx: number }) =>
                    i.cy >= firstContentY - 10 && i.cy <= lastContentBeforeGap + 10 &&
                    i.cx < rightBound && !/^\d+([.,]\d+)?$/.test(i.str)
                  )
                  if (preGapText.length > 0) {
                    contentTop = Math.max(headerBottom, y - 30)
                  }
                }
                break
              }
              consecutiveWhite = 0
              lastContentBeforeGap = y
            } else {
              consecutiveWhite += 3
            }
          }
          // Safety: ensure contentTop doesn't cut into the first view label area
          if (contentTop > firstViewLabelCy - 100) {
            contentTop = Math.max(headerBottom, firstViewLabelCy - 100)
          }
        }

        const cropW = rightBound
        const cropH = bottomBound - contentTop
        const croppedCanvas = document.createElement('canvas')
        croppedCanvas.width = cropW
        croppedCanvas.height = cropH
        const croppedCtx = croppedCanvas.getContext('2d')!
        croppedCtx.drawImage(fullCanvas, 0, contentTop, cropW, cropH, 0, 0, cropW, cropH)
        fullCanvas.remove()
        return croppedCanvas
      }

      // Render each element's drawing pages and combine multi-page into single image
      const tekeningen: RenderedTekening[] = []
      for (let ei = 0; ei < elementOrder.length; ei++) {
        const naam = elementOrder[ei]
        const pageNums = elementGroupMap.get(naam)!
        if (pageNums.length === 0) continue
        setProgress(`Tekeningen extraheren (${ei + 1}/${elementOrder.length})...`)

        // Render and crop each page
        const croppedCanvases: HTMLCanvasElement[] = []
        for (const pn of pageNums) {
          croppedCanvases.push(await cropPage(pn))
        }

        // Combine all cropped pages into one image (stacked vertically)
        let blob: Blob
        if (croppedCanvases.length === 1) {
          const single = croppedCanvases[0]
          blob = await new Promise<Blob>((resolve) => {
            single.toBlob((b) => resolve(b!), 'image/png', 0.9)
          })
          single.remove()
        } else {
          const maxW = Math.max(...croppedCanvases.map(c => c.width))
          const totalH = croppedCanvases.reduce((sum, c) => sum + c.height, 0) + (croppedCanvases.length - 1) * 20
          const combined = document.createElement('canvas')
          combined.width = maxW
          combined.height = totalH
          const ctx = combined.getContext('2d')!
          ctx.fillStyle = 'white'
          ctx.fillRect(0, 0, maxW, totalH)
          let yOff = 0
          for (const c of croppedCanvases) {
            ctx.drawImage(c, 0, yOff)
            yOff += c.height + 20
            c.remove()
          }
          blob = await new Promise<Blob>((resolve) => {
            combined.toBlob((b) => resolve(b!), 'image/png', 0.9)
          })
          combined.remove()
        }

        tekeningen.push({ pageNum: pageNums[0], naam, blob })
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
