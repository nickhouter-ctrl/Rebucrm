import { NextRequest, NextResponse } from 'next/server'
import { renderToBuffer } from '@react-pdf/renderer'
import { OfferteDocument, KozijnElement } from '@/lib/pdf/offerte-template'

// Live offerte-PDF preview voor de wizard. Krijgt de huidige concept-state
// (regels, relatie, kozijn-elementen + specs) plus de geuploade tekeningen
// als multipart-files in dezelfde request, en genereert direct de Rebu-styled
// offerte-PDF. Geen DB-writes — pure in-memory render.

export const dynamic = 'force-dynamic'
export const maxDuration = 60

interface LivePreviewMeta {
  offertenummer?: string
  datum?: string
  geldig_tot?: string | null
  onderwerp?: string | null
  inleiding?: string | null
  versie_nummer?: number | null
  relatie?: {
    bedrijfsnaam?: string
    contactpersoon?: string | null
    adres?: string | null
    postcode?: string | null
    plaats?: string | null
  } | null
  regels: Array<{ omschrijving: string; aantal: number; prijs: number; btw_percentage: number }>
  // Per element: tekeningen mapping (file-keys naar pageIndex)
  elementen: Array<{
    naam: string
    hoeveelheid: number
    systeem?: string
    kleur?: string
    afmetingen?: string
    type?: string
    prijs: number
    glasType?: string
    beslag?: string
    uwWaarde?: string
    drapirichting?: string
    dorpel?: string
    sluiting?: string
    scharnieren?: string
    gewicht?: string
    omtrek?: string
    paneel?: string
    commentaar?: string
    hoekverbinding?: string
    montageGaten?: string
    afwatering?: string
    scharnierenKleur?: string
    lakKleur?: string
    sluitcilinder?: string
    aantalSleutels?: string
    gelijksluitend?: string
    krukBinnen?: string
    krukBuiten?: string
    // Form-data file-keys voor de tekening-pagina's (in volgorde)
    tekeningKeys?: string[]
    verborgen?: boolean
  }>
}

export async function POST(req: NextRequest) {
  try {
    const fd = await req.formData()
    const metaStr = fd.get('meta')
    if (typeof metaStr !== 'string') {
      return NextResponse.json({ error: 'meta veld ontbreekt' }, { status: 400 })
    }
    const meta = JSON.parse(metaStr) as LivePreviewMeta

    // Bouw tekening-data-URLs uit de blobs
    const tekeningCache = new Map<string, string>()
    for (const [key, value] of fd.entries()) {
      if (key === 'meta') continue
      if (value instanceof Blob) {
        const buffer = Buffer.from(await value.arrayBuffer())
        const mimeType = (value as Blob).type || 'image/jpeg'
        const dataUrl = `data:${mimeType};base64,${buffer.toString('base64')}`
        tekeningCache.set(key, dataUrl)
      }
    }

    // Bouw kozijn-elementen voor de template, sla verborgen elementen over
    const kozijnElementen: KozijnElement[] = meta.elementen
      .filter(el => !el.verborgen)
      .map(el => {
        const pages = (el.tekeningKeys || []).map((k, idx) => ({
          url: tekeningCache.get(k) || '',
          pageIndex: idx,
          totalPages: (el.tekeningKeys || []).length,
        })).filter(p => p.url)
        return {
          naam: el.naam,
          hoeveelheid: el.hoeveelheid,
          systeem: el.systeem || '',
          kleur: el.kleur || '',
          afmetingen: el.afmetingen || '',
          type: el.type || '',
          prijs: el.prijs,
          glasType: el.glasType || '',
          beslag: el.beslag || '',
          uwWaarde: el.uwWaarde || '',
          drapirichting: el.drapirichting || '',
          dorpel: el.dorpel || '',
          sluiting: el.sluiting || '',
          scharnieren: el.scharnieren || '',
          gewicht: el.gewicht || '',
          omtrek: el.omtrek || '',
          paneel: el.paneel || '',
          commentaar: el.commentaar || '',
          hoekverbinding: el.hoekverbinding || '',
          montageGaten: el.montageGaten || '',
          afwatering: el.afwatering || '',
          scharnierenKleur: el.scharnierenKleur || '',
          lakKleur: el.lakKleur || '',
          sluitcilinder: el.sluitcilinder || '',
          aantalSleutels: el.aantalSleutels || '',
          gelijksluitend: el.gelijksluitend || '',
          krukBinnen: el.krukBinnen || '',
          krukBuiten: el.krukBuiten || '',
          tekeningUrl: pages[0]?.url || '',
          tekeningUrls: pages,
        }
      })

    const subtotaal = meta.regels.reduce((s, r) => s + (r.aantal || 0) * (r.prijs || 0), 0)
    const btw_totaal = meta.regels.reduce((s, r) => s + (r.aantal || 0) * (r.prijs || 0) * (r.btw_percentage || 0) / 100, 0)
    const totaal = subtotaal + btw_totaal

    const relatie = meta.relatie
      ? {
          bedrijfsnaam: meta.relatie.bedrijfsnaam || 'Klant',
          contactpersoon: meta.relatie.contactpersoon ?? null,
          adres: meta.relatie.adres ?? null,
          postcode: meta.relatie.postcode ?? null,
          plaats: meta.relatie.plaats ?? null,
        }
      : null

    const offerteData = {
      offertenummer: meta.offertenummer || 'CONCEPT',
      datum: meta.datum || new Date().toISOString().slice(0, 10),
      geldig_tot: meta.geldig_tot ?? null,
      onderwerp: meta.onderwerp ?? null,
      inleiding: meta.inleiding ?? null,
      versie_nummer: meta.versie_nummer ?? 1,
      relatie,
      regels: meta.regels.map(r => ({
        ...r,
        totaal: (r.aantal || 0) * (r.prijs || 0),
      })),
      kozijnElementen,
      subtotaal,
      btw_totaal,
      totaal,
      leverancierTotaal: undefined,
    }

    // hidePrices=true: leverancier-prijzen zijn nooit zichtbaar in deze preview
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const buffer = await renderToBuffer(OfferteDocument({ offerte: offerteData, hidePrices: true }) as any)
    const uint8 = new Uint8Array(buffer)

    return new NextResponse(uint8, {
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': 'inline; filename="offerte-preview.pdf"',
        'Cache-Control': 'no-store',
      },
    })
  } catch (err) {
    console.error('Live preview error:', err)
    return NextResponse.json({ error: err instanceof Error ? err.message : 'PDF preview mislukt' }, { status: 500 })
  }
}
