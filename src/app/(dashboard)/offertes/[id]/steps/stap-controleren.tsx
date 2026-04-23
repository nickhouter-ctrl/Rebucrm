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
  aantal: number | string
  prijs: number | string
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
  elementMarges,
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
  elementMarges?: Record<string, number>
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
    const kozijnenRegel = currentRegels.find(r => {
      const o = r.omschrijving.toLowerCase()
      return o.includes('kozijn') && (o.includes('lever') || o.includes('kunststof'))
    })
    if (!kozijnenRegel) return currentRegels

    const kozijnenTotaal = (parseFloat(String(kozijnenRegel.aantal)) || 0) * (parseFloat(String(kozijnenRegel.prijs)) || 0)
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
  }, [regels.find(r => {
    const o = r.omschrijving.toLowerCase()
    return o.includes('kozijn') && (o.includes('lever') || o.includes('kunststof'))
  })?.prijs, regels.find(r => {
    const o = r.omschrijving.toLowerCase()
    return o.includes('kozijn') && (o.includes('lever') || o.includes('kunststof'))
  })?.aantal])

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

  const numVal = (v: number | string) => parseFloat(String(v)) || 0
  const subtotaal = regels.reduce((sum, r) => sum + numVal(r.aantal) * numVal(r.prijs), 0)
  const btwTotaal = regels.reduce((sum, r) => sum + (numVal(r.aantal) * numVal(r.prijs) * r.btw_percentage) / 100, 0)
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
        elementen: { naam: string; prijs: number; hoeveelheid: number }[]
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
      // Match element headers — Positie must be followed by exactly 3 digits and then non-digit (prevents matching "908" from prices like "908,16")
      const elementHeaderPattern = /(?:Gekoppeld\s+element|Deur|Element)\s+\d{3}(?:\/\d+)?|Merk\s+[\dA-Z]+|Positie\s*\d{3}(?!\d|[.,]\d)/i
      const gealanNLHeaderPattern = /Productie\s+maten\s+([\s\S]+?)\s+Aantal\s*:\s*\d+\s+Verbinding\s*:/i
      const standaloneProductPattern = /\b(Rolluik|Rolladen|Rollo|Zonwering|Screen|Hor(?:re)?|Insecten\s*hor|Fly\s*screen)\b/i
      const allPageScans: { pageNum: number; naam: string | null; hasDrawing: boolean; isStandaloneProduct: boolean }[] = []
      for (let pageNum = 2; pageNum <= totalPages; pageNum++) {
        const page = await pdf.getPage(pageNum)
        const textContent = await page.getTextContent()
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const pageText = textContent.items.map((item: any) => ('str' in item ? item.str : '')).join(' ')
        const headerMatch = pageText.match(elementHeaderPattern)
        const gealanNLMatch = !headerMatch ? pageText.match(gealanNLHeaderPattern) : null
        const hasDrawing = /Binnenaanzicht|Binnenzicht|Buitenaanzicht|Buitenzicht|BUITEN\s*ZICHT|BINNEN\s*ZICHT|AANZICHT\s*:\s*BUITEN/i.test(pageText)
        const isStandaloneProduct = standaloneProductPattern.test(pageText)
        let elementNaam: string | null = null
        if (headerMatch) {
          elementNaam = headerMatch[0].replace(/Positie\s*(\d{3})/, 'Positie $1')
        } else if (gealanNLMatch) {
          elementNaam = gealanNLMatch[1].replace(/\s+/g, ' ').trim()
        }
        allPageScans.push({ pageNum, naam: elementNaam, hasDrawing, isStandaloneProduct })
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

      // Helper: render page with only the top leverancier header cropped away
      async function renderPageWithHeaderCrop(pn: number) {
        const pg = await pdf.getPage(pn)
        const vp = pg.getViewport({ scale: 2 })
        const cvs = document.createElement('canvas')
        cvs.width = vp.width; cvs.height = vp.height
        const ctx = cvs.getContext('2d')!
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        await pg.render({ canvasContext: ctx, viewport: vp, canvas: cvs } as any).promise as void
        const w = Math.floor(vp.width), h = Math.floor(vp.height)

        const tc = await pg.getTextContent()
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const txtItems = (tc.items as any[])
          .filter((it: any) => 'str' in it && it.str.trim())
          .map((it: any) => ({ str: it.str.trim(), cx: Math.round(it.transform[4] * 2), cy: Math.round(h - it.transform[5] * 2) }))

        const headerMatch = txtItems.find((i: { str: string; cy: number }) =>
          i.cy < h * 0.20 && /(?:Gekoppeld\s+)?(?:Deur|Element)\s+\d{3}|Merk\s+[\dA-Z]+|Positie|Binnenzicht|Productie\s+maten/i.test(i.str)
        )
        const isGealanPg = !!headerMatch && (/Merk\s+[\dA-Z]+/i.test(headerMatch.str) || /Productie\s+maten/i.test(headerMatch.str))
        let cropTop = Math.floor(h * 0.04)
        if (headerMatch) cropTop = Math.max(0, headerMatch.cy - 30)
        if (!isGealanPg) {
          const sW = Math.floor(w * 0.25), smp = Math.floor(sW / 2)
          for (let y = cropTop; y < Math.floor(h * 0.25); y += 2) {
            const rd = ctx.getImageData(0, y, sW, 1).data
            let dk = 0
            for (let px = 0; px < sW; px += 2) { if (rd[px*4] < 200 || rd[px*4+1] < 200 || rd[px*4+2] < 200) dk++ }
            if (dk > smp * 0.80) cropTop = y + 4
          }
        }

        // Hide supplier prices on green bars
        // Detect green bars, paint over text with bar's own green color
        // Preserves bar as separator (no white stripes), hides price text
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
        // Volledige bar-rechthoek witten (dekt ook niet-groene prijs-tekst op de balk)
        for (const bar of bars) {
          let barLeft = w, barRight = 0
          for (let y = bar.start; y < bar.end; y++) {
            for (let x = 0; x < w; x++) {
              const idx = (y * w + x) * 4
              const r = imgData.data[idx], g = imgData.data[idx + 1], b = imgData.data[idx + 2]
              if (g > 80 && g > r + 20 && g > b + 20) {
                if (x < barLeft) barLeft = x
                if (x > barRight) barRight = x
              }
            }
          }
          if (barRight > barLeft) {
            const padL = Math.max(0, barLeft - 3)
            const padR = Math.min(w, barRight + 4)
            ctx.fillStyle = '#FFFFFF'
            ctx.fillRect(padL, bar.start, padR - padL, bar.end - bar.start)
          }
        }

        // Alleen expliciete prijs-labels wissen (geen brede numerieke match — dat
        // veegde ook dimensies op de tekening weg).
        const explicitPricePattern = /^(€\s*[\d.,]+|[\d.,]+\s*€|Netto\s*prijs|Netto\s*totaal|Prijs\s*TOT\.?|Prijs\s*van\s*het\s*element|Deurprijs|Totaal\s*excl|Totaal\s*incl|Totaal\s*netto|Subtotaal|Cena\s*netto|Cena\s*brutto|Kosztorys|Razem|Suma|Preis|Gesamt|[\d.,]+\s*(?:EUR|PLN|USD|GBP)\b)$/i
        for (const ti of txtItems) {
          if (explicitPricePattern.test(ti.str) || /geen\s*garantie/i.test(ti.str)) {
            ctx.fillStyle = '#FFFFFF'
            ctx.fillRect(Math.max(0, ti.cx - 8), ti.cy - 18, w - Math.max(0, ti.cx - 8), 26)
          }
        }

        // Wis het hele Raam/Totaal tabelblok (inclusief lijnen)
        const raamItem = txtItems.find((ti: { str: string; cy: number }) => /^Raam$/i.test(ti.str) && ti.cy > h * 0.5)
        const totaalItem = txtItems.find((ti: { str: string; cy: number }) => /^Totaal$/i.test(ti.str) && ti.cy > h * 0.5)
        if (raamItem || totaalItem) {
          const topY = raamItem ? raamItem.cy - 25 : (totaalItem ? totaalItem.cy - 25 : 0)
          const botY = totaalItem ? totaalItem.cy + 15 : (raamItem ? raamItem.cy + 40 : 0)
          if (topY > 0 && botY > topY) {
            const blockLeft = Math.min(raamItem?.cx ?? w, totaalItem?.cx ?? w) - 40
            ctx.fillStyle = '#FFFFFF'
            ctx.fillRect(Math.max(0, blockLeft), topY, w - blockLeft, botY - topY)
          }
        }

        // Slim: wis van bovenste prijs-tabel-header tot onderkant. Alleen als we
        // zo'n header vinden, anders laten staan (voorkomt witte strepen).
        const bottomBlockPattern = /^(NETTO|BRUTO|BTW|Producten|Artikelen|Profielen|Diensten|Extra\s*kosten|Totaal\s*netto|Totaal\s*bruto|Netto\s*prijs|Netto\s*totaal|Prijs\s*TOT|Deurprijs|Cena\s*netto|Cena\s*brutto|Kosztorys|Razem|Suma\s+\w+|Preis|Gesamt|Vullingen|Prijs\s+van\s+het\s+element)$/i
        let bottomCutoff: number | null = null
        for (const ti of txtItems) {
          if (ti.cy > h * 0.55 && bottomBlockPattern.test(ti.str)) {
            const candidate = Math.max(0, ti.cy - 18)
            if (bottomCutoff === null || candidate < bottomCutoff) bottomCutoff = candidate
          }
        }
        if (bottomCutoff !== null && bottomCutoff < h) {
          ctx.fillStyle = '#FFFFFF'
          ctx.fillRect(0, bottomCutoff, w, h - bottomCutoff)
        }

        const cropBot = Math.floor(h * 0.97), cropH = cropBot - cropTop
        const cc = document.createElement('canvas'); cc.width = w; cc.height = cropH
        cc.getContext('2d')!.drawImage(cvs, 0, cropTop, w, cropH, 0, 0, w, cropH)
        cvs.remove()
        return cc
      }

      const tekeningData: { naam: string; tekeningPath: string; pageIndex: number; totalPages: number }[] = []

      for (let ei = 0; ei < elementOrder.length; ei++) {
        const naam = elementOrder[ei]
        const pageNums = elementGroupMap.get(naam)!
        if (pageNums.length === 0) continue
        setPdfProgress(`Tekeningen extraheren (${ei + 1}/${elementOrder.length})...`)

        for (let pi = 0; pi < pageNums.length; pi++) {
          const croppedCanvas = await renderPageWithHeaderCrop(pageNums[pi])
          const blob = await new Promise<Blob>((resolve) => {
            croppedCanvas.toBlob((b) => resolve(b!), 'image/jpeg', 0.85)
          })
          croppedCanvas.remove()

          const imgFormData = new FormData()
          imgFormData.set('image', blob, `tekening-${pageNums[pi]}.jpg`)
          const uploadResult = await uploadLeverancierTekening(offerteId, pageNums[pi], imgFormData)
          const path = ('path' in uploadResult && uploadResult.path) ? uploadResult.path : `leverancier-pdfs/${offerteId}/tekening-${pageNums[pi]}.jpg`
          tekeningData.push({ naam, tekeningPath: path, pageIndex: pi, totalPages: pageNums.length })
        }
      }

      setPdfProgress('Opslaan...')
      const elPrijzen: Record<string, { prijs: number; hoeveelheid: number }> = {}
      for (const el of elementen) {
        elPrijzen[el.naam] = { prijs: el.prijs, hoeveelheid: el.hoeveelheid }
      }
      await saveLeverancierTekeningen(offerteId, tekeningData, undefined, undefined, elPrijzen)

      if (pdfTotaal > 0) {
        const updated = [...regels]
        let idx = updated.findIndex(r => {
          const o = r.omschrijving.toLowerCase()
          return o.includes('kozijn') && (o.includes('lever') || o.includes('kunststof'))
        })
        if (idx === -1) idx = updated.findIndex(r => Number(r.prijs) === 0 && r.omschrijving)
        if (idx !== -1) {
          updated[idx] = { ...updated[idx], prijs: pdfTotaal }
        } else {
          updated.unshift({ omschrijving: 'Kunststof kozijnen leveren', aantal: 1, prijs: pdfTotaal, btw_percentage: 21 })
        }
        onRegelsChange(updated)
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
  ): Promise<{ ok: boolean }> {
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
        return { ok: false }
      }

      // Step 2: Upload pre-rendered PNGs
      const tekeningData: { naam: string; tekeningPath: string; pageIndex: number; totalPages: number }[] = []
      const uploadErrors: string[] = []

      for (let i = 0; i < tekeningen.length; i++) {
        const { pageNum, naam, blob, pageIndex, totalPages } = tekeningen[i]
        setPdfProgress(`Tekeningen uploaden (${i + 1}/${tekeningen.length})...`)

        const imgFormData = new FormData()
        imgFormData.set('image', blob, `tekening-${pageNum}.jpg`)
        const uploadResult = await uploadLeverancierTekening(offerteId, pageNum, imgFormData)

        if ('error' in uploadResult && uploadResult.error) {
          uploadErrors.push(`p${pageNum}: ${uploadResult.error}`)
          continue
        }
        const path = ('path' in uploadResult && uploadResult.path) ? uploadResult.path : null
        if (!path) {
          uploadErrors.push(`p${pageNum}: geen path`)
          continue
        }
        tekeningData.push({ naam, tekeningPath: path, pageIndex: pageIndex ?? 0, totalPages: totalPages ?? 1 })
      }

      if (uploadErrors.length > 0) {
        console.error('Tekening uploads failed:', uploadErrors)
        setError(`Tekeningen upload mislukt (${uploadErrors.length}/${tekeningen.length}): ${uploadErrors.slice(0, 3).join(', ')}`)
      }

      // Step 3: Save tekening mappings + marge (per-element) + element prices
      setPdfProgress('Opslaan...')
      const elementPrijzen: Record<string, { prijs: number; hoeveelheid: number }> = {}
      if (parsed?.elementen) {
        for (const el of parsed.elementen) {
          elementPrijzen[el.naam] = { prijs: el.prijs, hoeveelheid: el.hoeveelheid }
        }
      }
      const saveResult = await saveLeverancierTekeningen(offerteId, tekeningData, margePercentage, elementMarges, elementPrijzen)
      if (saveResult && 'error' in saveResult && saveResult.error) {
        console.error('saveLeverancierTekeningen error:', saveResult.error)
        setError(`Opslaan van tekeningen mislukt: ${saveResult.error}`)
      }

      setLeverancierPdf({
        bestandsnaam: file.name,
        aantalElementen: tekeningen.length,
        totaal: parsed.totaal,
      })

      setPdfUploading(false)
      setPdfProgress('')
      return { ok: uploadErrors.length === 0 && !(saveResult && 'error' in saveResult && saveResult.error) }
    } catch (err) {
      console.error('PDF upload error:', err)
      setError('Fout bij uploaden van PDF')
      setPdfUploading(false)
      setPdfProgress('')
      return { ok: false }
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
    formData.set('regels', JSON.stringify(regels.map(r => ({ ...r, aantal: numVal(r.aantal), prijs: numVal(r.prijs) }))))
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
      const res = await uploadPreProcessedPdf(pendingPdfFile, offerteId, parsedPdfResult, renderedTekeningen)
      // Als upload mislukt blijven we op deze pagina zodat user de error ziet
      if (!res.ok) return
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
              <Input id="geldig_tot" name="geldig_tot" label="Geldig tot" type="date" defaultValue={(offerte?.geldig_tot as string) || new Date(Date.now() + 60 * 86400000).toISOString().split('T')[0]} />
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
            <div className="grid grid-cols-12 gap-2 items-end mb-2 px-0 text-[10px] font-medium text-gray-400 uppercase tracking-wide">
              <div className="col-span-1">Product</div>
              <div className="col-span-4">Omschrijving</div>
              <div className="col-span-2">Aantal</div>
              <div className="col-span-2">Prijs</div>
              <div className="col-span-1">BTW</div>
              <div className="col-span-1 text-right">Totaal</div>
              <div className="col-span-1"></div>
            </div>
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
                      <input type="number" placeholder="Aantal" step="0.01" className="w-full px-2 py-2 border border-gray-300 rounded-md text-sm" value={regel.aantal} onChange={(e) => updateRegel(i, 'aantal', e.target.value)} readOnly={isBezorgkosten} />
                    </div>
                    <div className="col-span-2">
                      <input type="number" placeholder="Prijs" step="0.01" className="w-full px-2 py-2 border border-gray-300 rounded-md text-sm" value={regel.prijs} onChange={(e) => updateRegel(i, 'prijs', e.target.value)} readOnly={isBezorgkosten} />
                    </div>
                    <div className="col-span-1">
                      <select className="w-full px-2 py-2 border border-gray-300 rounded-md text-xs" value={regel.btw_percentage} onChange={(e) => updateRegel(i, 'btw_percentage', parseInt(e.target.value))} disabled={isBezorgkosten}>
                        <option value={0}>0%</option>
                        <option value={9}>9%</option>
                        <option value={21}>21%</option>
                      </select>
                    </div>
                    <div className="col-span-1 text-right text-sm font-medium">
                      {formatCurrency(numVal(regel.aantal) * numVal(regel.prijs))}
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
