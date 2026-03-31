import { NextResponse } from 'next/server'
import { renderToBuffer } from '@react-pdf/renderer'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { OfferteDocument, KozijnElement } from '@/lib/pdf/offerte-template'
import { parseLeverancierPdfText } from '@/lib/pdf-parser'

function normalizeName(name: string): string {
  return name.replace(/\s+/g, ' ').trim().toLowerCase()
}

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const url = new URL(_request.url)
  const debug = url.searchParams.get('debug') === '1'
  const supabase = await createClient()

  const { data: offerte, error } = await supabase
    .from('offertes')
    .select('*, relatie:relaties(*), regels:offerte_regels(*)')
    .eq('id', id)
    .single()

  if (error || !offerte) {
    return NextResponse.json({ error: 'Offerte niet gevonden' }, { status: 404 })
  }

  try {
    const supabaseAdmin = createAdminClient()
    let kozijnElementen: KozijnElement[] | undefined
    let leverancierTotaal: number | undefined

    const { data: leverancierDoc } = await supabaseAdmin
      .from('documenten')
      .select('*')
      .eq('entiteit_type', 'offerte_leverancier')
      .eq('entiteit_id', id)
      .maybeSingle()

    if (leverancierDoc) {
      try {
        // Parse leverancier PDF for element prices/specs
        const { parsePdfBuffer: pdfParse } = await import('@/lib/pdf-extract')
        const { data: pdfFile } = await supabaseAdmin.storage
          .from('documenten')
          .download(leverancierDoc.storage_path)

        let elementData: ReturnType<typeof parseLeverancierPdfText>['elementen'] = []
        let leverancierTotaalRaw = 0

        if (pdfFile) {
          const pdfBuffer = Buffer.from(await pdfFile.arrayBuffer())
          const parsed = await pdfParse(pdfBuffer)
          const parsedPdf = parseLeverancierPdfText(parsed.text)
          elementData = parsedPdf.elementen
          leverancierTotaalRaw = parsedPdf.totaal
        }

        // Load tekening metadata + marge data
        const { data: metaDoc } = await supabaseAdmin
          .from('documenten')
          .select('*')
          .eq('entiteit_type', 'offerte_leverancier_data')
          .eq('entiteit_id', id)
          .maybeSingle()

        let tekeningData: { naam: string; tekeningPath: string; pageIndex?: number; totalPages?: number }[] = []
        let margePercentage = 0
        let perElementMarges: Record<string, number> = {}
        let savedPrijzen: Record<string, { prijs: number; hoeveelheid: number }> = {}

        if (metaDoc) {
          const rawMeta = JSON.parse(metaDoc.storage_path)
          if (Array.isArray(rawMeta)) {
            tekeningData = rawMeta
          } else {
            tekeningData = rawMeta.tekeningen || []
            margePercentage = rawMeta.margePercentage || 0
            perElementMarges = rawMeta.marges || {}
            savedPrijzen = rawMeta.prijzen || {}
          }
        }

        // Download tekening images and group by element name
        const elementTekeningen = new Map<string, { url: string; pageIndex: number; totalPages: number }[]>()
        const elementOrder: string[] = []

        for (const tekening of tekeningData) {
          const { data: imgFile } = await supabaseAdmin.storage
            .from('documenten')
            .download(tekening.tekeningPath)

          let tekeningUrl = ''
          if (imgFile) {
            const imgBuffer = Buffer.from(await imgFile.arrayBuffer())
            tekeningUrl = `data:image/png;base64,${imgBuffer.toString('base64')}`
          }

          const pageIndex = tekening.pageIndex ?? 0
          const totalPages = tekening.totalPages ?? 1

          if (!elementTekeningen.has(tekening.naam)) {
            elementTekeningen.set(tekening.naam, [])
            elementOrder.push(tekening.naam)
          }
          elementTekeningen.get(tekening.naam)!.push({ url: tekeningUrl, pageIndex, totalPages })
        }

        // Helper: find matching parsed element by exact or normalized name
        const usedParsedIndices = new Set<number>()
        function findParsedElement(naam: string) {
          // Exact match first
          let idx = elementData.findIndex((e, i) => !usedParsedIndices.has(i) && e.naam === naam)
          if (idx === -1) {
            // Normalized match
            const normalized = normalizeName(naam)
            idx = elementData.findIndex((e, i) => !usedParsedIndices.has(i) && normalizeName(e.naam) === normalized)
          }
          if (idx >= 0) {
            usedParsedIndices.add(idx)
            return elementData[idx]
          }
          return null
        }

        // Helper: find marge for element by exact or normalized name
        function findMarge(naam: string): number {
          if (perElementMarges[naam] !== undefined) return perElementMarges[naam]
          const normalized = normalizeName(naam)
          for (const [key, val] of Object.entries(perElementMarges)) {
            if (normalizeName(key) === normalized) return val
          }
          return margePercentage
        }

        // Helper: find saved price by exact or normalized name
        function findSavedPrijs(naam: string): { prijs: number; hoeveelheid: number } | null {
          if (savedPrijzen[naam]) return savedPrijzen[naam]
          const normalized = normalizeName(naam)
          for (const [key, val] of Object.entries(savedPrijzen)) {
            if (normalizeName(key) === normalized) return val
          }
          return null
        }

        // Helper: build KozijnElement from tekening name + optional parsed data
        function buildElement(
          naam: string,
          pages: { url: string; pageIndex: number; totalPages: number }[] | undefined,
          parsed: typeof elementData[0] | null,
        ): KozijnElement {
          const marge = findMarge(naam)
          // Use parsed price, fallback to saved price from metadata
          const saved = findSavedPrijs(naam)
          const inkoopPrijs = parsed?.prijs || saved?.prijs || 0
          const hoeveelheid = parsed?.hoeveelheid || saved?.hoeveelheid || 1
          const verkoopPrijs = marge > 0
            ? Math.round(inkoopPrijs * (1 + marge / 100) * 100) / 100
            : inkoopPrijs

          return {
            naam: parsed?.naam || naam,
            hoeveelheid,
            systeem: parsed?.systeem || '',
            kleur: parsed?.kleur || '',
            afmetingen: parsed?.afmetingen || '',
            type: parsed?.type || '',
            prijs: verkoopPrijs,
            glasType: parsed?.glasType || '',
            beslag: parsed?.beslag || '',
            uwWaarde: parsed?.uwWaarde || '',
            drapirichting: parsed?.drapirichting || '',
            dorpel: parsed?.dorpel || '',
            sluiting: parsed?.sluiting || '',
            scharnieren: parsed?.scharnieren || '',
            gewicht: parsed?.gewicht || '',
            omtrek: parsed?.omtrek || '',
            paneel: parsed?.paneel || '',
            commentaar: parsed?.commentaar || '',
            hoekverbinding: parsed?.hoekverbinding || '',
            montageGaten: parsed?.montageGaten || '',
            afwatering: parsed?.afwatering || '',
            scharnierenKleur: parsed?.scharnierenKleur || '',
            lakKleur: parsed?.lakKleur || '',
            sluitcilinder: parsed?.sluitcilinder || '',
            aantalSleutels: parsed?.aantalSleutels || '',
            gelijksluitend: parsed?.gelijksluitend || '',
            krukBinnen: parsed?.krukBinnen || '',
            krukBuiten: parsed?.krukBuiten || '',
            tekeningUrl: pages?.[0]?.url || '',
            tekeningUrls: pages,
          }
        }

        kozijnElementen = []

        if (elementOrder.length > 0) {
          // PRIMARY PATH: build from tekening metadata, enrich with parsed data
          for (const naam of elementOrder) {
            const pages = elementTekeningen.get(naam)!
            const parsed = findParsedElement(naam)
            kozijnElementen.push(buildElement(naam, pages, parsed))
          }

          // Also add any parsed elements that had no tekening match
          for (let i = 0; i < elementData.length; i++) {
            if (!usedParsedIndices.has(i)) {
              const el = elementData[i]
              kozijnElementen.push(buildElement(el.naam, undefined, el))
            }
          }
        } else if (elementData.length > 0) {
          // FALLBACK: no tekeningen at all, use parsed elements directly
          for (const el of elementData) {
            kozijnElementen.push(buildElement(el.naam, undefined, el))
          }
        }

        // Debug: return JSON with all data instead of PDF
        if (debug) {
          return NextResponse.json({
            leverancierTotaalRaw,
            parsedElementCount: elementData.length,
            parsedElements: elementData.map(e => ({ naam: e.naam, prijs: e.prijs, hoeveelheid: e.hoeveelheid })),
            tekeningCount: tekeningData.length,
            tekeningNames: elementOrder,
            savedPrijzen,
            perElementMarges,
            margePercentage,
            kozijnElementen: kozijnElementen?.map(e => ({ naam: e.naam, prijs: e.prijs, hoeveelheid: e.hoeveelheid })),
          })
        }

        // Calculate leverancier totaal with marge applied
        if (leverancierTotaalRaw > 0) {
          if (Object.keys(perElementMarges).length > 0 && kozijnElementen.length > 0) {
            leverancierTotaal = kozijnElementen.reduce((sum, e) => sum + e.prijs * e.hoeveelheid, 0)
          } else {
            leverancierTotaal = margePercentage > 0
              ? Math.round(leverancierTotaalRaw * (1 + margePercentage / 100) * 100) / 100
              : leverancierTotaalRaw
          }
        }
      } catch (parseErr) {
        console.error('Error parsing leverancier data:', parseErr)
      }
    }

    const offerteData = {
      ...offerte,
      kozijnElementen,
      leverancierTotaal,
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const buffer = await renderToBuffer(OfferteDocument({ offerte: offerteData }) as any)
    const uint8 = new Uint8Array(buffer)

    return new NextResponse(uint8, {
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `inline; filename="Offerte-${offerte.offertenummer}.pdf"`,
      },
    })
  } catch (err) {
    console.error('PDF generation error:', err)
    return NextResponse.json({ error: 'PDF generatie mislukt' }, { status: 500 })
  }
}
