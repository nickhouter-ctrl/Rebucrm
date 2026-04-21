// Shared PDF parsing utilities — used by both server actions and API routes

export interface KozijnElement {
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
  tekeningPath: string
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

export function parseLeverancierPdfText(text: string): { totaal: number; elementen: KozijnElement[] } {
  const cleanField = (val: string) => val.replace(/\s*Geen\s*[Gg]arantie!?\s*/gi, '').replace(/\s*No\s*warranty!?\s*/gi, '').trim()

  // Detect format - flexible whitespace to handle different PDF text extractors
  // Gealan uses "Merk 1" (numeric) or "Merk A" (letter) element names
  const isGealan = /Merk\s+[\dA-Z]+\s*Aantal\s*:\s*\d+/.test(text)
  const isKochs = !isGealan && /K-Vision\s+\d+/.test(text)
  const isEkoOkna = !isGealan && !isKochs && /Hoev\.\s*:\s*\d+/.test(text)

  // Extract totaal
  let totaal = 0
  if (isGealan) {
    const totaalMatch = text.match(/Netto\s*totaal[\s\n]*Totaal\s*([\d.,]+)/)
    if (totaalMatch) {
      totaal = parseFloat(totaalMatch[1].replace(/\./g, '').replace(',', '.'))
    }
  } else if (isKochs) {
    const totaalMatch = text.match(/Netto\s*Totaal\s*:\s*([\d.,]+)\s*EUR/)
    if (totaalMatch) {
      totaal = parseFloat(totaalMatch[1].replace(/\./g, '').replace(',', '.'))
    }
  } else if (isEkoOkna) {
    // Eko-Okna prices are always excl. BTW
    // Try multiple patterns for total extraction from Eko-Okna PDFs:
    // Pattern 1: "17 519,29 ETotaal" or "17 519,29 E Totaal" or "17 519,29 E\nTotaal"
    let totaalMatch = text.match(/([\d\s.,]+)\s*E\s*\n?\s*Totaal\b/)
    // Pattern 2: "Totaal 17 519,29 E" or "Totaal\n17 519,29 E"
    if (!totaalMatch) totaalMatch = text.match(/Totaal\s*\n?\s*([\d\s.,]+)\s*E(?:UR)?\b/i)
    // Pattern 3: "Totaal excl" or "Netto" followed by price
    if (!totaalMatch) totaalMatch = text.match(/(?:Totaal\s*(?:excl|netto)|Netto\s*(?:totaal|prijs))[^\n]*?([\d\s.,]+)\s*(?:E(?:UR)?)\b/i)
    // Pattern 4: "Totaal" with EUR currency
    if (!totaalMatch) totaalMatch = text.match(/([\d\s.,]+)\s*EUR\s*\n?\s*Totaal\b/)
    if (totaalMatch) {
      totaal = parseFloat(totaalMatch[1].replace(/\s/g, '').replace(/\./g, '').replace(',', '.'))
    }
  } else {
    const totaalMatch = text.match(/Prijs\s+TOT\.?\s*[\n\s]*€\s*([\d.,]+)/)
    if (totaalMatch) {
      totaal = parseFloat(totaalMatch[1].replace(/\./g, '').replace(',', '.'))
    }
  }

  // Extract Kochs TZ surcharge multiplier (applied to all element prices)
  let kochsTzMultiplier = 1
  if (isKochs) {
    const tzMatch = text.match(/TZ\b[\s\S]{0,50}?([\d.,]+)\s*%/)
    if (tzMatch) kochsTzMultiplier = 1 + parseFloat(tzMatch[1].replace(',', '.')) / 100
  }

  // Find element headers (name, hoeveelheid, systeem, kleur)
  const headers: { naam: string; hoeveelheid: number; systeem: string; kleur: string; idx: number; endIdx: number }[] = []
  let match
  if (isGealan) {
    const elementPattern = /Merk\s+([\dA-Z]+)\s*Aantal\s*:\s*(\d+)(?:\s*Verbinding\s*:\s*\w+)?\s*Systeem\s*:\s*([^\n]+(?:\n[^\n]+)?)/g
    while ((match = elementPattern.exec(text)) !== null) {
      // Find next Merk header to determine section boundary
      const nextMerkPattern = /Merk\s+[\dA-Z]+\s*Aantal\s*:/g
      nextMerkPattern.lastIndex = match.index + match[0].length
      const nextMerkMatch = nextMerkPattern.exec(text)
      const sectionEnd = nextMerkMatch ? nextMerkMatch.index : text.length
      const section = text.substring(match.index, sectionEnd)
      const kleurMatch = section.match(/Kader\s+([^\n]+)/)
      headers.push({
        naam: 'Merk ' + match[1],
        hoeveelheid: parseInt(match[2]),
        systeem: match[3].trim().replace(/\n/g, ' '),
        kleur: kleurMatch ? kleurMatch[1].trim() : '',
        idx: match.index,
        endIdx: match.index + match[0].length,
      })
    }
  } else if (isKochs) {
    // K-Vision PDF format (from actual text extraction):
    // "001 Kozijnmerk D\nBinnenzicht\nSysteem : K-Vision 120\nAfmeting : 1500 x 1200 mm\n1\n"
    // Position number + description on SAME line, hoeveelheid AFTER Afmeting line
    const elementPattern = /^(\d{3})\s+[^\n]+\n[\s\S]{0,300}?Systeem\s*:\s*([^\n]+)\nAfmeting(?:en)?\s*:\s*(\d+)\s*x\s*(\d+)\s*mm\n(\d+)\n/gm
    while ((match = elementPattern.exec(text)) !== null) {
      const hoeveelheid = parseInt(match[5]) || 1

      // Find next element to determine section boundary
      const nextPattern = /^\d{3}\s+[^\n]+\n[\s\S]{0,300}?Systeem\s*:/gm
      nextPattern.lastIndex = match.index + match[0].length
      const nextPosMatch = nextPattern.exec(text)
      const sectionEnd = nextPosMatch ? nextPosMatch.index : text.length
      const section = text.substring(match.index, sectionEnd)
      const kleurMatch = section.match(/Buiten\s+([^\n]+(?:\n[^\n]*glad[^\n]*)?)/)
      headers.push({
        naam: 'Positie ' + match[1],
        hoeveelheid,
        systeem: match[2].trim(),
        kleur: kleurMatch ? kleurMatch[1].replace(/\n/g, ' ').trim() : '',
        idx: match.index,
        endIdx: match.index + match[0].length,
      })
    }
  } else if (isEkoOkna) {
    const elementPattern = /((?:Gekoppeld\s+)?[Ee]lement\s+\d{3}(?:\/\d+)?)\s*Hoev\.\s*:\s*(\d+)\s*Kleur\s*:\s*([\s\S]*?)Systeem\s*:\s*([^\n]+)/g
    while ((match = elementPattern.exec(text)) !== null) {
      headers.push({
        naam: match[1].trim(),
        hoeveelheid: parseInt(match[2]),
        systeem: match[4].trim(),
        kleur: match[3].trim(),
        idx: match.index,
        endIdx: match.index + match[0].length,
      })
    }
  } else {
    const elementPattern = /((?:Deur|Element)\s+\d{3})[\s\n]+Hoeveelheid\s*:[\s\n]*(\d+)[\s\n]+Systeem\s*:\s*([\s\S]+?)Kleur\s*:\s*([^\n]+)/g
    while ((match = elementPattern.exec(text)) !== null) {
      headers.push({
        naam: match[1],
        hoeveelheid: parseInt(match[2]),
        systeem: match[3].trim(),
        kleur: match[4].trim(),
        idx: match.index,
        endIdx: match.index + match[0].length,
      })
    }
  }

  // Find all Buitenaanzicht positions (only for original format where specs appear BEFORE each header)
  const allBuitenPositions: number[] = []
  const specsPositions: number[] = []
  if (!isEkoOkna && !isGealan && !isKochs) {
    const buitenPattern = /Buitenaanzicht\n/g
    while ((match = buitenPattern.exec(text)) !== null) {
      allBuitenPositions.push(match.index)
    }
    for (let i = 0; i < headers.length; i++) {
      const prevHeaderEnd = i > 0 ? headers[i - 1].endIdx : 0
      const candidates = allBuitenPositions.filter(pos => pos > prevHeaderEnd && pos < headers[i].idx)
      specsPositions.push(candidates.length > 0 ? candidates[candidates.length - 1] : -1)
    }
  }

  // Extract ALL price lines in order (only for original format; Eko-Okna uses only totaal)
  const allPrices: number[] = []
  if (!isEkoOkna && !isGealan && !isKochs) {
    const pricePattern = /^(?:Deur|Element)\s*(?:(\d+)\s*x\s*€\s*([\d.,]+))?€\s*([\d.,]+)/gm
    let priceMatch
    while ((priceMatch = pricePattern.exec(text)) !== null) {
      const prijsStr = priceMatch[2] || priceMatch[3]
      allPrices.push(parseFloat(prijsStr.replace(/\./g, '').replace(',', '.')))
    }
  }

  const elementen: KozijnElement[] = []

  for (let i = 0; i < headers.length; i++) {
    const header = headers[i]

    let specsText: string
    let notesText: string
    let searchText: string

    if (isGealan) {
      // In Gealan, all specs come AFTER the header (like Eko-Okna)
      const nextIdx = i + 1 < headers.length ? headers[i + 1].idx : text.length
      searchText = text.substring(header.endIdx, nextIdx)
      specsText = searchText
      notesText = searchText
    } else if (isKochs) {
      const nextIdx = i + 1 < headers.length ? headers[i + 1].idx : text.length
      searchText = text.substring(header.endIdx, nextIdx)
      specsText = searchText
      notesText = searchText
    } else if (isEkoOkna) {
      // In Eko-Okna, all specs come AFTER the header (not before)
      const nextIdx = i + 1 < headers.length ? headers[i + 1].idx : text.length
      searchText = text.substring(header.endIdx, nextIdx)
      specsText = searchText
      notesText = searchText
    } else {
      // Original format: specs before header, notes after header
      specsText = specsPositions[i] >= 0
        ? text.substring(specsPositions[i], header.idx)
        : ''
      let notesEnd: number
      if (i + 1 < headers.length) {
        notesEnd = specsPositions[i + 1] >= 0 ? specsPositions[i + 1] : headers[i + 1].idx
      } else {
        notesEnd = text.length
      }
      notesText = text.substring(header.endIdx, notesEnd)
      searchText = specsText + '\n' + notesText
    }

    // --- Prijs ---
    let prijs = 0
    if (isGealan) {
      const gealanPriceMatch = searchText.match(/Netto\s*prijs[\s\n]+\w+?\s*([\d.,]+)/)
      if (gealanPriceMatch) {
        prijs = parseFloat(gealanPriceMatch[1].replace(/\./g, '').replace(',', '.'))
      }
    } else if (isKochs) {
      // K-Vision price format (from actual PDF text extraction):
      // "464,49 €464,49 €1Totaal elementen :."  (unit €, total €, hvh, then "Totaal elementen")
      // "77,16 €38,58 €2Totaal elementen :."    (total=77.16, unit=38.58, hvh=2)
      // Price is BEFORE "Totaal elementen", format: TOTAL €UNIT €HVHTotaal elementen
      const totaalElementenMatch = searchText.match(/([\d.,]+)\s*€([\d.,]+)\s*€(\d+)Totaal\s*elementen/)
      if (totaalElementenMatch) {
        const totalPrice = parseFloat(totaalElementenMatch[1].replace(/\./g, '').replace(',', '.'))
        const unitPrice = parseFloat(totaalElementenMatch[2].replace(/\./g, '').replace(',', '.'))
        // Use unit price (the smaller one), apply TZ surcharge
        prijs = Math.round(Math.min(totalPrice, unitPrice) * kochsTzMultiplier * 100) / 100
      } else {
        // Fallback: look for prices with € or EUR
        const sectionPrices = [...searchText.matchAll(/([\d.]+,\d{2})\s*(?:€|EUR)/g)]
          .map(m => parseFloat(m[1].replace(/\./g, '').replace(',', '.')))
          .filter(p => p > 0)
        if (sectionPrices.length >= 2) {
          prijs = Math.round(Math.min(...sectionPrices) * kochsTzMultiplier * 100) / 100
        } else if (sectionPrices.length === 1) {
          prijs = Math.round((sectionPrices[0] / header.hoeveelheid) * kochsTzMultiplier * 100) / 100
        }
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

    // --- Type & drapirichting from Vleugel description ---
    let drapirichting = ''
    let type = header.naam.startsWith('Deur') ? 'Deur' :
               header.naam.toLowerCase().startsWith('gekoppeld') ? 'Koppelelement' : 'Raam'

    if (isKochs) {
      const beslagEntries = searchText.match(/Beslag\s+([^\n]+)/gi) || []
      const hasDraaikiep = beslagEntries.some(b => /Draaikiep/i.test(b))
      const hasVast = beslagEntries.some(b => /Vast/i.test(b))
      if (hasDraaikiep) type = 'Draai-kiep raam'
      else if (hasVast) type = 'Vast raam'
    } else if (isGealan) {
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
      // Check ALL vleugels — door/terras types take priority over Vast raam
      let allVast = true
      for (const desc of vleugelMatches) {
        if (/deur\s+vleugel\s+naar\s+binnen\s+opendraaiend/i.test(desc)) {
          drapirichting = 'Naar binnen draaiend'
          type = 'Deur'
        } else if (/deur\s+vleugel\s+naar\s+buiten\s+opendraaiend/i.test(desc)) {
          drapirichting = 'Naar buiten draaiend'
          type = 'Deur'
        } else if (/terras\s+vleugel\s+naar\s+binnen\s+opendraaiend/i.test(desc)) {
          drapirichting = 'Naar binnen draaiend'
          type = 'Terrasraam'
        } else if (/terras\s+vleugel\s+naar\s+buiten\s+opendraaiend/i.test(desc)) {
          drapirichting = 'Naar buiten draaiend'
          type = 'Terrasraam'
        } else if (/vleugel\s+RECHT/i.test(desc)) {
          allVast = false
        } else if (!/Vast\s+raam/i.test(desc)) {
          allVast = false
        }
      }
      // Only set Vast raam if ALL vleugels are vast and no door/terras was found
      if (type !== 'Deur' && type !== 'Terrasraam' && allVast) {
        type = 'Vast raam'
      }
    }

    // Refine type with beslag info
    const beslagMatch = specsText.match(/Beslag\s*([A-Z][^\n]+)/)
    const beslagRaw = beslagMatch ? beslagMatch[1].trim() : ''
    const gealanBeslagMatch = isGealan ? searchText.match(/Raamkruk\s*\n\s*\n([^\n]+)/i) : null
    let beslag = cleanField(beslagRaw || (gealanBeslagMatch ? gealanBeslagMatch[1].trim() : ''))
    if (isKochs) {
      const allBeslag = [...searchText.matchAll(/Beslag\s+([^\n]+)/gi)].map(m => m[1].trim())
      beslag = cleanField([...new Set(allBeslag)].join(' + '))
    }

    if (/Draai-kiep|Draai\s*-\s*kiep|Tilt\s*&\s*Turn/i.test(beslag)) {
      if (type === 'Raam') type = 'Draai-kiep raam'
    } else if (/Draai\s*\+\s*Draai\s*-?\s*kiep/i.test(beslag)) {
      if (type === 'Raam') type = 'Draai + draai-kiep raam'
    } else if (/Draai\s*\+\s*Draai\s*-?\s*deur/i.test(beslag)) {
      if (drapirichting) type = 'Dubbele deur'
    } else if (/deur\s*beslag/i.test(beslag)) {
      if (!type.includes('Deur') && !type.includes('deur')) type = 'Deur'
    }

    // Add stulp info from specs text
    if (/STULP/i.test(specsText) && !type.includes('Dubbele')) {
      type = type + ' (stulp)'
    }

    // --- Afmetingen ---
    const afmMatch = searchText.match(/Afmetingen[\s\S]{0,30}?(\d+\s*mm\s*x\s*\d+\s*mm)/) ||
                     searchText.match(/Afmeting\s*:\s*(\d+\s*x\s*\d+\s*mm)/)
    const afmetingen = afmMatch ? afmMatch[1] : ''

    // Detect HST / schuifpui from system name or combined text
    if (/HST|hef.*schui|\bschuif/i.test(header.systeem) || /HST|hef.*schui|\bschuif/i.test(searchText)) {
      type = 'Schuifpui'
    }

    // --- Glass types from Vullingen section (correct per element) ---
    // Step 1: Try Vullingen in specsText, fallback to notesText
    const vulSpec = specsText.match(/(?:Vullingen|Glazing used)\s*\n?Afmetingen\n([\s\S]*?)(?=Prijs\b|$)/)
    const vulNotes = !vulSpec ? notesText.match(/(?:Vullingen|Glazing used)\s*\n?Afmetingen\n([\s\S]*?)(?=Prijs\b|$)/) : null
    const vullingenMatch = vulSpec || vulNotes
    let glasType = ''
    if (vullingenMatch) {
      const glasTypes: string[] = []
      const glasPattern = /\d+\.\d+\n([^\n]+\[Ug=[\d.,]+\][^\n]*)/g
      let glasMatch2
      while ((glasMatch2 = glasPattern.exec(vullingenMatch[1])) !== null) {
        let glasStr = glasMatch2[1].trim()
        const ugIdx = glasStr.indexOf(' Zontoetredingsfactor')
        if (ugIdx > 0) glasStr = glasStr.substring(0, ugIdx).trim()
        if (!glasTypes.includes(glasStr)) glasTypes.push(glasStr)
      }
      glasType = cleanField(glasTypes.join(' / '))
    }
    // Step 2: Fallback — collect ALL Gevraagd glas entries (multiple per element possible)
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
    // Step 3: Eko-Okna fallback — extract from "Glazing used" glass spec pattern
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
    // Step 4: Gealan fallback — extract from "Beglazingen & panelen" section
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
    if (isKochs && !glasType) {
      const kochsGlasMatch = searchText.match(/(WS\s+[^\n]+?Ug[\d,]+)/i)
      if (kochsGlasMatch) glasType = cleanField(kochsGlasMatch[1])
    }

    // --- Specs fields ---
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
    const krukBinnenMatch = searchText.match(/Kleur\s*kruk\s*binnen\s*([^\n]+)/i) || searchText.match(/kruk\/trekker\/cilinderplaatje\nbinnen\n([^\n]+)/i) || searchText.match(/Kruk binnen\s*\n\s*\n([^\n]+)/i) || searchText.match(/Raamgreep\s+binnen\s+([^\n]+)/i)
    const krukBuitenMatch = searchText.match(/Kleur\s*kruk\s*buiten\s*([^\n]+)/i) || searchText.match(/kruk\/trekker\/cilinderplaatje\nbuiten\n([^\n]+)/i) || searchText.match(/Kruk buiten\s*\n\s*\n([^\n]+)/i)

    // --- Commentaar ---
    const commentaarMatch = notesText.match(/Commentaar(?:\s+op het product)?\n([^\n]+)/)
    const commentaar = commentaarMatch ? cleanField(commentaarMatch[1].trim()) : ''

    elementen.push({
      naam: header.naam,
      hoeveelheid: header.hoeveelheid,
      systeem: cleanField(header.systeem),
      kleur: cleanField(header.kleur),
      afmetingen,
      type,
      prijs,
      glasType,
      beslag,
      uwWaarde: uwMatch ? cleanField(uwMatch[1].trim()) : '',
      drapirichting,
      dorpel: (dorpelMatch ? cleanField(dorpelMatch[1].trim()) : '') || gealanSpec('Dorpel'),
      sluiting: (sluitingMatch ? cleanField(sluitingMatch[1].trim()) : '') || gealanSpec('Slot'),
      scharnieren: (scharnierenMatch ? cleanField(scharnierenMatch[1].trim()) : '') || gealanSpec('Uitv\\. scharnieren'),
      gewicht: gewichtMatch ? gewichtMatch[1].trim() : '',
      omtrek: omtrekMatch ? omtrekMatch[1].trim() : '',
      paneel: paneelMatch ? cleanField(paneelMatch[1].trim()) : '',
      commentaar,
      tekeningPath: '',
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

  // Vangnet: als element-som significant afwijkt van PDF totaal, schaal prijzen proportioneel
  if (totaal > 0 && elementen.length > 0) {
    const elementSum = elementen.reduce((sum, e) => sum + e.prijs * e.hoeveelheid, 0)
    if (elementSum > 0 && Math.abs(elementSum - totaal) / totaal > 0.05) {
      const factor = totaal / elementSum
      for (const e of elementen) {
        e.prijs = Math.round(e.prijs * factor * 100) / 100
      }
    }
  }

  return { totaal, elementen }
}
