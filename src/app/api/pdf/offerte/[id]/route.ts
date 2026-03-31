import { NextResponse } from 'next/server'
import { renderToBuffer } from '@react-pdf/renderer'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { OfferteDocument, KozijnElement } from '@/lib/pdf/offerte-template'
import { parseLeverancierPdfText } from '@/lib/pdf-parser'

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
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
    // Check for leverancier PDF data
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
      // Get tekening metadata
      const { data: metaDoc } = await supabaseAdmin
        .from('documenten')
        .select('*')
        .eq('entiteit_type', 'offerte_leverancier_data')
        .eq('entiteit_id', id)
        .maybeSingle()

      if (metaDoc) {
        try {
          // Support both old format (array) and new format (object with tekeningen + margePercentage)
          const rawMeta = JSON.parse(metaDoc.storage_path)
          let tekeningData: { naam: string; tekeningPath: string; pageIndex?: number; totalPages?: number }[]
          let margePercentage = 0
          let perElementMarges: Record<string, number> = {}
          if (Array.isArray(rawMeta)) {
            tekeningData = rawMeta
          } else {
            tekeningData = rawMeta.tekeningen || []
            margePercentage = rawMeta.margePercentage || 0
            perElementMarges = rawMeta.marges || {}
          }

          // Parse original PDF for element data
          const { parsePdfBuffer: pdfParse } = await import('@/lib/pdf-extract')
          const { data: pdfFile } = await supabaseAdmin.storage
            .from('documenten')
            .download(leverancierDoc.storage_path)

          if (pdfFile) {
            const pdfBuffer = Buffer.from(await pdfFile.arrayBuffer())
            const parsed = await pdfParse(pdfBuffer)

            // Extract element data and total from text (use shared parser from actions.ts)
            const parsedPdf = parseLeverancierPdfText(parsed.text)
            const elementData = parsedPdf.elementen
            const leverancierTotaalRaw = parsedPdf.totaal

            // Download tekening images and convert to base64
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

            kozijnElementen = []
            for (const naam of elementOrder) {
              const pages = elementTekeningen.get(naam)!
              const matchingElement = elementData.find(e => e.naam === naam)
              const inkoopPrijs = matchingElement?.prijs || 0
              const elementMarge = perElementMarges[naam] !== undefined ? perElementMarges[naam] : margePercentage
              const verkoopPrijs = elementMarge > 0 ? Math.round(inkoopPrijs * (1 + elementMarge / 100) * 100) / 100 : inkoopPrijs

              kozijnElementen.push({
                naam: matchingElement?.naam || naam,
                hoeveelheid: matchingElement?.hoeveelheid || 1,
                systeem: matchingElement?.systeem || '',
                kleur: matchingElement?.kleur || '',
                afmetingen: matchingElement?.afmetingen || '',
                type: matchingElement?.type || '',
                prijs: verkoopPrijs,
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

            // Calculate leverancier totaal with marge applied
            if (leverancierTotaalRaw > 0) {
              // When per-element marges exist, sum individual element prices (already marge-applied)
              if (Object.keys(perElementMarges).length > 0 && kozijnElementen && kozijnElementen.length > 0) {
                leverancierTotaal = kozijnElementen.reduce((sum, e) => sum + e.prijs * e.hoeveelheid, 0)
              } else {
                const totaalMetMarge = margePercentage > 0
                  ? Math.round(leverancierTotaalRaw * (1 + margePercentage / 100) * 100) / 100
                  : leverancierTotaalRaw
                leverancierTotaal = totaalMetMarge
              }
            }
          }
        } catch (parseErr) {
          console.error('Error parsing leverancier data:', parseErr)
          // Continue without kozijn elements
        }
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
