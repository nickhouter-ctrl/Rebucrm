'use client'

import { useState, useEffect, useRef } from 'react'
import { parseLeverancierPdfText, type LeverancierKey } from '@/lib/pdf-parser'
import { Button } from '@/components/ui/button'
import { Dialog } from '@/components/ui/dialog'
import { ArrowLeft, Upload, FileText, Trash2, ArrowRight, Loader2, CheckCircle, AlertTriangle, Plus, Building2 } from 'lucide-react'
import { getBekendeLeveranciers, addBekendeLeverancier, bevestigLeverancierDetectie } from '@/lib/actions'

interface DetectieResultaat {
  leverancier: string
  display_naam: string
  profiel: string
  confidence: number
  reden: string
  regex_hint?: string | null
}

interface BekendeLeverancier {
  naam: string
  display_naam: string
  parser_key: string
  profielen: string[] | null
  validated_count: number
}

export interface ParsedPdfResult {
  totaal: number
  elementen: { naam: string; hoeveelheid: number; systeem: string; kleur: string; afmetingen: string; type: string; prijs: number; glasType: string; beslag: string; uwWaarde: string; drapirichting: string; dorpel: string; sluiting: string; scharnieren: string; gewicht: string; omtrek: string; paneel: string; commentaar: string; hoekverbinding: string; montageGaten: string; afwatering: string; scharnierenKleur: string; sluitcilinder: string; aantalSleutels: string; gelijksluitend: string; krukBinnen: string; krukBuiten: string; lakKleur: string; confidence?: number; confidence_reden?: string }[]
  aantalElementen: number
}

export interface RenderedTekening {
  pageNum: number
  naam: string
  blob: Blob
  pageIndex: number    // 0-based index within the element's pages
  totalPages: number   // total number of pages for this element
}

// Per origineel-PDF-pagina de regio's die zijn weggewist (door regex of AI Vision).
// Doorgegeven aan de PDF.js viewer in de preview voor rode-arcering overlay.
export interface WipedRegion {
  pageNum: number
  // pixel-coordinaten in PDF page native size (scale=1) — de viewer rekent
  // ze zelf om naar de huidige render-scale.
  x: number
  y: number
  w: number
  h: number
  reden?: 'regex' | 'ai' | 'header'
}

