'use client'

import { useState, useEffect, useCallback } from 'react'
import { saveOfferte, processLeverancierPdf, uploadLeverancierTekening, saveLeverancierTekeningen, getLeverancierPdfData, deleteLeverancierPdf } from '@/lib/actions'
import { Card, CardContent, CardFooter } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Select } from '@/components/ui/select'
import { Button } from '@/components/ui/button'
import { formatCurrency } from '@/lib/utils'
import { Plus, X, Save, Trash2, ArrowLeft, FolderKanban, FileText, Upload, Loader2, CheckCircle } from 'lucide-react'
import type { ParsedPdfResult, RenderedTekening } from './stap-tekeningen'

interface Regel {
  omschrijving: string
  aantal: number
  prijs: number
  btw_percentage: number
  product_id?: string
}

const BEZORGKOSTEN_DREMPEL = 1750
const BEZORGKOSTEN_BEDRAG = 150
const BEZORGKOSTEN_LABEL = 'Bezorgkosten'

export function StapControleren({
  offerte,
  isNew,
  readOnly,
  relatieName,
  projectName,
  offerteType,
  selectedRelatieId,
  selectedProjectId,
  regels,
  onRegelsChange,
  producten,
  pendingPdfFile,
  parsedPdfResult,
  renderedTekeningen,
  margePercentage,
  onSaved,
  onBack,
}: {
  offerte: Record<string, unknown> | null
  isNew: boolean
  readOnly?: boolean
  relatieName: string
  projectName: string
  offerteType: 'particulier' | 'zakelijk'
  selectedRelatieId: string
  selectedProjectId: string
  regels: Regel[]
  onRegelsChange: (regels: Regel[]) => void
  producten: { id: string; naam: string; prijs: number; btw_percentage: number }[]
  pendingPdfFile: File | null
  parsedPdfResult?: ParsedPdfResult | null
  renderedTekeningen?: RenderedTekening[]
  margePercentage?: number
  onSaved: (offerteId: string) => void
  onBack: () => void
}) {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [pdfUploading, setPdfUploading] = useState(false)
  const [pdfProgress, setPdfProgress] = useState('')
  const [leverancierPdf, setLeverancierPdf] = useState<{
    bestandsnaam: string
    aantalElementen: number
    totaal: number
  } | null>(pendingPdfFile && parsedPdfResult
    ? { bestandsnaam: pendingPdfFile.name, aantalElementen: parsedPdfResult.aantalElementen, totaal: parsedPdfResult.totaal }
    : pendingPdfFile
      ? { bestandsnaam: pendingPdfFile.name, aantalElementen: 0, totaal: 0 }
      : null)

  // Load existing leverancier PDF data for existing offertes
  useEffect(() => {
    if (!offerte) return
    getLeverancierPdfData(offerte.id as string).then(data => {
      if (data) {
        setLeverancierPdf({
          bestandsnaam: data.bestandsnaam,
          aantalElementen: data.elementen.length,
          totaal: 0,
        })
      }
    })
  }, [offerte])

  // Auto-bezorgkosten logica
  const updateBezorgkosten = useCallback((currentRegels: Regel[]) => {
    const kozijnenRegel = currentRegels.find(r =>
      r.omschrijving.toLowerCase().includes('kunststof kozijnen leveren') ||
      r.omschrijving.toLowerCase().includes('leveren kunststof kozijnen')
    )
    if (!kozijnenRegel) return currentRegels

    const kozijnenTotaal = kozijnenRegel.aantal * kozijnenRegel.prijs
    const bezorgIndex = currentRegels.findIndex(r => r.omschrijving === BEZORGKOSTEN_LABEL)
    const heeftBezorgkosten = bezorgIndex !== -1

    if (kozijnenTotaal < BEZORGKOSTEN_DREMPEL && kozijnenTotaal > 0) {
      if (!heeftBezorgkosten) {
        return [...currentRegels, { omschrijving: BEZORGKOSTEN_LABEL, aantal: 1, prijs: BEZORGKOSTEN_BEDRAG, btw_percentage: 21 }]
      }
    } else {
      if (heeftBezorgkosten) {
        return currentRegels.filter((_, i) => i !== bezorgIndex)
      }
    }
    return currentRegels
  }, [])

  useEffect(() => {
    if (!offerteType) return
    const updated = updateBezorgkosten(regels)
    if (updated !== regels) onRegelsChange(updated)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [regels.find(r =>
    r.omschrijving.toLowerCase().includes('kunststof kozijnen leveren') ||
    r.omschrijving.toLowerCase().includes('leveren kunststof kozijnen')
  )?.prijs, regels.find(r =>
    r.omschrijving.toLowerCase().includes('kunststof kozijnen leveren') ||
    r.omschrijving.toLowerCase().includes('leveren kunststof kozijnen')
  )?.aantal])

  function addRegel() {
    onRegelsChange([...regels, { omschrijving: '', aantal: 1, prijs: 0, btw_percentage: 21 }])
  }

  function removeRegel(index: number) {
    onRegelsChange(regels.filter((_, i) => i !== index))
  }

  function updateRegel(index: number, field: keyof Regel, value: string | number) {
    const updated = [...regels]
    updated[index] = { ...updated[index], [field]: value }
    onRegelsChange(updated)
  }

  function selectProduct(index: number, productId: string) {
    const product = producten.find(p => p.id === productId)
    if (product) {
      const updated = [...regels]
      updated[index] = {
        ...updated[index],
        product_id: productId,
        omschrijving: product.naam,
        prijs: product.prijs,
        btw_percentage: product.btw_percentage,
      }
      onRegelsChange(updated)
    }
  }

  const subtotaal = regels.reduce((sum, r) => sum + r.aantal * r.prijs, 0)
  const btwTotaal = regels.reduce((sum, r) => sum + (r.aantal * r.prijs * r.btw_percentage) / 100, 0)
  const totaal = subtotaal + btwTotaal

  async function processAndUploadLeverancierPdf(file: File, offerteId: string) {
    setPdfUploading(true)
    setPdfProgress('PDF verwerken...')

    try {
      const formData = new FormData()
      formData.set('pdf', file)
      const result = await processLeverancierPdf(offerteId, formData)

      if ('error' in result && result.error) {
        setError(result.error as string)
        setPdfUploading(false)
        setPdfProgress('')
        return
      }

      const { totaal: pdfTotaal, elementen } = result as {
        totaal: number
        elementen: { naam: string }[]
        aantalElementen: number
        pdfPath: string
      }

      setPdfProgress(`Tekeningen extraheren (0/${elementen.length})...`)

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

      // Group pages per element (same logic as stap-tekeningen)
      // Orphan drawing pages go to PREVIOUS element unless they contain standalone product keywords
      const elementGroupMap = new Map<string, number[]>()
      const elementOrder: string[] = []
      for (const scan of allPageScans) {
        if (scan.naam) {
          if (!elementGroupMap.has(scan.naam)) {
            elementGroupMap.set(scan.naam, [])
            elementOrder.push(scan.naam)
          }
          const pages = elementGroupMap.get(scan.naam)!
          if (scan.hasDrawing && !pages.includes(scan.pageNum)) pages.push(scan.pageNum)
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
      for (const scan of allPageScans) {
        if (scan.naam && elementGroupMap.has(scan.naam) && elementGroupMap.get(scan.naam)!.length === 0) {
          elementGroupMap.get(scan.naam)!.push(scan.pageNum)
        }
      }
      for (const pages of elementGroupMap.values()) { pages.sort((a, b) => a - b) }

      const tekeningData: { naam: string; tekeningPath: string }[] = []

      for (let ei = 0; ei < elementOrder.length; ei++) {
        const naam = elementOrder[ei]
        const pageNums = elementGroupMap.get(naam)!
        if (pageNums.length === 0) continue
        setPdfProgress(`Tekeningen extraheren (${ei + 1}/${elementOrder.length})...`)

        // Helper: render and crop a single page
        async function cropPage(pn: number) {
          const pg = await pdf.getPage(pn)
          const vp = pg.getViewport({ scale: 3 })
          const fc = document.createElement('canvas')
          fc.width = vp.width; fc.height = vp.height
          const fctx = fc.getContext('2d')!
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          await pg.render({ canvasContext: fctx, viewport: vp, canvas: fc } as any).promise as void
          const w = vp.width, h = vp.height

          const ptc = await pg.getTextContent()
          const hdrPats = [/(?:Gekoppeld\s+)?(?:Deur|Element)\s+\d/i, /Hoeveelheid|Hoev\./, /^Systeem\s*:/, /^Kleur\s*:/]
          const specKw = /^(Vullingen|Beslag|Sluiting|Scharnieren|Gevraagd|Paneel|Afwatering|Hoekverbinding|Montage|Sluitcilinder|Commentaar|Dorpel|Lak\s*kleur|Buitenkader|Glazing|Muur|Versterking|Berichten|Bijprofiel|Eenheidsgewicht|Omtrek|Total\s+perimeter|Toebehoren|Prijs|Thermische|Kader|Toelaatbare|Stijl|Montage\s*ankers|Samen|Gemiddelde|Rolluikkast|Rolluikblad|Geleiders|Handling)/i
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const txtItems = (ptc.items as any[])
            .filter((it: any) => 'str' in it && it.str.trim())
            .map((it: any) => ({ str: it.str.trim(), cy: Math.round(h - it.transform[5] * 3), cx: Math.round(it.transform[4] * 3) }))
          const hdrCands = txtItems.filter((i: { str: string; cy: number }) => i.cy < h * 0.25 && hdrPats.some(p => p.test(i.str)))
          let hdrBot = Math.floor(h * 0.06)
          if (hdrCands.length > 0) {
            const maxCy = Math.max(...hdrCands.map((i: { cy: number }) => i.cy))
            const leftIt = txtItems.filter((i: { cx: number; cy: number }) => i.cx < w * 0.45 && i.cy >= maxCy).sort((a: { cy: number }, b: { cy: number }) => a.cy - b.cy)
            let clBot = maxCy
            const isDimLabel = (s: string) => /^\d+([.,]\d+)?$/.test(s)
            for (let idx = 1; idx < leftIt.length; idx++) { if (leftIt[idx].cy - leftIt[idx - 1].cy > 80) break; if (isDimLabel(leftIt[idx].str) && leftIt[idx].cy > maxCy + 50) break; if (specKw.test(leftIt[idx].str)) break; clBot = leftIt[idx].cy }
            hdrBot = clBot + 20
          }
          // Skip colored header bar (solid-color rows below text header)
          for (let y = hdrBot; y < Math.floor(h * 0.30); y += 2) {
            const sW = Math.floor(w * 0.60)
            const rd = fctx.getImageData(0, y, sW, 1).data
            const smp = Math.floor(sW / 2)
            let dk = 0
            for (let px = 0; px < sW; px += 2) { if (rd[px*4] < 200 || rd[px*4+1] < 200 || rd[px*4+2] < 200) dk++ }
            if (dk < smp * 0.15) { hdrBot = y; break }
          }
          // Find right boundary using spec keyword detection
          //   Find view labels first to distinguish side-column specs from bottom-section specs
          const viewLabelItemsForBound = txtItems.filter((i: { str: string; cy: number }) =>
            /Binnenaanzicht|Binnenzicht|Buitenaanzicht|Buitenzicht/i.test(i.str) && i.cy > hdrBot
          )
          const firstViewLabelCy = viewLabelItemsForBound.length > 0
            ? Math.min(...viewLabelItemsForBound.map((i: { cy: number }) => i.cy))
            : Infinity
          const specItems = txtItems.filter((i: { str: string; cx: number; cy: number }) =>
            i.cx > w * 0.35 && i.cy > hdrBot && i.cy < h * 0.90 && specKw.test(i.str)
          )
          let rBound: number
          if (specItems.length >= 2) {
            // Only treat as side-column if spec items exist ABOVE the first view label.
            // Specs below view labels are bottom sections (e.g. schuifpui buitenaanzicht page),
            // not side columns, and should not constrain the drawing width.
            const sideColSpecs = specItems.filter((i: { cy: number }) => i.cy < firstViewLabelCy)
            if (sideColSpecs.length >= 2) {
              const specLeftX = Math.min(...sideColSpecs.map((i: { cx: number }) => i.cx))
              rBound = specLeftX - 30
              rBound = Math.max(rBound, Math.floor(w * 0.35))
            } else { rBound = Math.floor(w * 0.92) }
          } else { rBound = Math.floor(w * 0.92) }
          // Find "SPECIFICATIES" text — hard boundary to exclude leverancier spec sections
          const specsHdrItems = txtItems.filter((i: { str: string; cy: number }) =>
            /^SPECIFICATIES$|^Specificaties$/i.test(i.str) && i.cy > hdrBot
          )
          let specsHdrCy = Infinity
          if (specsHdrItems.length > 0) {
            specsHdrCy = Math.min(...specsHdrItems.map((i: { cy: number }) => i.cy))
          }
          const scanBotStart = specsHdrCy < Infinity ? specsHdrCy - 10 : Math.floor(h * 0.90)
          let bBot = scanBotStart
          for (let y = scanBotStart; y > Math.floor(h * 0.30); y -= 3) {
            const row = fctx.getImageData(0, y, rBound, 1).data
            let nw = 0
            for (let px = 0; px < rBound; px += 2) { if (row[px*4] < 230 || row[px*4+1] < 230 || row[px*4+2] < 230) nw++ }
            if (nw > 5) { bBot = Math.min(y + 30, scanBotStart); break }
          }
          // Constrain bottom to just below the last view label
          if (viewLabelItemsForBound.length > 0) {
            const lastVLCy = Math.max(...viewLabelItemsForBound.map((i: { cy: number }) => i.cy))
            bBot = Math.min(bBot, lastVLCy + 60)
          }
          // On full-width pages, constrain bottom only if spec keywords appear below the drawing
          if (rBound > Math.floor(w * 0.70)) {
            const vLabels = txtItems.filter((i: { str: string; cy: number }) =>
              /Binnenaanzicht|Binnenzicht|Buitenaanzicht|Buitenzicht/i.test(i.str) && i.cy > hdrBot
            )
            if (vLabels.length > 0) {
              const lastCy = Math.max(...vLabels.map((i: { cy: number }) => i.cy))
              const specsBelowDrawing = txtItems.filter((i: { str: string; cy: number }) =>
                i.cy > lastCy + 20 && specKw.test(i.str)
              )
              if (specsBelowDrawing.length > 0) {
                const firstSpecCy = Math.min(...specsBelowDrawing.map((i: { cy: number }) => i.cy))
                bBot = Math.min(bBot, firstSpecCy - 15)
              }
              // Detect colored bars (e.g. purple Samenvatting table header) below the drawing
              for (let y = lastCy + 30; y < bBot; y += 3) {
                const rd = fctx.getImageData(0, y, rBound, 1).data
                let colored = 0
                for (let px = 0; px < rBound; px += 2) {
                  const r = rd[px*4], g = rd[px*4+1], b = rd[px*4+2]
                  const mx = Math.max(r, g, b), mn = Math.min(r, g, b)
                  if (mx - mn > 40 && mx > 50 && r + g + b < 600) colored++
                }
                if (colored > Math.floor(rBound / 4) * 0.10) { bBot = Math.min(bBot, y - 15); break }
              }
              // Detect summary tables below drawing via white gap after view labels
              let wgs = -1
              for (let y = lastCy + 40; y < bBot; y += 3) {
                const rd = fctx.getImageData(0, y, rBound, 1).data
                let nw = 0
                for (let px = 0; px < rBound; px += 2) { if (rd[px*4] < 230 || rd[px*4+1] < 230 || rd[px*4+2] < 230) nw++ }
                if (nw <= 3) { if (wgs < 0) wgs = y }
                else { if (wgs >= 0 && y - wgs >= 40) { bBot = Math.min(bBot, wgs); break } wgs = -1 }
              }
            }
          }
          // 4. Find top of content
          let cTop = hdrBot
          let fstCY = hdrBot
          for (let y = hdrBot; y < Math.floor(h * 0.40); y += 3) {
            const row = fctx.getImageData(0, y, rBound, 1).data
            let nw = 0
            for (let px = 0; px < rBound; px += 2) { if (row[px*4] < 230 || row[px*4+1] < 230 || row[px*4+2] < 230) nw++ }
            if (nw > 5) { fstCY = y; cTop = Math.max(hdrBot, y - 80); break }
          }
          // 4b. Skip remark text between header and drawing (pixel-based gap detection)
          if (firstViewLabelCy < Infinity) {
            const maxSY = Math.min(fstCY + Math.floor(h * 0.15), firstViewLabelCy - 150)
            let cw = 0, lcbg = fstCY
            for (let y = fstCY + 3; y < maxSY; y += 3) {
              const row = fctx.getImageData(0, y, rBound, 1).data
              let nw = 0
              for (let px = 0; px < rBound; px += 2) { if (row[px*4] < 230 || row[px*4+1] < 230 || row[px*4+2] < 230) nw++ }
              if (nw > 3) {
                if (cw >= 60) {
                  const pgh = lcbg - fstCY
                  if (pgh >= 10 && pgh < 150) {
                    const pgt = txtItems.filter((i: { str: string; cy: number; cx: number }) =>
                      i.cy >= fstCY - 10 && i.cy <= lcbg + 10 && i.cx < rBound && !/^\d+([.,]\d+)?$/.test(i.str)
                    )
                    if (pgt.length > 0) { cTop = Math.max(hdrBot, y - 30) }
                  }
                  break
                }
                cw = 0; lcbg = y
              } else { cw += 3 }
            }
            if (cTop > firstViewLabelCy - 100) { cTop = Math.max(hdrBot, firstViewLabelCy - 100) }
          }
          const cW = rBound, cH = bBot - cTop
          const cc = document.createElement('canvas'); cc.width = cW; cc.height = cH
          cc.getContext('2d')!.drawImage(fc, 0, cTop, cW, cH, 0, 0, cW, cH)
          fc.remove()
          return cc
        }

        // Render and crop all pages, then combine
        const croppedCanvases: HTMLCanvasElement[] = []
        for (const pn of pageNums) { croppedCanvases.push(await cropPage(pn)) }

        let blob: Blob
        if (croppedCanvases.length === 1) {
          const single = croppedCanvases[0]
          blob = await new Promise<Blob>((resolve) => { single.toBlob((b) => resolve(b!), 'image/png', 0.9) })
          single.remove()
        } else {
          const maxW = Math.max(...croppedCanvases.map(c => c.width))
          const totalH = croppedCanvases.reduce((sum, c) => sum + c.height, 0) + (croppedCanvases.length - 1) * 20
          const combined = document.createElement('canvas')
          combined.width = maxW; combined.height = totalH
          const ctx = combined.getContext('2d')!
          ctx.fillStyle = 'white'; ctx.fillRect(0, 0, maxW, totalH)
          let yOff = 0
          for (const c of croppedCanvases) { ctx.drawImage(c, 0, yOff); yOff += c.height + 20; c.remove() }
          blob = await new Promise<Blob>((resolve) => { combined.toBlob((b) => resolve(b!), 'image/png', 0.9) })
          combined.remove()
        }

        const imgFormData = new FormData()
        imgFormData.set('image', blob, `tekening-${pageNums[0]}.png`)
        const uploadResult = await uploadLeverancierTekening(offerteId, pageNums[0], imgFormData)

        const path = ('path' in uploadResult && uploadResult.path) ? uploadResult.path : `leverancier-pdfs/${offerteId}/tekening-${pageNums[0]}.png`

        tekeningData.push({ naam, tekeningPath: path })
      }

      setPdfProgress('Opslaan...')
      await saveLeverancierTekeningen(offerteId, tekeningData)

      if (pdfTotaal > 0) {
        const kozijnRegelIndex = regels.findIndex(r =>
          r.omschrijving.toLowerCase().includes('kunststof kozijnen leveren') ||
          r.omschrijving.toLowerCase().includes('leveren kunststof kozijnen')
        )
        if (kozijnRegelIndex !== -1) {
          const updated = [...regels]
          updated[kozijnRegelIndex] = { ...updated[kozijnRegelIndex], prijs: pdfTotaal }
          onRegelsChange(updated)
        }
      }

      setLeverancierPdf({
        bestandsnaam: file.name,
        aantalElementen: elementOrder.length,
        totaal: pdfTotaal,
      })

      setPdfUploading(false)
      setPdfProgress('')
    } catch (err) {
      console.error('PDF upload error:', err)
      setError('Fout bij verwerken van PDF')
      setPdfUploading(false)
      setPdfProgress('')
    }
  }

  async function uploadPreProcessedPdf(
    file: File,
    offerteId: string,
    parsed: ParsedPdfResult,
    tekeningen: RenderedTekening[]
  ) {
    setPdfUploading(true)
    setPdfProgress('PDF uploaden...')

    try {
      // Step 1: Upload original PDF + store metadata via existing server action
      const formData = new FormData()
      formData.set('pdf', file)
      const result = await processLeverancierPdf(offerteId, formData)

      if ('error' in result && result.error) {
        setError(result.error as string)
        setPdfUploading(false)
        setPdfProgress('')
        return
      }

      // Step 2: Upload pre-rendered PNGs
      const tekeningData: { naam: string; tekeningPath: string }[] = []

      for (let i = 0; i < tekeningen.length; i++) {
        const { pageNum, naam, blob } = tekeningen[i]
        setPdfProgress(`Tekeningen uploaden (${i + 1}/${tekeningen.length})...`)

        const imgFormData = new FormData()
        imgFormData.set('image', blob, `tekening-${pageNum}.png`)
        const uploadResult = await uploadLeverancierTekening(offerteId, pageNum, imgFormData)

        const path = ('path' in uploadResult && uploadResult.path)
          ? uploadResult.path
          : `leverancier-pdfs/${offerteId}/tekening-${pageNum}.png`

        tekeningData.push({ naam, tekeningPath: path })
      }

      // Step 3: Save tekening mappings + marge
      setPdfProgress('Opslaan...')
      await saveLeverancierTekeningen(offerteId, tekeningData, margePercentage)

      setLeverancierPdf({
        bestandsnaam: file.name,
        aantalElementen: tekeningen.length,
        totaal: parsed.totaal,
      })

      setPdfUploading(false)
      setPdfProgress('')
    } catch (err) {
      console.error('PDF upload error:', err)
      setError('Fout bij uploaden van PDF')
      setPdfUploading(false)
      setPdfProgress('')
    }
  }

  async function handleDeleteLeverancierPdf() {
    if (!offerte || !confirm('Leverancier PDF verwijderen?')) return
    setPdfUploading(true)
    await deleteLeverancierPdf(offerte.id as string)
    setLeverancierPdf(null)
    setPdfUploading(false)
  }

  async function handleLeverancierPdfUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file || !offerte) return
    e.target.value = ''
    await processAndUploadLeverancierPdf(file, offerte.id as string)
  }

  async function handleSubmit(formData: FormData) {
    setLoading(true)
    setError('')
    if (offerte) formData.set('id', offerte.id as string)
    formData.set('relatie_id', selectedRelatieId)
    formData.set('regels', JSON.stringify(regels))
    if (selectedProjectId) formData.set('project_id', selectedProjectId)
    const result = await saveOfferte(formData)
    if (result.error) {
      setError(result.error)
      setLoading(false)
      return
    }

    const offerteId = result.id!

    // Upload pre-processed PDF data or process from scratch
    if (pendingPdfFile && parsedPdfResult && renderedTekeningen && renderedTekeningen.length > 0) {
      setLoading(false)
      await uploadPreProcessedPdf(pendingPdfFile, offerteId, parsedPdfResult, renderedTekeningen)
    } else if (pendingPdfFile) {
      // Fallback for edit mode or when PDF wasn't pre-processed
      setLoading(false)
      await processAndUploadLeverancierPdf(pendingPdfFile, offerteId)
    }

    setLoading(false)
    onSaved(offerteId)
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-xl font-semibold text-gray-900">
            {isNew ? 'Offerte controleren' : `Offerte ${offerte?.offertenummer}`}
          </h2>
          <p className="text-sm text-gray-500 mt-1">Controleer de regels, prijzen en details</p>
        </div>
        <Button variant="ghost" onClick={onBack}>
          <ArrowLeft className="h-4 w-4" />
          Terug
        </Button>
      </div>

      {error && <div className="bg-red-50 text-red-600 text-sm p-3 rounded-md mb-4">{error}</div>}

      {/* Project info banner */}
      {isNew && projectName && (
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 mb-4 flex items-center gap-2">
          <FolderKanban className="h-4 w-4 text-blue-600" />
          <span className="text-sm text-blue-800">
            Klant: <strong>{relatieName}</strong> &middot; Project: <strong>{projectName}</strong>
            &middot; {offerteType === 'particulier' ? 'Particulier' : 'Zakelijk'}
          </span>
        </div>
      )}

      <form action={handleSubmit} className="space-y-4">
        <Card>
          <CardContent className="space-y-4 pt-6">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {isNew ? (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Offertenummer</label>
                  <div className="px-3 py-2 border border-gray-200 rounded-md text-sm bg-gray-50 text-gray-500">
                    Wordt automatisch gegenereerd
                  </div>
                </div>
              ) : (
                <Input id="offertenummer" name="offertenummer" label="Offertenummer" defaultValue={(offerte?.offertenummer as string) || ''} readOnly />
              )}
              <Input id="datum" name="datum" label="Datum *" type="date" defaultValue={(offerte?.datum as string) || new Date().toISOString().split('T')[0]} required />
              <Input id="geldig_tot" name="geldig_tot" label="Geldig tot" type="date" defaultValue={(offerte?.geldig_tot as string) || ''} />
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <Select
                id="status"
                name="status"
                label="Status"
                defaultValue={(offerte?.status as string) || 'concept'}
                options={[
                  { value: 'concept', label: 'Concept' },
                  { value: 'verzonden', label: 'Verzonden' },
                  { value: 'geaccepteerd', label: 'Geaccepteerd' },
                  { value: 'afgewezen', label: 'Afgewezen' },
                  { value: 'verlopen', label: 'Verlopen' },
                ]}
              />
              <Input id="onderwerp" name="onderwerp" label="Onderwerp" defaultValue={(offerte?.onderwerp as string) || ''} />
            </div>
          </CardContent>
        </Card>

        <Card>
          <div className="px-6 py-4 border-b border-gray-200 flex items-center justify-between">
            <div>
              <h3 className="font-semibold text-gray-900">Regelitems</h3>
              {regels.some(r => r.omschrijving === BEZORGKOSTEN_LABEL) && (
                <p className="text-xs text-orange-600 mt-0.5">
                  Bezorgkosten automatisch toegevoegd (kozijnen onder {formatCurrency(BEZORGKOSTEN_DREMPEL)})
                </p>
              )}
            </div>
            {!readOnly && (
            <Button type="button" variant="secondary" size="sm" onClick={addRegel}>
              <Plus className="h-3 w-3" />
              Regel toevoegen
            </Button>
            )}
          </div>
          <CardContent>
            <div className="space-y-3">
              {regels.map((regel, i) => {
                const isBezorgkosten = regel.omschrijving === BEZORGKOSTEN_LABEL
                return (
                  <div key={i} className={`grid grid-cols-12 gap-2 items-end ${isBezorgkosten ? 'opacity-60 bg-orange-50 -mx-2 px-2 py-1 rounded' : ''}`}>
                    <div className="col-span-1">
                      <select className="w-full px-2 py-2 border border-gray-300 rounded-md text-xs" value={regel.product_id || ''} onChange={(e) => selectProduct(i, e.target.value)} disabled={isBezorgkosten}>
                        <option value="">--</option>
                        {producten.map(p => (<option key={p.id} value={p.id}>{p.naam}</option>))}
                      </select>
                    </div>
                    <div className="col-span-4">
                      <input placeholder="Omschrijving" className="w-full px-2 py-2 border border-gray-300 rounded-md text-sm" value={regel.omschrijving} onChange={(e) => updateRegel(i, 'omschrijving', e.target.value)} required readOnly={isBezorgkosten} />
                    </div>
                    <div className="col-span-2">
                      <input type="number" placeholder="Aantal" step="0.01" className="w-full px-2 py-2 border border-gray-300 rounded-md text-sm" value={regel.aantal} onChange={(e) => updateRegel(i, 'aantal', parseFloat(e.target.value) || 0)} readOnly={isBezorgkosten} />
                    </div>
                    <div className="col-span-2">
                      <input type="number" placeholder="Prijs" step="0.01" className="w-full px-2 py-2 border border-gray-300 rounded-md text-sm" value={regel.prijs} onChange={(e) => updateRegel(i, 'prijs', parseFloat(e.target.value) || 0)} readOnly={isBezorgkosten} />
                    </div>
                    <div className="col-span-1">
                      <select className="w-full px-2 py-2 border border-gray-300 rounded-md text-xs" value={regel.btw_percentage} onChange={(e) => updateRegel(i, 'btw_percentage', parseInt(e.target.value))} disabled={isBezorgkosten}>
                        <option value={0}>0%</option>
                        <option value={9}>9%</option>
                        <option value={21}>21%</option>
                      </select>
                    </div>
                    <div className="col-span-1 text-right text-sm font-medium">
                      {formatCurrency(regel.aantal * regel.prijs)}
                    </div>
                    <div className="col-span-1">
                      {!isBezorgkosten && (
                        <button type="button" onClick={() => removeRegel(i)} className="p-1 text-gray-400 hover:text-red-500">
                          <X className="h-4 w-4" />
                        </button>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>

            <div className="mt-6 flex justify-end">
              <div className="w-64 space-y-1 text-sm">
                <div className="flex justify-between"><span>Subtotaal:</span><span>{formatCurrency(subtotaal)}</span></div>
                <div className="flex justify-between"><span>BTW:</span><span>{formatCurrency(btwTotaal)}</span></div>
                <div className="flex justify-between font-bold text-base border-t pt-1"><span>Totaal:</span><span>{formatCurrency(totaal)}</span></div>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Leverancier PDF info */}
        {(leverancierPdf || (!isNew)) && (
          <Card>
            <div className="px-6 py-4 border-b border-gray-200">
              <h3 className="font-semibold text-gray-900">Leverancier PDF</h3>
            </div>
            <CardContent className="pt-4">
              {pdfUploading ? (
                <div className="flex items-center gap-3 py-6 justify-center">
                  <Loader2 className="h-5 w-5 animate-spin text-primary" />
                  <span className="text-sm text-gray-600">{pdfProgress || 'Verwerken...'}</span>
                </div>
              ) : leverancierPdf ? (
                <div className={`flex items-center justify-between rounded-lg p-4 ${
                  parsedPdfResult || !pendingPdfFile ? 'bg-green-50 border border-green-200' : 'bg-blue-50 border border-blue-200'
                }`}>
                  <div className="flex items-center gap-3">
                    {parsedPdfResult || !pendingPdfFile
                      ? <CheckCircle className="h-8 w-8 text-green-600" />
                      : <FileText className="h-8 w-8 text-blue-600" />
                    }
                    <div>
                      <p className="text-sm font-medium text-gray-900">{leverancierPdf.bestandsnaam}</p>
                      <p className={`text-xs ${parsedPdfResult || !pendingPdfFile ? 'text-green-700' : 'text-blue-700'}`}>
                        {leverancierPdf.aantalElementen > 0
                          ? <>{leverancierPdf.aantalElementen} kozijntekeningen gevonden{leverancierPdf.totaal > 0 && <> &middot; Totaal: {formatCurrency(leverancierPdf.totaal)}</>}</>
                          : 'Wordt verwerkt bij opslaan'
                        }
                      </p>
                    </div>
                  </div>
                  {!isNew && !pendingPdfFile && (
                    <div className="flex items-center gap-2">
                      <label className="cursor-pointer">
                        <input type="file" accept=".pdf" className="hidden" onChange={handleLeverancierPdfUpload} />
                        <span className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50">
                          <Upload className="h-3 w-3" /> Vervangen
                        </span>
                      </label>
                      <button type="button" onClick={handleDeleteLeverancierPdf} className="p-1.5 text-gray-400 hover:text-red-500">
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  )}
                </div>
              ) : !isNew ? (
                <label className="flex flex-col items-center justify-center py-6 border-2 border-dashed border-gray-300 rounded-lg cursor-pointer hover:border-primary hover:bg-gray-50 transition-colors">
                  <Upload className="h-6 w-6 text-gray-400 mb-1" />
                  <span className="text-sm text-gray-600">Klik om leverancier PDF te uploaden</span>
                  <input type="file" accept=".pdf" className="hidden" onChange={handleLeverancierPdfUpload} />
                </label>
              ) : null}
            </CardContent>
          </Card>
        )}

        <Card>
          <CardContent className="pt-6">
            <label htmlFor="opmerkingen" className="block text-sm font-medium text-gray-700 mb-1">Opmerkingen</label>
            <textarea
              id="opmerkingen"
              name="opmerkingen"
              rows={3}
              defaultValue={(offerte?.opmerkingen as string) || ''}
              className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent"
            />
          </CardContent>
          {!readOnly && (
          <CardFooter className="flex justify-between">
            <div />
            <Button type="submit" disabled={loading || pdfUploading}>
              <Save className="h-4 w-4" />
              {loading ? 'Opslaan...' : pdfUploading ? 'PDF verwerken...' : 'Opslaan & versturen'}
            </Button>
          </CardFooter>
          )}
        </Card>
      </form>
    </div>
  )
}
