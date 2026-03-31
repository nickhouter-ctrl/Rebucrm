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
        // Parse leverancier PDF for element data
        const { parsePdfBuffer: pdfParse } = await import('@/lib/pdf-extract')
        const { data: pdfFile } = await supabaseAdmin.storage
          .from('documenten')
          .download(leverancierDoc.storage_path)

        if (pdfFile) {
          const pdfBuffer = Buffer.from(await pdfFile.arrayBuffer())
          const parsed = await pdfParse(pdfBuffer)
          const parsedPdf = parseLeverancierPdfText(parsed.text)
          const elementData = parsedPdf.elementen
          const leverancierTotaalRaw = parsedPdf.totaal

          // Load tekening metadata + marge data (if available)
          const { data: metaDoc } = await supabaseAdmin
            .from('documenten')
            .select('*')
            .eq('entiteit_type', 'offerte_leverancier_data')
            .eq('entiteit_id', id)
            .maybeSingle()

          let tekeningData: { naam: string; tekeningPath: string; pageIndex?: number; totalPages?: number }[] = []
          let margePercentage = 0
          let perElementMarges: Record<string, number> = {}

          if (metaDoc) {
            const rawMeta = JSON.parse(metaDoc.storage_path)
            if (Array.isArray(rawMeta)) {
              tekeningData = rawMeta
            } else {
              tekeningData = rawMeta.tekeningen || []
              margePercentage = rawMeta.margePercentage || 0
              perElementMarges = rawMeta.marges || {}
            }
          }

          // Download tekening images and group by element name
          const elementTekeningen = new Map<string, { url: string; pageIndex: number; totalPages: number }[]>()

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
            }
            elementTekeningen.get(tekening.naam)!.push({ url: tekeningUrl, pageIndex, totalPages })
          }

          // Build kozijnElementen from ALL parsed elements (not just those with tekeningen)
          kozijnElementen = []
          for (const el of elementData) {
            // Find matching tekening by exact name or normalized name
            let pages = elementTekeningen.get(el.naam)
            if (!pages) {
              // Fuzzy match: try normalized names
              const normalizedElNaam = normalizeName(el.naam)
              for (const [tekNaam, tekPages] of elementTekeningen.entries()) {
                if (normalizeName(tekNaam) === normalizedElNaam) {
                  pages = tekPages
                  break
                }
              }
            }

            // Find marge: try exact key, then normalized key
            let elementMarge = perElementMarges[el.naam]
            if (elementMarge === undefined) {
              const normalizedElNaam = normalizeName(el.naam)
              for (const [key, val] of Object.entries(perElementMarges)) {
                if (normalizeName(key) === normalizedElNaam) {
                  elementMarge = val
                  break
                }
              }
            }
            if (elementMarge === undefined) elementMarge = margePercentage

            const inkoopPrijs = el.prijs
            const verkoopPrijs = elementMarge > 0
              ? Math.round(inkoopPrijs * (1 + elementMarge / 100) * 100) / 100
              : inkoopPrijs

            kozijnElementen.push({
              naam: el.naam,
              hoeveelheid: el.hoeveelheid,
              systeem: el.systeem,
              kleur: el.kleur,
              afmetingen: el.afmetingen,
              type: el.type,
              prijs: verkoopPrijs,
              glasType: el.glasType,
              beslag: el.beslag,
              uwWaarde: el.uwWaarde,
              drapirichting: el.drapirichting,
              dorpel: el.dorpel,
              sluiting: el.sluiting,
              scharnieren: el.scharnieren,
              gewicht: el.gewicht,
              omtrek: el.omtrek,
              paneel: el.paneel,
              commentaar: el.commentaar,
              hoekverbinding: el.hoekverbinding,
              montageGaten: el.montageGaten,
              afwatering: el.afwatering,
              scharnierenKleur: el.scharnierenKleur,
              lakKleur: el.lakKleur,
              sluitcilinder: el.sluitcilinder,
              aantalSleutels: el.aantalSleutels,
              gelijksluitend: el.gelijksluitend,
              krukBinnen: el.krukBinnen,
              krukBuiten: el.krukBuiten,
              tekeningUrl: pages?.[0]?.url || '',
              tekeningUrls: pages,
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
