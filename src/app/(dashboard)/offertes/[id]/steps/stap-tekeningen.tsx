'use client'

import { useState, useEffect, useRef } from 'react'
import { parseLeverancierPdfText } from '@/lib/pdf-parser'
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
      // Step 1: Load PDF with pdfjs (used for text extraction + tekening rendering)
      setProgress('PDF laden...')
      const pdfjsLib = await import('pdfjs-dist')
      pdfjsLib.GlobalWorkerOptions.workerSrc = `https://unpkg.com/pdfjs-dist@${pdfjsLib.version}/build/pdf.worker.min.mjs`

      const arrayBuffer = await file.arrayBuffer()
      const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise
      const totalPages = pdf.numPages

      // Step 2: Extract text from all pages with proper line breaks
      // Uses pdfjs directly (instead of server-side unpdf) for consistent text format
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

      // Step 3: Parse leverancier text client-side (consistent with pdfjs extraction)
      const { totaal, elementen } = parseLeverancierPdfText(fullText)

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
            regexResult: {
              totaal,
              elementen: elementen.map(e => ({ naam: e.naam, prijs: e.prijs, hoeveelheid: e.hoeveelheid })),
            },
          }),
        })
        if (aiRes.ok) {
          const ai = await aiRes.json() as { elementen?: Array<{ naam: string; hoeveelheid: number; systeem: string; kleur: string; afmetingen: string; type?: string; prijs: number; glasType?: string; beslag?: string; uwWaarde?: string; drapirichting?: string; dorpel?: string; sluiting?: string; scharnieren?: string; gewicht?: string; omtrek?: string }>; totaal?: number }
          if (ai.elementen && ai.elementen.length > 0) {
            // Merge AI per naam met regex (regex heeft meer spec-velden)
            const regexByNaam = new Map(elementen.map(e => [e.naam, e]))
            finaleElementen = ai.elementen.map(a => {
              const r = regexByNaam.get(a.naam)
              return r
                ? { ...r, prijs: a.prijs, hoeveelheid: a.hoeveelheid, afmetingen: a.afmetingen || r.afmetingen, systeem: a.systeem || r.systeem }
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
                  }
            })
            finaalTotaal = ai.totaal ?? finaleElementen.reduce((s, e) => s + e.prijs * e.hoeveelheid, 0)
          }
        }
      } catch {
        // Bij AI-fout: regex resultaat als fallback
      }

      const parsed: ParsedPdfResult = {
        totaal: finaalTotaal,
        elementen: finaleElementen.map(e => ({
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
        })),
        aantalElementen: finaleElementen.length,
      }

      // Step 4: Render tekeningen from pages
      setProgress(`Tekeningen extraheren (0/${parsed.aantalElementen})...`)

      // Scan all pages for element names and drawing markers
      // Match element headers — Positie must be followed by exactly 3 digits and then non-digit (prevents matching "908" from prices like "908,16")
      const elementHeaderPattern = /(?:Gekoppeld\s+element|Deur|Element)\s+\d{3}(?:\/\d+)?|Merk\s+[\dA-Z]+|Positie\s*\d{3}(?!\d|[.,]\d)/i
      // Gealan S9000NL: "Productie maten <Element-naam> Aantal:N Verbinding:XX Systeem: Gealan ..."
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
        // Normalize Kochs "Positie" format to match parsed element names
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

        // Expliciete prijs-labels + "Geen garantie" teksten wissen. Gebruik
        // geschatte tekstbreedte (ipv tot rechterrand) zodat dimensies en
        // andere aanzicht-labels aan dezelfde y-positie intact blijven.
        const explicitPricePattern = /^(€\s*[\d.,]+|[\d.,]+\s*€|Netto\s*prijs|Netto\s*[Tt]otaal|Prijs\s*TOT\.?|Prijs\s*van\s*het\s*element|Deurprijs|Totaal\s*excl|Totaal\s*incl|Totaal\s*netto|Totaal\s*elementen|Totaal\s*offerte(?:\/order)?|Eind\s*totaal|TZ\s*\d|Subtotaal|Cena\s*netto|Cena\s*brutto|Kosztorys|Razem|Suma|Preis|Gesamt|[\d.,]+\s*(?:EUR|PLN|USD|GBP)\b)$/i
        const garantiePattern = /geen\s*garantie|no\s*warranty|geen\s*Garantie!?/i
        for (const ti of textItems) {
          const strLen = ti.str.length
          const approxWidth = Math.max(60, strLen * 7) + 16
          if (explicitPricePattern.test(ti.str)) {
            ctx.fillStyle = '#FFFFFF'
            ctx.fillRect(Math.max(0, ti.cx - 8), ti.cy - 18, approxWidth, 26)
          } else if (garantiePattern.test(ti.str)) {
            ctx.fillStyle = '#FFFFFF'
            ctx.fillRect(Math.max(0, ti.cx - 4), ti.cy - 14, approxWidth, 20)
          }
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

        // Wis prijs-tabel-headers met een geschatte tabelbreedte — NOOIT full-
        // width, zodat aanzicht-tekeningen op dezelfde y-hoogte intact blijven.
        const bottomBlockPattern = /^(NETTO|BRUTO|BTW|Producten|Artikelen|Profielen|Diensten|Extra\s*kosten|Totaal\s*netto|Totaal\s*bruto|Netto\s*prijs|Netto\s*totaal|Netto\s*Totaal|Prijs\s*TOT|Deurprijs|Cena\s*netto|Cena\s*brutto|Kosztorys|Razem|Suma\s+\w+|Preis|Gesamt|Vullingen|Prijs\s+van\s+het\s+element|Totaal\s*elementen|Totaal\s*offerte(?:\/order)?|Eind\s*totaal|Betaling\b|TZ\s*\d|\+\d+\s*stojak)$/i
        for (const ti of textItems) {
          if (ti.cy > h * 0.55 && bottomBlockPattern.test(ti.str)) {
            const wipeTop = Math.max(0, ti.cy - 18)
            const wipeLeft = Math.max(0, ti.cx - 40)
            // Schat tabelbreedte: ~300px vanaf de tekst, clamped op paginabreedte
            const wipeWidth = Math.min(360, w - wipeLeft)
            ctx.fillStyle = '#FFFFFF'
            ctx.fillRect(wipeLeft, wipeTop, wipeWidth, h - wipeTop)
          }
        }

        // AI VISION: vraag Claude welke regio's we WIT moeten maken (prijzen +
        // "Geen garantie"). We croppen NIET — de tekening + specs moeten altijd
        // volledig zichtbaar blijven. Alleen aangewezen regio's worden wit.
        try {
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
            body: JSON.stringify({ imageBase64: previewBase64, imageWidth: pw, imageHeight: ph, supplier: supplierName }),
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
    </div>
  )
}
