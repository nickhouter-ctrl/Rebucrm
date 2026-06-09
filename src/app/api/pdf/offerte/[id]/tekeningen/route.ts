import { NextResponse } from 'next/server'
import { renderToBuffer } from '@react-pdf/renderer'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { TekeningenDocument, TekeningenElement } from '@/lib/pdf/tekeningen-template'
import { parseLeverancierPdfText } from '@/lib/pdf-parser'

type ParsedElement = ReturnType<typeof parseLeverancierPdfText>['elementen'][number]

// Normaliseer namen zodat 'Deur 008', 'DEUR 008', 'Element 008', 'Merk 1' uit
// verschillende bronnen (parser vs. opgeslagen prijzen vs. tekening-metadata)
// toch op elkaar matchen.
function normalizeName(name: string): string {
  return name
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase()
    .replace(/^(deur|element|gekoppeld\s+element|merk|positie)\s+0*/, '')
}

// Verwijderde lokale parser: de tekeningen-PDF gebruikt nu dezelfde canonieke
// parser als de rest van de app (parseLeverancierPdfText). Voorheen stond hier
// een tweede, verouderde kopie die Schüco en Gealan-NL niet kende — die leverde
// 0 elementen op (lege specs + €0 prijzen in de tekeningen-PDF). Door één parser
// te gebruiken werkt élke leverancier die de hoofd-parser ondersteunt hier ook.

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const supabase = await createClient()

  const { data: offerte, error } = await supabase
    .from('offertes')
    .select('offertenummer')
    .eq('id', id)
    .single()

  if (error || !offerte) {
    return NextResponse.json({ error: 'Offerte niet gevonden' }, { status: 404 })
  }

  try {
    const supabaseAdmin = createAdminClient()
    const tekeningenElementen: TekeningenElement[] = []

    const { data: leverancierDoc } = await supabaseAdmin
      .from('documenten')
      .select('*')
      .eq('entiteit_type', 'offerte_leverancier')
      .eq('entiteit_id', id)
      .maybeSingle()

    if (!leverancierDoc) {
      return NextResponse.json({ error: 'Geen leverancier PDF gevonden' }, { status: 404 })
    }

    const { data: metaDoc } = await supabaseAdmin
      .from('documenten')
      .select('*')
      .eq('entiteit_type', 'offerte_leverancier_data')
      .eq('entiteit_id', id)
      .maybeSingle()

    if (!metaDoc) {
      return NextResponse.json({ error: 'Geen tekeningen gevonden' }, { status: 404 })
    }

    // Support both old format (array) and new format (object with tekeningen + margePercentage)
    const rawMeta = JSON.parse(metaDoc.storage_path)
    const tekeningData: { naam: string; tekeningPath: string; pageIndex?: number; totalPages?: number }[] = Array.isArray(rawMeta) ? rawMeta : (rawMeta.tekeningen || [])
    const marges: Record<string, number> = (!Array.isArray(rawMeta) && rawMeta.marges) ? rawMeta.marges : {}
    const globalMarge: number = (!Array.isArray(rawMeta) && rawMeta.margePercentage) ? rawMeta.margePercentage : 0

    // Opgeslagen inkoopprijzen: eerst de (eventueel handmatig bijgestelde)
    // prijzen uit de wizard ('offerte_leverancier_data'.prijzen), anders de bij
    // upload geparste prijzen ('offerte_leverancier_parsed'). Deze zijn de
    // betrouwbaarste bron — ze zijn met de juiste leverancier-hint geparst.
    let savedPrijzen: Record<string, { prijs: number; hoeveelheid: number }> =
      (!Array.isArray(rawMeta) && rawMeta.prijzen) ? rawMeta.prijzen : {}
    if (Object.keys(savedPrijzen).length === 0) {
      const { data: parsedDoc } = await supabaseAdmin
        .from('documenten')
        .select('*')
        .eq('entiteit_type', 'offerte_leverancier_parsed')
        .eq('entiteit_id', id)
        .maybeSingle()
      if (parsedDoc) {
        try { savedPrijzen = JSON.parse(parsedDoc.storage_path).prijzen || {} } catch { /* ignore */ }
      }
    }
    function findSavedPrijs(naam: string): { prijs: number; hoeveelheid: number } | null {
      if (savedPrijzen[naam]) return savedPrijzen[naam]
      const normalized = normalizeName(naam)
      for (const [key, val] of Object.entries(savedPrijzen)) {
        if (normalizeName(key) === normalized) return val
      }
      return null
    }

    // Parse original PDF for element specs via de canonieke parser (auto-detect).
    const { parsePdfBuffer: pdfParse } = await import('@/lib/pdf-extract')
    const { data: pdfFile } = await supabaseAdmin.storage
      .from('documenten')
      .download(leverancierDoc.storage_path)

    let elementData: ParsedElement[] = []
    if (pdfFile) {
      const pdfBuffer = Buffer.from(await pdfFile.arrayBuffer())
      const parsed = await pdfParse(pdfBuffer)
      elementData = parseLeverancierPdfText(parsed.text).elementen
    }
    function findParsedElement(naam: string): ParsedElement | undefined {
      const exact = elementData.find(e => e.naam === naam)
      if (exact) return exact
      const normalized = normalizeName(naam)
      return elementData.find(e => normalizeName(e.naam) === normalized)
    }

    // Group by element name to support multi-page elements
    const elementTekeningen = new Map<string, { url: string; pageIndex: number; totalPages: number }[]>()
    const elementOrder: string[] = []

    for (const tekening of tekeningData) {
      const { data: imgFile } = await supabaseAdmin.storage
        .from('documenten')
        .download(tekening.tekeningPath)

      let tekeningUrl = ''
      if (imgFile) {
        const imgBuffer = Buffer.from(await imgFile.arrayBuffer())
        const mime = /\.jpe?g$/i.test(tekening.tekeningPath) ? 'image/jpeg' : 'image/png'
        tekeningUrl = `data:${mime};base64,${imgBuffer.toString('base64')}`
      }

      const pageIndex = tekening.pageIndex ?? 0
      const totalPages = tekening.totalPages ?? 1

      if (!elementTekeningen.has(tekening.naam)) {
        elementTekeningen.set(tekening.naam, [])
        elementOrder.push(tekening.naam)
      }
      elementTekeningen.get(tekening.naam)!.push({ url: tekeningUrl, pageIndex, totalPages })
    }

    for (const naam of elementOrder) {
      const pages = elementTekeningen.get(naam)!
      const matchingElement = findParsedElement(naam)

      // Opgeslagen prijs wint van de her-geparste prijs (handmatige correcties
      // uit de wizard blijven zo behouden), met de PDF-parse als fallback.
      const saved = findSavedPrijs(naam)
      const inkoopPrijs = saved?.prijs ?? matchingElement?.prijs ?? 0
      const margePerc = marges[naam] ?? globalMarge
      const verkoopPrijs = margePerc > 0
        ? Math.round(inkoopPrijs * (1 + margePerc / 100) * 100) / 100
        : inkoopPrijs

      tekeningenElementen.push({
        naam: matchingElement?.naam || naam,
        hoeveelheid: saved?.hoeveelheid ?? matchingElement?.hoeveelheid ?? 1,
        prijs: verkoopPrijs,
        systeem: matchingElement?.systeem || '',
        kleur: matchingElement?.kleur || '',
        afmetingen: matchingElement?.afmetingen || '',
        type: matchingElement?.type || '',
        glasType: matchingElement?.glasType || '',
        beslag: matchingElement?.beslag || '',
        uwWaarde: matchingElement?.uwWaarde || '',
        drapirichting: matchingElement?.drapirichting || '',
        dorpel: matchingElement?.dorpel || '',
        sluiting: matchingElement?.sluiting || '',
        scharnieren: matchingElement?.scharnieren || '',
        gewicht: matchingElement?.gewicht || '',
        omtrek: matchingElement?.omtrek || '',
        paneel: matchingElement?.paneel || '',
        commentaar: matchingElement?.commentaar || '',
        hoekverbinding: matchingElement?.hoekverbinding || '',
        montageGaten: matchingElement?.montageGaten || '',
        afwatering: matchingElement?.afwatering || '',
        scharnierenKleur: matchingElement?.scharnierenKleur || '',
        lakKleur: matchingElement?.lakKleur || '',
        sluitcilinder: matchingElement?.sluitcilinder || '',
        aantalSleutels: matchingElement?.aantalSleutels || '',
        gelijksluitend: matchingElement?.gelijksluitend || '',
        krukBinnen: matchingElement?.krukBinnen || '',
        krukBuiten: matchingElement?.krukBuiten || '',
        tekeningUrl: pages[0]?.url || '',
        tekeningUrls: pages,
      })
    }

    if (tekeningenElementen.length === 0) {
      return NextResponse.json({ error: 'Geen tekeningen gevonden' }, { status: 404 })
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const buffer = await renderToBuffer(TekeningenDocument({ offerte: { offertenummer: offerte.offertenummer, elementen: tekeningenElementen } }) as any)
    const uint8 = new Uint8Array(buffer)

    return new NextResponse(uint8, {
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `inline; filename="Tekeningen-${offerte.offertenummer}.pdf"`,
      },
    })
  } catch (err) {
    console.error('Tekeningen PDF generation error:', err)
    return NextResponse.json({ error: 'PDF generatie mislukt' }, { status: 500 })
  }
}