export function StapTekeningen({
  pendingPdfFile,
  parsedPdfResult,
  renderedTekeningen,
  detectedLeverancier,
  offerteId,
  onUploadPdf,
  onPdfProcessed,
  onLeverancierDetected,
  onRemovePdf,
  onSkip,
  onNext,
  onBack,
}: {
  pendingPdfFile: File | null
  parsedPdfResult: ParsedPdfResult | null
  renderedTekeningen: RenderedTekening[]
  detectedLeverancier: DetectieResultaat | null
  offerteId?: string | null
  onUploadPdf: (file: File) => void
  onPdfProcessed: (result: ParsedPdfResult, tekeningen: RenderedTekening[], wipedRegions?: WipedRegion[]) => void
  onLeverancierDetected: (det: DetectieResultaat) => void
  onRemovePdf: () => void
  onSkip: () => void
  onNext: () => void
  onBack: () => void
}) {
  const [processing, setProcessing] = useState(false)
  const [progress, setProgress] = useState('')
  const [error, setError] = useState('')
  const processedFileRef = useRef<string | null>(null)
  const [bekendeLijst, setBekendeLijst] = useState<BekendeLeverancier[]>([])
  const [showLevModal, setShowLevModal] = useState(false)
  const [pendingDetectie, setPendingDetectie] = useState<DetectieResultaat | null>(null)
  const [pendingFullText, setPendingFullText] = useState<string>('')
  const [pendingPdf, setPendingPdf] = useState<unknown | null>(null)
  const [pendingTotalPages, setPendingTotalPages] = useState(0)
  const [modalKeuze, setModalKeuze] = useState('')
  const [nieuweLevNaam, setNieuweLevNaam] = useState('')
  const [nieuweLevProfiel, setNieuweLevProfiel] = useState('')
  const [savingLev, setSavingLev] = useState(false)

  // Load bekende leveranciers list once
  useEffect(() => {
    getBekendeLeveranciers().then(setBekendeLijst).catch(() => setBekendeLijst([]))
  }, [])

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

  // Fase A: PDF inladen + tekst extraheren + leverancier detecteren.
  // Bij hoge confidence (>= 0.7) gaat hij meteen door naar fase B.
  // Bij lage confidence of 'onbekend' tonen we de modal eerst.
  async function processUploadedPdf(file: File) {
    setProcessing(true)
    setError('')

    try {
      setProgress('PDF laden...')
      const pdfjsLib = await import('pdfjs-dist')
      pdfjsLib.GlobalWorkerOptions.workerSrc = `https://unpkg.com/pdfjs-dist@${pdfjsLib.version}/build/pdf.worker.min.mjs`

      const arrayBuffer = await file.arrayBuffer()
      const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise
      const totalPages = pdf.numPages

      setProgress('PDF tekst analyseren...')
      let fullText = ''
      for (let pageNum = 1; pageNum <= totalPages; pageNum++) {
        const page = await pdf.getPage(pageNum)
        const tc = await page.getTextContent()
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const items = (tc.items as any[]).filter((it: any) => 'str' in it)
        let pageText = ''
        let lastY: number | null = null
        for (const item of items) {
          if (!item.str) continue
          const y = Math.round(item.transform[5])
          const newLine = lastY !== null && Math.abs(y - lastY) > 3
          pageText += newLine ? '\n' : (pageText && !pageText.endsWith('\n') ? ' ' : '')
          pageText += item.str
          lastY = y
          if (item.hasEOL) { pageText += '\n'; lastY = null }
        }
        fullText += pageText + '\n\n'
      }

      // Stap A.1: detect leverancier via Haiku 4.5
      setProgress('Leverancier herkennen...')
      let detectie: DetectieResultaat
      try {
        const res = await fetch('/api/ai/detect-leverancier', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ text: fullText.slice(0, 8000), offerteId: offerteId || undefined }),
        })
        if (res.ok) {
          detectie = await res.json() as DetectieResultaat
        } else {
          detectie = { leverancier: 'onbekend', display_naam: '', profiel: '', confidence: 0, reden: 'AI-detectie faalde' }
        }
      } catch {
        detectie = { leverancier: 'onbekend', display_naam: '', profiel: '', confidence: 0, reden: 'AI-detectie faalde' }
      }

      // Bij onzekerheid: pauzeer en vraag de gebruiker
      if (detectie.leverancier === 'onbekend' || detectie.confidence < 0.7) {
        setPendingDetectie(detectie)
        setPendingFullText(fullText)
        setPendingPdf(pdf)
        setPendingTotalPages(totalPages)
        setModalKeuze(detectie.leverancier !== 'onbekend' ? detectie.leverancier : '')
        setNieuweLevNaam(detectie.display_naam || '')
        setNieuweLevProfiel(detectie.profiel || '')
        setShowLevModal(true)
        setProgress('')
        // Niet stoppen met processing — modal-confirm pakt het op
        return
      }

      // Hoge confidence → meteen door
      onLeverancierDetected(detectie)
      await runScanFase(file, fullText, pdf, totalPages, detectie.leverancier as LeverancierKey, detectie.display_naam || detectie.leverancier)
    } catch (err) {
      console.error('PDF processing error:', err)
      setError(`Fout bij verwerken van PDF: ${err instanceof Error ? err.message : String(err)}`)
      setProcessing(false)
      setProgress('')
    }
  }

  // Fase B: parse met leverancier-hint + AI extract + tekeningen renderen.
  // Wordt aangeroepen vanuit fase A (auto) of vanuit modal-bevestiging.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  async function runScanFase(file: File, fullText: string, pdf: any, totalPages: number, leverancierKey: LeverancierKey, leverancierDisplay: string) {
    try {
      // Step 3: Parse leverancier text met hint (deterministisch)
      const { totaal, elementen } = parseLeverancierPdfText(fullText, leverancierKey)

      // Step 3b: AI validatie — Claude controleert de lijst, corrigeert fouten,
      // voegt gemiste elementen toe (Deur 008/010) en filtert ghost-referenties.
      setProgress('AI controleert element-lijst...')
      let finaleElementen = elementen
      let finaalTotaal = totaal
      try {
        const aiRes = await fetch('/api/ai/extract-offerte', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            text: fullText,
            leverancier: leverancierDisplay,
            profiel: undefined,
            regexResult: {
              totaal,
              elementen: elementen.map(e => ({ naam: e.naam, prijs: e.prijs, hoeveelheid: e.hoeveelheid })),
            },
          }),
        })
        if (aiRes.ok) {
          const ai = await aiRes.json() as { elementen?: Array<{ naam: string; hoeveelheid: number; systeem: string; kleur: string; afmetingen: string; type?: string; prijs: number; glasType?: string; beslag?: string; uwWaarde?: string; drapirichting?: string; dorpel?: string; sluiting?: string; scharnieren?: string; gewicht?: string; omtrek?: string; confidence?: number; confidence_reden?: string }>; totaal?: number }
          if (ai.elementen && ai.elementen.length > 0) {
            // Merge AI per naam met regex (regex heeft meer spec-velden)
            const regexByNaam = new Map(elementen.map(e => [e.naam, e]))
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            finaleElementen = ai.elementen.map(a => {
              const r = regexByNaam.get(a.naam)
              const conf: { confidence?: number; confidence_reden?: string } = {
                confidence: a.confidence ?? 1,
                confidence_reden: a.confidence_reden ?? '',
              }
              return r
                ? { ...r, prijs: a.prijs, hoeveelheid: a.hoeveelheid, afmetingen: a.afmetingen || r.afmetingen, systeem: a.systeem || r.systeem, ...conf }
                : {
                    naam: a.naam, hoeveelheid: a.hoeveelheid, systeem: a.systeem, kleur: a.kleur || '',
                    afmetingen: a.afmetingen || '', type: a.type || '', prijs: a.prijs,
                    glasType: a.glasType || '', beslag: a.beslag || '', uwWaarde: a.uwWaarde || '',
                    tekeningPath: '',
                    drapirichting: a.drapirichting || '', dorpel: a.dorpel || '', sluiting: a.sluiting || '',
                    scharnieren: a.scharnieren || '', gewicht: a.gewicht || '', omtrek: a.omtrek || '',
                    paneel: '', commentaar: '', hoekverbinding: '', montageGaten: '',
                    afwatering: '', scharnierenKleur: '', lakKleur: '',
                    sluitcilinder: '', aantalSleutels: '', gelijksluitend: '',
                    krukBinnen: '', krukBuiten: '',
                    ...conf,
                  } as typeof r extends undefined ? never : NonNullable<typeof r>
            }) as typeof finaleElementen
            finaalTotaal = ai.totaal ?? finaleElementen.reduce((s, e) => s + e.prijs * e.hoeveelheid, 0)
          }
        }
      } catch {
        // Bij AI-fout: regex resultaat als fallback
      }

      const parsed: ParsedPdfResult = {
        totaal: finaalTotaal,
        elementen: finaleElementen.map(e => {
          const ec = e as typeof e & { confidence?: number; confidence_reden?: string }
          return {
            naam: e.naam, hoeveelheid: e.hoeveelheid, systeem: e.systeem, kleur: e.kleur,
            afmetingen: e.afmetingen, type: e.type, prijs: e.prijs, glasType: e.glasType,
            beslag: e.beslag, uwWaarde: e.uwWaarde, drapirichting: e.drapirichting,
            dorpel: e.dorpel, sluiting: e.sluiting, scharnieren: e.scharnieren,
            gewicht: e.gewicht, omtrek: e.omtrek, paneel: e.paneel, commentaar: e.commentaar,
            hoekverbinding: e.hoekverbinding, montageGaten: e.montageGaten,
            afwatering: e.afwatering, scharnierenKleur: e.scharnierenKleur,
            lakKleur: e.lakKleur, sluitcilinder: e.sluitcilinder,
            aantalSleutels: e.aantalSleutels, gelijksluitend: e.gelijksluitend,
            krukBinnen: e.krukBinnen, krukBuiten: e.krukBuiten,
            confidence: ec.confidence,
            confidence_reden: ec.confidence_reden,
          }
        }),
        aantalElementen: finaleElementen.length,
      }

      // Step 4: Render tekeningen from pages
      setProgress(`Tekeningen extraheren (0/${parsed.aantalElementen})...`)

      // Scan all pages for element names and drawing markers
      const elementHeaderPattern = /(?:Gekoppeld\s+element|Deur|Element)\s+\d{3}(?:\/\d+)?|Merk\s+[\dA-Z]+|Positie\s*\d{3}(?!\d|[.,]\d)/i
      const gealanNLHeaderPattern = /Productie\s+maten\s+([\s\S]+?)\s+Aantal\s*:\s*\d+\s+Verbinding\s*:/i
      // Schüco: encoded "1IVO" + letter (%=A, &=B, ...)
      const schucoEncodedPattern = /1IVO\s*([%&'()*+,\-.])/i
      const standaloneProductPattern = /\b(Rolluik|Rolladen|Rollo|Zonwering|Screen|Hor(?:re)?|Insecten\s*hor|Fly\s*screen)\b/i
      const allPageScans: { pageNum: number; naam: string | null; hasDrawing: boolean; isStandaloneProduct: boolean }[] = []
      for (let pageNum = 2; pageNum <= totalPages; pageNum++) {
        const page = await pdf.getPage(pageNum)
        const textContent = await page.getTextContent()
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const pageTextRaw = textContent.items.map((item: any) => ('str' in item ? item.str : '')).join(' ')
        // Strip control chars die sommige leveranciers tussen letters plaatsen
        const pageText = pageTextRaw.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '')
        let headerMatch = pageText.match(elementHeaderPattern)
        const gealanNLMatch = !headerMatch ? pageText.match(gealanNLHeaderPattern) : null
        // Schüco encoded fallback: detecteer "1IVO%" (Merk A) → normaliseer naar "Merk A"
        if (!headerMatch && !gealanNLMatch) {
          const schucoMatch = pageText.match(schucoEncodedPattern)
          if (schucoMatch) {
            const letter = String.fromCharCode(schucoMatch[1].charCodeAt(0) + 28)
            headerMatch = ['Merk ' + letter] as unknown as RegExpMatchArray
          }
        }
        const hasDrawing = /Binnenaanzicht|Binnenzicht|Buitenaanzicht|Buitenzicht|BUITEN\s*ZICHT|BINNEN\s*ZICHT|AANZICHT\s*:\s*BUITEN|%%2>-',8|1IVO\s*[%&'()*+,\-.]/i.test(pageText)
        const isStandaloneProduct = standaloneProductPattern.test(pageText)
        let elementNaam: string | null = null
        if (headerMatch) {
          elementNaam = headerMatch[0].replace(/Positie\s*(\d{3})/, 'Positie $1')
        } else if (gealanNLMatch) {
          elementNaam = gealanNLMatch[1].replace(/\s+/g, ' ').trim()
        }
        allPageScans.push({ pageNum, naam: elementNaam, hasDrawing, isStandaloneProduct })
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

      // Verzamelen we alle weggewiste regio's per pagina, voor preview-overlay.
      // Coördinaten worden opgeslagen in PDF native coords (scale=1) zodat
      // de preview-viewer ze schaalt naar zijn eigen render-scale.
      const wipedRegionsCollector: WipedRegion[] = []

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
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const pageTextAll = (textContent.items as any[]).map((i: any) => ('str' in i ? i.str : '')).join(' ')

        // Find ALL element-header items op de pagina (Element/Deur/Merk/Positie/Productie maten).
        // Op pagina's waar twee elementen samen staan (staart van element A + begin element B)
        // moeten we ALLES vóór het LAATSTE element-header op de pagina wegcroppen, zodat
        // alleen de echte tekening van dit element overblijft.
        const headerPattern = /(?:Gekoppeld\s+)?(?:Deur|Element)\s+\d{3}|Merk\s+[\dA-Z]+|Positie\s*\d{3}|Productie\s+maten/i
        const allHeaders = textItems
          .filter((i: { str: string; cy: number }) => headerPattern.test(i.str))
          .sort((a: { cy: number }, b: { cy: number }) => a.cy - b.cy)
        // De LAATSTE element-header op de pagina markeert het begin van DIT element
        const headerMatch = allHeaders.length > 0 ? allHeaders[allHeaders.length - 1] : undefined
        const isGealanPage = !!headerMatch && (/Merk\s+[\dA-Z]+/i.test(headerMatch.str) || /Productie\s+maten/i.test(headerMatch.str))

        // Crop just above the element header (remove leverancier branding + vorige element staart)
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
        // Detect green bars: rijen waar >70% van de breedte groen is, ≥12 én
        // ≤40px tall. Dit sluit groene kozijn-tekeningen (Onder-aanzicht in
        // Eko-Okna) uit — die zijn veel hoger dan 40px en hebben een
        // geconcentreerde groene vorm, geen volledige-breedte groene rij.
        const imgData = ctx.getImageData(0, 0, w, h)
        const greenBarRows: boolean[] = new Array(h).fill(false)
        for (let y = 0; y < h; y++) {
          let greenCount = 0
          for (let x = 0; x < w; x += 2) {
            const idx = (y * w + x) * 4
            const r = imgData.data[idx], g = imgData.data[idx + 1], b = imgData.data[idx + 2]
            if (g > 80 && g > r + 20 && g > b + 20) greenCount++
          }
          greenBarRows[y] = greenCount > (w / 2) * 0.70
        }
        const bars: { start: number; end: number }[] = []
        let barStart = -1
        for (let y = 0; y <= h; y++) {
          if (y < h && greenBarRows[y]) {
            if (barStart === -1) barStart = y
          } else if (barStart !== -1) {
            const barHeight = y - barStart
            if (barHeight >= 12 && barHeight <= 40) bars.push({ start: barStart, end: y })
            barStart = -1
          }
        }
        // Per groene balk: vind de volledige bounding-box (left/right over alle rijen
        // in de bar) en vul die complete rechthoek wit. Dit dekt ook de prijs-tekst
        // die bovenop de balk staat en soms niet-groene pixels heeft.
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
            // Iets uitbreiden voor randen/antialiasing
            const padL = Math.max(0, barLeft - 3)
            const padR = Math.min(w, barRight + 4)
            ctx.fillStyle = '#FFFFFF'
            ctx.fillRect(padL, bar.start, padR - padL, bar.end - bar.start)
          }
        }

        // Detecteer blauwe/paarse Totalen-balken (Aluplast/Eko-Okna).
        // SKIP voor Schüco — daar heeft de 'Beschrijving | Kleur' specs-tabel
        // header ook een lichtblauwe achtergrond die anders als Totalen-balk
        // zou worden gedetecteerd en de hele specs-rij zou wegwissen.
        const isSchucoPageEarly = /1IVO\s*[%&'()*+,\-.]|Sch[¿u]co|Brutopr|&VYXSTV/i.test(
          textItems.map((t: { str: string }) => t.str).join(' ')
        )
        const blueBarRows: boolean[] = new Array(h).fill(false)
        if (!isSchucoPageEarly) for (let y = Math.floor(h * 0.4); y < h; y++) {
          let blueCount = 0
          for (let x = 0; x < w; x += 2) {
            const idx = (y * w + x) * 4
            const r = imgData.data[idx], g = imgData.data[idx + 1], b = imgData.data[idx + 2]
            if (b > 200 && b > r + 8 && b > g - 10 && r > 180 && g > 180) blueCount++
          }
          blueBarRows[y] = blueCount > (w / 2) * 0.55
        }
        const blueBars: { start: number; end: number }[] = []
        let bbs = -1
        for (let y = 0; y <= h; y++) {
          if (y < h && blueBarRows[y]) {
            if (bbs === -1) bbs = y
          } else if (bbs !== -1) {
            const bh = y - bbs
            if (bh >= 8 && bh <= 45) blueBars.push({ start: bbs, end: y })
            bbs = -1
          }
        }
        for (const bar of blueBars) {
          let barLeft = w, barRight = 0
          for (let y = bar.start; y < bar.end; y++) {
            for (let x = 0; x < w; x++) {
              const idx = (y * w + x) * 4
              const r = imgData.data[idx], g = imgData.data[idx + 1], b = imgData.data[idx + 2]
              if (b > 200 && b > r + 8 && b > g - 10 && r > 180 && g > 180) {
                if (x < barLeft) barLeft = x
                if (x > barRight) barRight = x
              }
            }
          }
          if (barRight > barLeft) {
            const padL = Math.max(0, barLeft - 3)
            const padR = Math.min(w, barRight + 4)
            ctx.fillStyle = '#FFFFFF'
            // Wis de balk + 100px eronder: dekt ook de smalle gekleurde
            // kolommetjes (totaal-rijen) die onder de Totalen-balk staan.
            ctx.fillRect(padL, bar.start, padR - padL, (bar.end - bar.start) + 100)
          }
        }

        // Prijs-tabel headers + "Geen garantie" wissen. Strategie:
        // - ALLEEN in RECHTER-helft wissen (tekening staat altijd links).
        // - Voor tabel-headers ("Prijs van het element", "Deurprijs", totaal-rijen)
        //   gebruik bredere wipe die de hele rechter-kolom dekt (~tot einde).
        // - "Geen garantie" zit tussen de specs-tabel rijen (midden-rechts) en
        //   heeft soms een gele/groene achtergrond-cel. Wis de complete rij
        //   van links-specs-kolom (≈ midden) tot rechter rand.
        const tableHeaderPattern = /^(Prijs\s*(?:van\s*het|gekoppeld)\s*element|Deurprijs|Netto\s*[Tt]otaal|Totaal\s*elementen|Totaal\s*offerte(?:\/order)?|Eind\s*totaal|Netto\s*prijs|Prijs\s*TOT\.?|Cena\s*netto|Cena\s*brutto|Kosztorys|Razem|Suma|Preis|Gesamt)$/i
        const pricePattern = /^(€\s*[\d.,]+|[\d.,]+\s*€|[\d.,]+\s*(?:EUR|PLN|USD|GBP)\b|\d+[\d.,\s]*,\d{2}\s*E\b|TZ\s*\d)$/i
        // Fragment-matching: pdfjs splitst "Geen garantie!" soms in losse items
        // zoals "Geen", "garantie!", "ZONDER", "GARANTIE". We pakken elk item
        // dat garantie/warranty/zonder bevat en wissen de hele rij.
        const garantieFragmentPattern = /\b(?:garantie|garantie!|GARANTIE|warranty|Warranty|NO\s*WARRANTY|ZONDER)\b/
        const rightHalfStart = Math.floor(w * 0.48)
        // Groepeer garantie-fragments per y-lijn zodat we per rij 1 wipe doen
        const garantieYs = new Set<number>()
        for (const ti of textItems) {
          if (garantieFragmentPattern.test(ti.str)) {
            // Snap naar 8px-buckets zodat fragmenten op dezelfde tekst-lijn samenvallen
            garantieYs.add(Math.round(ti.cy / 8) * 8)
          }
        }
        for (const ti of textItems) {
          const strLen = ti.str.length
          if (tableHeaderPattern.test(ti.str)) {
            const wipeLeft = Math.max(rightHalfStart, ti.cx - 30)
            const wipeWidth = w - wipeLeft - 8
            ctx.fillStyle = '#FFFFFF'
            ctx.fillRect(wipeLeft, ti.cy - 18, wipeWidth, 32)
          } else if (pricePattern.test(ti.str)) {
            if (ti.cx < rightHalfStart) continue
            const approxWidth = Math.max(80, strLen * 7) + 16
            ctx.fillStyle = '#FFFFFF'
            ctx.fillRect(Math.max(0, ti.cx - 8), ti.cy - 18, approxWidth, 26)
          }
        }
        // Wis alle garantie-rijen: van ~midden-pagina tot rechter rand, 44px hoog
        // (dekt tekst + gekleurde achtergrond-cel + eventuele afsluitregel).
        for (const y of garantieYs) {
          ctx.fillStyle = '#FFFFFF'
          ctx.fillRect(rightHalfStart - 30, y - 22, w - (rightHalfStart - 30) - 8, 44)
        }

        // Wis het Raam/Totaal tabelblok — beperk tot rechter-helft met
        // geschatte breedte (~180px) zodat aanzicht-tekeningen links intact blijven.
        const raamItem = textItems.find((ti: { str: string; cy: number }) => /^Raam$/i.test(ti.str) && ti.cy > h * 0.5)
        const totaalItem = textItems.find((ti: { str: string; cy: number }) => /^Totaal$/i.test(ti.str) && ti.cy > h * 0.5)
        if (raamItem || totaalItem) {
          const topY = raamItem ? raamItem.cy - 25 : (totaalItem ? totaalItem.cy - 25 : 0)
          const botY = totaalItem ? totaalItem.cy + 15 : (raamItem ? raamItem.cy + 40 : 0)
          if (topY > 0 && botY > topY) {
            const blockLeft = Math.min(raamItem?.cx ?? w, totaalItem?.cx ?? w) - 40
            const blockWidth = Math.min(200, w - blockLeft)
            ctx.fillStyle = '#FFFFFF'
            ctx.fillRect(Math.max(0, blockLeft), topY, blockWidth, botY - topY)
          }
        }

        // Wis het groene 'Prijs / Element' label-blok (Aluplast/Gealan onderaan pagina).
        // Alleen smalle rect rond het label, niet de volledige paginabreedte.
        const prijsLabel = textItems.find((ti: { str: string; cy: number }) => /^Prijs$/i.test(ti.str) && ti.cy > h * 0.55)
        const elementLabel = textItems.find((ti: { str: string; cy: number }) => /^Element$/i.test(ti.str) && ti.cy > h * 0.55)
        for (const lbl of [prijsLabel, elementLabel]) {
          if (!lbl) continue
          ctx.fillStyle = '#FFFFFF'
          // Smalle witte rect rondom alleen dit label (ca. 140px breed, 18px hoog)
          ctx.fillRect(Math.max(0, lbl.cx - 10), lbl.cy - 14, 160, 22)
        }

        // For Kochs pages: crop out the bottom "Beschrijving" detail table (all 0,00 rows)
        let cropBottom = Math.floor(h * 0.97)
        const isKochsPage = textItems.some((i: { str: string }) => /^Binnenzicht$/i.test(i.str))
        if (isKochsPage) {
          const beschrijvingItem = textItems.find((i: { str: string; cy: number }) =>
            i.cy > h * 0.4 && /^Beschrijving$/i.test(i.str)
          )
          if (beschrijvingItem) {
            cropBottom = Math.max(cropTop + 100, beschrijvingItem.cy - 20)
          }
        }

        // Wis prijs-tabel-headers in onderste helft. Wipe bereikt hier alleen
        // de rechterkant (vanaf midden) zodat aanzicht-tekeningen links intact
        // blijven. Tabellen met totalen lopen vaak door tot onder = wipe tot h.
        const bottomBlockPattern = /^(NETTO|BRUTO|BTW|Producten|Artikelen|Profielen|Diensten|Extra\s*kosten|Totaal\s*netto|Totaal\s*bruto|Totalen|Netto\s*prijs|Netto\s*totaal|Netto\s*Totaal|Prijs\s*TOT|Deurprijs|Cena\s*netto|Cena\s*brutto|Kosztorys|Razem|Suma\s+\w+|Preis|Gesamt|Vullingen|Prijs\s+(?:van\s+het|gekoppeld)\s+element|Totaal\s*elementen|Totaal\s*offerte(?:\/order)?|Eind\s*totaal|Betaling\b|TZ\s*\d|\+\d+\s*stojak|\+\d+\s*\w*)$/i
        // Schüco prijs-tabel ("Brutopr. Korting Netto prijs" + "Raam …" +
        // "Totaal …") — tolerant voor zowel normale als encoded tekst
        // (&VYXSTV = 'Brutopr' in Schüco-font). Wis alleen die tabel, NIET
        // de specs eronder/erboven. Er kunnen MEERDERE zijn: de per-element
        // tabel bovenaan + de globale Totalen-tabel op de laatste pagina.
        const brutoprItems = textItems.filter((ti: { str: string }) => /^(Brutopr\.?|&VYXSTV\.?)$/i.test(ti.str))
        const brutoprItem = brutoprItems[0]
        for (const ti of textItems) {
          if (ti.cy > h * 0.40 && bottomBlockPattern.test(ti.str)) {
            const wipeTop = Math.max(0, ti.cy - 18)
            const wipeLeft = Math.max(Math.floor(w * 0.48), ti.cx - 40)
            ctx.fillStyle = '#FFFFFF'
            ctx.fillRect(wipeLeft, wipeTop, w - wipeLeft, h - wipeTop)
          }
        }
        // Wis ELK Brutopr-blok (per-element én de globale Totalen onderaan
        // de laatste pagina, die alleen "Brutopr. / Netto totaal / Totaal /
        // Korting: / BTW" bevat).
        for (const bp of brutoprItems) {
          const wipeLeft = Math.max(0, bp.cx - 220)
          const wipeTop = Math.max(0, bp.cy - 22)
          const wipeH = 220
          ctx.fillStyle = '#FFFFFF'
          ctx.fillRect(wipeLeft, wipeTop, w - wipeLeft, wipeH)
        }
        // Extra: "Korting:" standalone (bij Totalen-tabel onderaan laatste
        // pagina) — wis 200px breed × 120px hoog rondom.
        const kortingItem = textItems.find((ti: { str: string }) => /^Korting:?$/i.test(ti.str))
        if (kortingItem) {
          const wipeLeft = Math.max(0, kortingItem.cx - 120)
          const wipeTop = Math.max(0, kortingItem.cy - 22)
          ctx.fillStyle = '#FFFFFF'
          ctx.fillRect(wipeLeft, wipeTop, w - wipeLeft, 140)
        }

        // AI VISION: vraag Claude welke regio's we WIT moeten maken (prijzen +
        // "Geen garantie"). We croppen NIET — de tekening + specs moeten altijd
        // volledig zichtbaar blijven. Alleen aangewezen regio's worden wit.
        // Skip AI Vision voor Schüco: daar doen regex-wipes al goed werk
        // en Vision had specs verwijderd die eigenlijk moesten blijven.
        const isSchucoPage = !!brutoprItem || /1IVO\s*[%&'()*+,\-.]|Sch[¿u]co/i.test(pageTextAll)
        try {
          if (isSchucoPage) throw new Error('skip-ai-for-schuco')
          const previewScale = 0.5
          const pw = Math.round(w * previewScale)
          const ph = Math.round(h * previewScale)
          const previewCanvas = document.createElement('canvas')
          previewCanvas.width = pw
          previewCanvas.height = ph
          previewCanvas.getContext('2d')!.drawImage(canvas, 0, 0, pw, ph)
          const previewDataUrl = previewCanvas.toDataURL('image/jpeg', 0.75)
          const previewBase64 = previewDataUrl.replace(/^data:image\/jpeg;base64,/, '')
          previewCanvas.remove()

          const supplierName = (parsed.elementen?.[0]?.systeem || '').split(/[,\s]/)[0] || 'unknown'
          const res = await fetch('/api/ai/detect-remove-regions', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              imageBase64: previewBase64,
              imageWidth: pw,
              imageHeight: ph,
              supplier: supplierName,
              leverancierSlug: leverancierKey,
            }),
          })
          if (res.ok) {
            const { regions } = (await res.json()) as { regions?: { x: number; y: number; w: number; h: number }[] }
            if (Array.isArray(regions)) {
              for (const r of regions) {
                const fx = Math.round(r.x / previewScale)
                const fy = Math.round(r.y / previewScale)
                const fw = Math.round(r.w / previewScale)
                const fh = Math.round(r.h / previewScale)
                ctx.fillStyle = '#FFFFFF'
                ctx.fillRect(fx, fy, fw, fh)
                // Sla op in PDF native coords (scale=1) — render-scale is 2
                wipedRegionsCollector.push({
                  pageNum,
                  x: Math.round(fx / 2),
                  y: Math.round(fy / 2),
                  w: Math.round(fw / 2),
                  h: Math.round(fh / 2),
                  reden: 'ai',
                })
              }
            }
          }
        } catch (aiErr) {
          console.warn('AI remove-regions detectie gefaald, regex-wipes blijven actief:', aiErr)
        }
        // We croppen ALLEEN de leveranciers-header bovenaan (cropTop) en een
        // minimale footer. Tekening + alle specs blijven ALTIJD volledig zichtbaar.
        const srcX = 0
        const srcY = cropTop
        const srcW = w
        const srcH = cropBottom - cropTop
        const croppedCanvas = document.createElement('canvas')
        croppedCanvas.width = srcW
        croppedCanvas.height = srcH
        croppedCanvas.getContext('2d')!.drawImage(canvas, srcX, srcY, srcW, srcH, 0, 0, srcW, srcH)
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
            croppedCanvas.toBlob((b) => resolve(b!), 'image/jpeg', 0.85)
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
      onPdfProcessed(parsed, tekeningen, wipedRegionsCollector)
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

  // Modal-confirm: gebruiker heeft een leverancier gekozen of nieuwe toegevoegd → fase B starten
  async function handleLevModalConfirm() {
    if (!pendingPdfFile || !pendingPdf || !pendingFullText) {
      setShowLevModal(false)
      return
    }
    setSavingLev(true)
    let chosenSlug = modalKeuze
    let chosenDisplay = modalKeuze

    // Nieuwe leverancier-tab actief?
    if (!chosenSlug && nieuweLevNaam.trim()) {
      const result = await addBekendeLeverancier({
        display_naam: nieuweLevNaam.trim(),
        profiel: nieuweLevProfiel.trim() || undefined,
        parser_key: 'default',
      })
      if ('error' in result && result.error) {
        setError(result.error)
        setSavingLev(false)
        return
      }
      if ('naam' in result && result.naam && result.display_naam) {
        const newSlug = result.naam
        const newDisplay = result.display_naam
        chosenSlug = newSlug
        chosenDisplay = newDisplay
        setBekendeLijst(prev => [...prev, { naam: newSlug, display_naam: newDisplay, parser_key: 'default', profielen: nieuweLevProfiel ? [nieuweLevProfiel] : [], validated_count: 0 }])
      }
    } else {
      const found = bekendeLijst.find(l => l.naam === chosenSlug)
      chosenDisplay = found?.display_naam || chosenSlug
    }

    if (!chosenSlug) {
      setError('Kies een leverancier of voeg een nieuwe toe')
      setSavingLev(false)
      return
    }

    // Bevestig in DB voor leereffect
    if (offerteId) {
      try {
        await bevestigLeverancierDetectie({
          offerteId,
          leverancierSlug: chosenSlug,
          userCorrectedFrom: pendingDetectie?.leverancier !== chosenSlug ? pendingDetectie?.leverancier : undefined,
        })
      } catch { /* niet kritiek */ }
    }

    const detectie: DetectieResultaat = {
      leverancier: chosenSlug,
      display_naam: chosenDisplay,
      profiel: nieuweLevProfiel || pendingDetectie?.profiel || '',
      confidence: 1,
      reden: 'Door gebruiker bevestigd',
    }
    onLeverancierDetected(detectie)

    setShowLevModal(false)
    setSavingLev(false)
    setProgress('Tekeningen extraheren...')

    try {
      await runScanFase(
        pendingPdfFile,
        pendingFullText,
        pendingPdf,
        pendingTotalPages,
        chosenSlug as LeverancierKey,
        chosenDisplay,
      )
    } finally {
      setPendingPdf(null)
      setPendingFullText('')
      setPendingDetectie(null)
    }
  }

  function handleLevModalCancel() {
    setShowLevModal(false)
    setProcessing(false)
    setProgress('')
    setPendingPdf(null)
    setPendingFullText('')
    setPendingDetectie(null)
    onRemovePdf()
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

      {/* Leverancier-badge: laat zien wat AI heeft gedetecteerd, met optie om te corrigeren */}
      {detectedLeverancier && !showLevModal && (
        <div className="bg-white border border-gray-200 rounded-xl p-4 mb-4 flex items-center gap-3">
          <Building2 className="h-5 w-5 text-primary flex-shrink-0" />
          <div className="flex-1 min-w-0">
            <p className="text-sm">
              <span className="text-gray-500">Leverancier:</span>{' '}
              <strong className="text-gray-900">{detectedLeverancier.display_naam || detectedLeverancier.leverancier}</strong>
              {detectedLeverancier.profiel && <span className="text-gray-500"> · {detectedLeverancier.profiel}</span>}
              {detectedLeverancier.confidence < 1 && (
                <span className="text-xs text-gray-400 ml-2">AI {Math.round(detectedLeverancier.confidence * 100)}% zeker</span>
              )}
            </p>
          </div>
          <button
            type="button"
            onClick={() => {
              setPendingDetectie(detectedLeverancier)
              setModalKeuze(detectedLeverancier.leverancier !== 'onbekend' ? detectedLeverancier.leverancier : '')
              setShowLevModal(true)
            }}
            className="text-xs text-primary hover:underline"
          >
            Klopt niet?
          </button>
        </div>
      )}

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
                {parsedPdfResult!.aantalElementen} kozijntekeningen gevonden &middot; {parsedPdfResult!.elementen.length} elementen met prijs
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

      {/* Modal: leverancier kiezen of nieuwe toevoegen */}
      <Dialog open={showLevModal} onClose={handleLevModalCancel} title="Welke leverancier is dit?" className="max-w-lg">
        <div className="space-y-4">
          <div className="bg-amber-50 border border-amber-200 rounded-md p-3 flex items-start gap-2 text-sm">
            <AlertTriangle className="h-4 w-4 text-amber-600 flex-shrink-0 mt-0.5" />
            <div className="text-amber-800">
              {pendingDetectie?.leverancier === 'onbekend'
                ? 'AI kon de leverancier niet automatisch herkennen.'
                : `AI denkt "${pendingDetectie?.display_naam || pendingDetectie?.leverancier}" maar is slechts ${Math.round((pendingDetectie?.confidence || 0) * 100)}% zeker.`}
              {pendingDetectie?.reden && <div className="text-xs text-amber-700 mt-1">Reden: {pendingDetectie.reden}</div>}
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Bestaande leverancier kiezen</label>
            <select
              value={modalKeuze}
              onChange={(e) => { setModalKeuze(e.target.value); setNieuweLevNaam(''); setNieuweLevProfiel('') }}
              className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent"
            >
              <option value="">— kies leverancier —</option>
              {bekendeLijst.map(l => (
                <option key={l.naam} value={l.naam}>
                  {l.display_naam}{l.profielen && l.profielen.length > 0 ? ` (${l.profielen.join(', ')})` : ''}
                </option>
              ))}
            </select>
          </div>

          <div className="border-t border-gray-200 pt-4">
            <label className="block text-sm font-medium text-gray-700 mb-2">Of nieuwe leverancier toevoegen</label>
            <div className="space-y-2">
              <input
                type="text"
                value={nieuweLevNaam}
                onChange={(e) => { setNieuweLevNaam(e.target.value); if (e.target.value) setModalKeuze('') }}
                placeholder="Leveranciersnaam (bv. Drutex)"
                className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent"
              />
              <input
                type="text"
                value={nieuweLevProfiel}
                onChange={(e) => setNieuweLevProfiel(e.target.value)}
                placeholder="Profielsysteem (optioneel, bv. Iglo Energy)"
                className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent"
              />
              <p className="text-xs text-gray-500">Deze leverancier wordt opgeslagen zodat AI hem bij volgende offertes herkent.</p>
            </div>
          </div>

          <div className="flex items-center justify-end gap-2 pt-2 border-t border-gray-200">
            <Button variant="ghost" onClick={handleLevModalCancel} disabled={savingLev}>Annuleren</Button>
            <Button onClick={handleLevModalConfirm} disabled={savingLev || (!modalKeuze && !nieuweLevNaam.trim())}>
              {savingLev ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
              {modalKeuze ? 'Bevestigen' : 'Toevoegen + bevestigen'}
            </Button>
          </div>
        </div>
      </Dialog>
    </div>
  )
}
