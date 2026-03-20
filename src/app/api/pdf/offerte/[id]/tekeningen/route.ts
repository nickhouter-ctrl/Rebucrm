import { NextResponse } from 'next/server'
import { renderToBuffer } from '@react-pdf/renderer'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { TekeningenDocument, TekeningenElement } from '@/lib/pdf/tekeningen-template'

interface ParsedElement {
  naam: string
  hoeveelheid: number
  systeem: string
  kleur: string
  afmetingen: string
  type: string
  prijs: number
  glasType: string
  beslag: string
  uwWaarde: string
  drapirichting: string
  dorpel: string
  sluiting: string
  scharnieren: string
  gewicht: string
  omtrek: string
  paneel: string
  commentaar: string
  hoekverbinding: string
  montageGaten: string
  afwatering: string
  scharnierenKleur: string
  lakKleur: string
  sluitcilinder: string
  aantalSleutels: string
  gelijksluitend: string
  krukBinnen: string
  krukBuiten: string
}

function parseElementsFromText(text: string): ParsedElement[] {
  const cleanField = (val: string) => val.replace(/\s*Geen\s*[Gg]arantie!?\s*/gi, '').replace(/\s*No\s*warranty!?\s*/gi, '').trim()

  // Detect format
  const isGealan = /Merk\s+\d+Aantal:\d+/.test(text)
  const isEkoOkna = !isGealan && /Hoev\.\s*:\s*\d+/.test(text)

  const headers: { naam: string; hoeveelheid: number; systeem: string; kleur: string; idx: number; endIdx: number }[] = []
  let match
  if (isGealan) {
    const elementPattern = /Merk\s+(\d+)Aantal:(\d+)(?:Verbinding:\w+)?Systeem:\s*([^\n]+(?:\n[^\n]+)?)/g
    while ((match = elementPattern.exec(text)) !== null) {
      const nextMerkIdx = text.indexOf('Merk ' + (parseInt(match[1]) + 1) + 'Aantal:', match.index + 1)
      const sectionEnd = nextMerkIdx > 0 ? nextMerkIdx : text.length
      const section = text.substring(match.index, sectionEnd)
      const kleurMatch = section.match(/Kader\s+([^\n]+)/)
      headers.push({ naam: 'Merk ' + match[1], hoeveelheid: parseInt(match[2]), systeem: match[3].trim().replace(/\n/g, ' '), kleur: kleurMatch ? kleurMatch[1].trim() : '', idx: match.index, endIdx: match.index + match[0].length })
    }
  } else if (isEkoOkna) {
    const elementPattern = /((?:Gekoppeld\s+)?[Ee]lement\s+\d{3}(?:\/\d+)?)\s*Hoev\.\s*:\s*(\d+)\s*Kleur\s*:\s*([\s\S]*?)Systeem\s*:\s*([^\n]+)/g
    while ((match = elementPattern.exec(text)) !== null) {
      headers.push({ naam: match[1].trim(), hoeveelheid: parseInt(match[2]), systeem: match[4].trim(), kleur: match[3].trim(), idx: match.index, endIdx: match.index + match[0].length })
    }
  } else {
    const elementPattern = /((?:Deur|Element)\s+\d{3})\nHoeveelheid:\n(\d+)\nSysteem:\s*([\s\S]+?)Kleur:\s*([^\n]+)/g
    while ((match = elementPattern.exec(text)) !== null) {
      headers.push({ naam: match[1], hoeveelheid: parseInt(match[2]), systeem: match[3].trim(), kleur: match[4].trim(), idx: match.index, endIdx: match.index + match[0].length })
    }
  }

  // Find all Buitenaanzicht positions (only for original format where specs appear BEFORE each header)
  const allBuitenPositions: number[] = []
  const specsPositions: number[] = []
  if (!isEkoOkna && !isGealan) {
    const buitenPattern = /Buitenaanzicht\n/g
    while ((match = buitenPattern.exec(text)) !== null) { allBuitenPositions.push(match.index) }
    for (let i = 0; i < headers.length; i++) {
      const prevHeaderEnd = i > 0 ? headers[i - 1].endIdx : 0
      const candidates = allBuitenPositions.filter(pos => pos > prevHeaderEnd && pos < headers[i].idx)
      specsPositions.push(candidates.length > 0 ? candidates[candidates.length - 1] : -1)
    }
  }

  // Extract prices in order (only for original format)
  const allPrices: number[] = []
  if (!isEkoOkna && !isGealan) {
    const pricePattern = /^(?:Deur|Element)\s*(?:(\d+)\s*x\s*€\s*([\d.,]+))?€\s*([\d.,]+)/gm
    let priceMatch
    while ((priceMatch = pricePattern.exec(text)) !== null) {
      allPrices.push(parseFloat((priceMatch[2] || priceMatch[3]).replace(/\./g, '').replace(',', '.')))
    }
  }

  const elementen: ParsedElement[] = []

  for (let i = 0; i < headers.length; i++) {
    const header = headers[i]

    let specsText: string
    let notesText: string
    let searchText: string

    if (isGealan) {
      const nextIdx = i + 1 < headers.length ? headers[i + 1].idx : text.length
      searchText = text.substring(header.endIdx, nextIdx)
      specsText = searchText
      notesText = searchText
    } else if (isEkoOkna) {
      const nextIdx = i + 1 < headers.length ? headers[i + 1].idx : text.length
      searchText = text.substring(header.endIdx, nextIdx)
      specsText = searchText
      notesText = searchText
    } else {
      specsText = specsPositions[i] >= 0 ? text.substring(specsPositions[i], header.idx) : ''
      let notesEnd: number
      if (i + 1 < headers.length) {
        notesEnd = specsPositions[i + 1] >= 0 ? specsPositions[i + 1] : headers[i + 1].idx
      } else {
        notesEnd = text.length
      }
      notesText = text.substring(header.endIdx, notesEnd)
      searchText = specsText + '\n' + notesText
    }

    let prijs = 0
    if (isGealan) {
      const gealanPriceMatch = searchText.match(/Netto prijs\n\w+?([\d.,]+)\n/)
      if (gealanPriceMatch) {
        prijs = parseFloat(gealanPriceMatch[1].replace(/\./g, '').replace(',', '.'))
      }
    } else if (isEkoOkna) {
      // Try "N x unit_price" format first (unit price ends at comma + 2 digits)
      let ekoPriceMatch = searchText.match(/Prijs van het element\s*\d+\s*x\s*([\d\s.]+,\d{2})/i)
      // Fallback: single price before "E" (no "N x" prefix)
      if (!ekoPriceMatch) ekoPriceMatch = searchText.match(/Prijs van het element\s*([\d\s.]+,\d{2})\s*E/i)
      if (ekoPriceMatch) {
        const prijsStr = ekoPriceMatch[1].trim()
        prijs = parseFloat(prijsStr.replace(/\s/g, '').replace(/\./g, '').replace(',', '.'))
      }
    } else {
      prijs = i < allPrices.length ? allPrices[i] : 0
    }

    let drapirichting = ''
    let type = header.naam.startsWith('Deur') ? 'Deur' :
               header.naam.toLowerCase().startsWith('gekoppeld') ? 'Koppelelement' : 'Raam'

    if (isGealan) {
      const vleugelGealanMatches = searchText.match(/Vleugel\s+[^\n]+/g)
      if (vleugelGealanMatches) {
        for (const v of vleugelGealanMatches) {
          if (/DK\s*Raam/i.test(v)) { type = 'Draai-kiep raam' }
          else if (/Stolpdeur\s+buitendr/i.test(v)) { type = 'Stolpdeur'; drapirichting = 'Naar buiten draaiend' }
          else if (/Deur\s+binnendr/i.test(v)) { type = 'Deur'; drapirichting = 'Naar binnen draaiend' }
          else if (/Deur\s+buitendr/i.test(v)) { type = 'Deur'; drapirichting = 'Naar buiten draaiend' }
        }
      } else {
        type = 'Vast raam'
      }
    }

    const vleugelMatches = !isGealan ? specsText.match(/Vleugel\s*(?:\d\s*\n\s*)?(17\d{4}\s+[^\n]+|K\d{5,6}[,\s]+[^\n]+|COR-\d{4}[,\s]+[^\n]+|Vast raam in de kader)/g) : null
    if (vleugelMatches) {
      let allVast = true
      for (const desc of vleugelMatches) {
        if (/deur\s+vleugel\s+naar\s+binnen\s+opendraaiend/i.test(desc)) { drapirichting = 'Naar binnen draaiend'; type = 'Deur' }
        else if (/deur\s+vleugel\s+naar\s+buiten\s+opendraaiend/i.test(desc)) { drapirichting = 'Naar buiten draaiend'; type = 'Deur' }
        else if (/terras\s+vleugel\s+naar\s+binnen\s+opendraaiend/i.test(desc)) { drapirichting = 'Naar binnen draaiend'; type = 'Terrasraam' }
        else if (/terras\s+vleugel\s+naar\s+buiten\s+opendraaiend/i.test(desc)) { drapirichting = 'Naar buiten draaiend'; type = 'Terrasraam' }
        else if (/vleugel\s+RECHT/i.test(desc)) { allVast = false }
        else if (!/Vast\s+raam/i.test(desc)) { allVast = false }
      }
      if (type !== 'Deur' && type !== 'Terrasraam' && allVast) { type = 'Vast raam' }
    }
    const beslagMatch = specsText.match(/Beslag\s*([A-Z][^\n]+)/)
    const gealanBeslagMatch = isGealan ? searchText.match(/Raamkruk\s*\n\s*\n([^\n]+)/i) : null
    const beslag = cleanField((beslagMatch ? beslagMatch[1].trim() : '') || (gealanBeslagMatch ? gealanBeslagMatch[1].trim() : ''))
    if (/Draai-kiep|Draai\s*-\s*kiep|Tilt\s*&\s*Turn/i.test(beslag) && type === 'Raam') type = 'Draai-kiep raam'
    else if (/Draai\s*\+\s*Draai\s*-?\s*kiep/i.test(beslag) && type === 'Raam') type = 'Draai + draai-kiep raam'
    else if (/Draai\s*\+\s*Draai\s*-?\s*deur/i.test(beslag) && drapirichting) type = 'Dubbele deur'
    else if (/deur\s*beslag/i.test(beslag) && !type.includes('Deur') && !type.includes('deur')) type = 'Deur'
    if (/STULP/i.test(specsText) && !type.includes('Dubbele')) type = type + ' (stulp)'
    const afmMatch = searchText.match(/Afmetingen[\s\S]{0,30}?(\d+\s*mm\s*x\s*\d+\s*mm)/)
    if (/HST|hef.*schui|\bschuif/i.test(header.systeem) || /HST|hef.*schui|\bschuif/i.test(searchText)) type = 'Schuifpui'
    const vulSpec = specsText.match(/(?:Vullingen|Glazing used)\s*\n?Afmetingen\n([\s\S]*?)(?=Prijs\b|$)/)
    const vulNotes = !vulSpec ? notesText.match(/(?:Vullingen|Glazing used)\s*\n?Afmetingen\n([\s\S]*?)(?=Prijs\b|$)/) : null
    const vullingenMatch = vulSpec || vulNotes
    let glasType = ''
    if (vullingenMatch) {
      const glasTypes: string[] = []
      const glasPat = /\d+\.\d+\n([^\n]+\[Ug=[\d.,]+\][^\n]*)/g
      let gm
      while ((gm = glasPat.exec(vullingenMatch[1])) !== null) {
        let gs = gm[1].trim()
        const ui = gs.indexOf(' Zontoetredingsfactor')
        if (ui > 0) gs = gs.substring(0, ui).trim()
        if (!glasTypes.includes(gs)) glasTypes.push(gs)
      }
      glasType = cleanField(glasTypes.join(' / '))
    }
    if (!glasType) {
      const glasTypes: string[] = []
      const gevPat = /(?:Gevraagd glas|Glazing required)\s*([^\n]+)/g
      let gm
      while ((gm = gevPat.exec(searchText)) !== null) {
        const gs = cleanField(gm[1].trim())
        if (gs && !glasTypes.includes(gs)) glasTypes.push(gs)
      }
      glasType = glasTypes.join(' / ')
    }
    if (!glasType) {
      const glasTypes: string[] = []
      const ekoGlasPat = /(\d+[\w. ]*\/\d+\w*\/\d+[\w ]*\[Ug=[\d.,]+\])/g
      let gm
      while ((gm = ekoGlasPat.exec(searchText)) !== null) {
        const gs = cleanField(gm[1].trim())
        if (gs && !glasTypes.includes(gs)) glasTypes.push(gs)
      }
      glasType = glasTypes.join(' / ')
    }
    if (isGealan && !glasType) {
      const glasSection = searchText.match(/Beglazingen & panelen[\s\S]*?(?=Netto prijs|$)/)
      if (glasSection) {
        const glasTypes = new Set<string>()
        const glasPat = /(HR\+\+[^\n]+)/g
        let gm
        while ((gm = glasPat.exec(glasSection[0])) !== null) {
          glasTypes.add(cleanField(gm[1].trim()))
        }
        glasType = Array.from(glasTypes).join(' / ')
      }
    }

    // Gealan helper: extract spec value from "  Label\n \nValue\n" format
    const gealanSpec = isGealan ? (label: string) => {
      const m = searchText.match(new RegExp(label + '\\s*\\n\\s*\\n([^\\n]+)', 'i'))
      return m ? cleanField(m[1].trim()) : ''
    } : () => ''

    const dorpelMatch = searchText.match(/Deur\s*drempel\s*([^\n]+)/i) || searchText.match(/HST\s*dorpel\s*type\s*([^\n]+)/i) || searchText.match(/Dorpel\s*([^\n]+)/i)
    const sluitingMatch = searchText.match(/Sluiting\s*([^\n]+)/) || searchText.match(/Slot\s*\n\s*\n([^\n]+)/i)
    const scharnierenMatch = searchText.match(/Scharnieren\s*([A-Z][^\n]+)/) || searchText.match(/scharnieren\s+(\w[^\n]+)/i) || searchText.match(/Uitv\.\s*scharnieren\s*\n\s*\n([^\n]+)/i)
    const uwMatch = searchText.match(/Uw\s*=\s*([\d,]+\s*W\/m.*?K)/)
    const gewichtMatch = searchText.match(/Eenheidsgewicht\s*([\d.,]+\s*Kg)/i)
    const omtrekMatch = searchText.match(/Eenheidsomtrek\s*([\d.,]+\s*mm)/i) || searchText.match(/\bOmtrek\s*([\d.,]+\s*m)\b/i)
    const paneelMatch = searchText.match(/Paneel\s*([A-Z][^\n]+)/i)
    const hoekverbindingMatch = searchText.match(/Hoekverbinding\s*([^\n]+)/i)
    const montageGatenMatch = searchText.match(/Montage\s*gaten\([^)]+\):\s*(\w+)/i) || searchText.match(/Montage\s*gaten\s+(\w[^\n]*)/i)
    const afwateringMatch = searchText.match(/Afwatering\s*([^\n]+)/i)
    const scharnierenKleurMatch = searchText.match(/Kleur\s*scharnieren\s*\n\s*\n([^\n]+)/i) || searchText.match(/Kleur\s*scharnieren\s*([^\n]+)/i)
    const lakKleurMatch = searchText.match(/Lak\s*kleur\s*([^\n]+)/i)
    const sluitcilinderMatch = searchText.match(/sluitcilinder\s*([^\n]+)/i) || searchText.match(/Cilinder\s*\n\s*\n([^\n]+)/i)
    const aantalSleutelsMatch = searchText.match(/Aantal\s*sleutels?\s*([^\n]+)/i)
    const gelijksluitendMatch = searchText.match(/Gelijksluitend[e]?\s*(?:cilinder)?\s*([^\n]+)/i)
    const krukBinnenMatch = searchText.match(/Kleur\s*kruk\s*binnen\s*([^\n]+)/i) || searchText.match(/kruk\/trekker\/cilinderplaatje\nbinnen\n([^\n]+)/i) || searchText.match(/Kruk binnen\s*\n\s*\n([^\n]+)/i)
    const krukBuitenMatch = searchText.match(/Kleur\s*kruk\s*buiten\s*([^\n]+)/i) || searchText.match(/kruk\/trekker\/cilinderplaatje\nbuiten\n([^\n]+)/i) || searchText.match(/Kruk buiten\s*\n\s*\n([^\n]+)/i)
    const commentaarMatch = notesText.match(/Commentaar(?:\s+op het product)?\n([^\n]+)/)

    elementen.push({
      naam: header.naam, hoeveelheid: header.hoeveelheid,
      systeem: cleanField(header.systeem), kleur: cleanField(header.kleur),
      afmetingen: afmMatch ? afmMatch[1] : '', type, prijs, glasType, beslag,
      uwWaarde: uwMatch ? cleanField(uwMatch[1].trim()) : '',
      drapirichting,
      dorpel: (dorpelMatch ? cleanField(dorpelMatch[1].trim()) : '') || gealanSpec('Dorpel'),
      sluiting: (sluitingMatch ? cleanField(sluitingMatch[1].trim()) : '') || gealanSpec('Slot'),
      scharnieren: (scharnierenMatch ? cleanField(scharnierenMatch[1].trim()) : '') || gealanSpec('Uitv\\. scharnieren'),
      gewicht: gewichtMatch ? gewichtMatch[1].trim() : '',
      omtrek: omtrekMatch ? omtrekMatch[1].trim() : '',
      paneel: paneelMatch ? cleanField(paneelMatch[1].trim()) : '',
      commentaar: commentaarMatch ? cleanField(commentaarMatch[1].trim()) : '',
      hoekverbinding: hoekverbindingMatch ? cleanField(hoekverbindingMatch[1].trim()) : '',
      montageGaten: montageGatenMatch ? cleanField(montageGatenMatch[1].trim()) : '',
      afwatering: afwateringMatch ? cleanField(afwateringMatch[1].trim()) : '',
      scharnierenKleur: (scharnierenKleurMatch ? cleanField(scharnierenKleurMatch[1].trim()) : '') || gealanSpec('Kleur scharnieren'),
      lakKleur: lakKleurMatch ? cleanField(lakKleurMatch[1].trim()) : '',
      sluitcilinder: (sluitcilinderMatch ? cleanField(sluitcilinderMatch[1].trim()) : '') || gealanSpec('Cilinder'),
      aantalSleutels: aantalSleutelsMatch ? cleanField(aantalSleutelsMatch[1].trim()) : '',
      gelijksluitend: gelijksluitendMatch ? cleanField(gelijksluitendMatch[1].trim()) : '',
      krukBinnen: (krukBinnenMatch ? cleanField(krukBinnenMatch[1].trim()) : '') || gealanSpec('Kruk binnen'),
      krukBuiten: (krukBuitenMatch ? cleanField(krukBuitenMatch[1].trim()) : '') || gealanSpec('Kruk buiten'),
    })
  }

  return elementen
}

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

    // Parse original PDF for element specs (no prices needed)
    const { parsePdfBuffer: pdfParse } = await import('@/lib/pdf-extract')
    const { data: pdfFile } = await supabaseAdmin.storage
      .from('documenten')
      .download(leverancierDoc.storage_path)

    let elementData: ParsedElement[] = []
    if (pdfFile) {
      const pdfBuffer = Buffer.from(await pdfFile.arrayBuffer())
      const parsed = await pdfParse(pdfBuffer)
      elementData = parseElementsFromText(parsed.text)
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

    for (const naam of elementOrder) {
      const pages = elementTekeningen.get(naam)!
      const matchingElement = elementData.find(e => e.naam === naam)

      const inkoopPrijs = matchingElement?.prijs || 0
      const margePerc = marges[naam] || 0
      const verkoopPrijs = inkoopPrijs * (1 + margePerc / 100)

      tekeningenElementen.push({
        naam: matchingElement?.naam || naam,
        hoeveelheid: matchingElement?.hoeveelheid || 1,
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
