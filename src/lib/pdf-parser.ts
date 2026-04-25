// Shared PDF parsing utilities — used by both server actions and API routes

// Leverancier-hint: als bekend, skipt de parser autodetect en gebruikt direct
// het juiste regex-pad. Voorkomt mis-detectie bij PDF's die qua tekst-extractie
// op meerdere leveranciers lijken (vooral Schüco-encoded vs Gealan).
export type LeverancierKey = 'eko-okna' | 'schuco' | 'gealan' | 'gealan-nl' | 'kochs' | 'aluplast' | 'reynaers' | 'default'

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

export function parseLeverancierPdfText(text: string, hint?: LeverancierKey): { totaal: number; elementen: KozijnElement[] } {
  const cleanField = (val: string) => val.replace(/\s*Geen\s*[Gg]arantie!?\s*/gi, '').replace(/\s*No\s*warranty!?\s*/gi, '').trim()

  // Schüco PDF-fonts worden soms door pdfjs niet correct gedecoded — elke
  // letter is shift -28 van ASCII ('M'→'1', 'e'→'I', 'r'→'V', enz.) en er
  // zitten onzichtbare control-chars tussen (- etc). Eerst die
  // strippen, dan detecteren via "1IVO" (encoded "Merk") en shift toepassen.
  text = text.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '')
  if (/1IVO\s*[%&'()*]/.test(text) && !/Merk\s+[A-Z]\s+Aantal/i.test(text)) {
    // Schüco-offertes hebben een mix van encoded (shift -28) headers en
    // normale ASCII specs. Universeel shiften breekt de normale delen, dus
    // we vervangen alleen de bekende encoded labels per-string.
    const repl: [string | RegExp, string][] = [
      ['4VSHYGXMIQEXIR', 'Productie maten'],
      ['1IVO', 'Merk'],
      ['%ERXEPWXYOW', 'Aantal stuks'],
      [':IVFMRHMRK', 'Verbinding'],
      ['7]WXIIQ', 'Systeem'],
      [/7GL[¿ü]GS/g, 'Schüco'],
      ['7PMHI', 'Slide'],
      [':IVHMITXs', 'Verdiept 15°'],
      [':IVHMITX', 'Verdiept'],
      ['&IWGLVMNZMRK', 'Beschrijving'],
      ['/PIYV', 'Kleur'],
      ['2IXXS', 'Netto'],
      ['TVMNW', 'prijs'],
      ['XSXEEP', 'totaal'],
      ['&VYXSTV', 'Brutopr'],
      ['/SVXMRK', 'Korting'],
      ['6EEQ', 'Raam'],
      ['8SXEEP', 'Totaal'],
    ]
    for (const [from, to] of repl) {
      if (typeof from === 'string') text = text.split(from).join(to)
      else text = text.replace(from, to)
    }
    // Merk-letter kan direct aan 'Merk' geplakt zijn (geen spatie) — A=%, B=&, enz.
    text = text.replace(/Merk\s*([%&'()*+,\-./])/g, (_, ch) => 'Merk ' + String.fromCharCode(ch.charCodeAt(0) + 28))
    // Spatie tussen 'Systeem' en 'Schüco' herstellen voor regex-match
    text = text.replace(/Systeem([A-Z])/g, 'Systeem: $1')
    // Lossen 'Aantal stuks' zonder getal op: plaats ':1' zodat bestaande
    // Schüco pattern matcht (Schüco-PDF toont aantal zelden, vrijwel altijd 1).
    text = text.replace(/(Merk\s+[A-Z])\s+Aantal\s+stuks(?!\s*:)/g, '$1 Aantal stuks:1')
  }

  // Detect format - flexible whitespace to handle different PDF text extractors
  // Belangrijk: Aluplast/Deur-Element format (originele) eerst testen. Gealan-detectie
  // was te breed en ving ook Aluplast PDFs waar 'Merk A Aantal: 1' toevallig voorkomt.
  // Hint heeft voorrang: als de aanroeper (of AI) zeker weet welke leverancier het is,
  // skippen we autodetect en gebruiken we direct het juiste pad.
  const useAluplast = hint === 'aluplast'
  const useGealanNL = hint === 'gealan-nl'
  const useGealan = hint === 'gealan'
  const useSchuco = hint === 'schuco'
  const useKochs = hint === 'kochs'
  const useEkoOkna = hint === 'eko-okna'
  const useDefault = hint === 'default' || hint === 'reynaers'
  const hasHint = !!hint

  const isAluplast = hasHint ? useAluplast : /(?:Deur|Element)\s+\d{3}[\s\n]+Hoeveelheid\s*:/i.test(text)
  const isGealanNL = hasHint ? useGealanNL : (!isAluplast && /Productie\s+maten/i.test(text) && /Netto\s*prijs/i.test(text) && /Aantal\s*:\s*\d+\s+Verbinding\s*:/i.test(text) && !/Merk\s+[\dA-Z]+\s*Aantal/.test(text))
  const isGealan = hasHint ? useGealan : (!isAluplast && !isGealanNL && /Merk\s+[\dA-Z]+\s*Aantal\s*:\s*\d+/.test(text) && /Netto\s*totaal/i.test(text) && !/Merk\s+[A-Z]\s*Aantal\s*stuks/i.test(text))
  const isSchuco = hasHint ? useSchuco : (!isAluplast && !isGealanNL && !isGealan && (
    /Merk\s+[A-Z]\s*Aantal\s*stuks\s*:\s*\d+/i.test(text) ||
    /Sch[üu¿\s][cCG][oO]\s+(?:Slide|Verdiept)/i.test(text)
  ))
  const isKochs = hasHint ? useKochs : (!isGealan && !isGealanNL && !isSchuco && !isAluplast && (/K-Vision\s+\d+/.test(text) || /KOCHS|Primus\s*MD|Premidoor\s*\d+/i.test(text)))
  const isEkoOkna = hasHint ? useEkoOkna : (!isGealan && !isGealanNL && !isKochs && !isSchuco && !isAluplast && /Hoev\.\s*:\s*\d+/.test(text))
  // useDefault valt vanzelf in de else-branch onderin
  void useDefault

  // Extract totaal
  let totaal = 0
  if (isGealanNL) {
    // Zelfde "Netto totaal\nTotaal X.XXX,XX" patroon als oude Gealan
    const totaalMatch = text.match(/Netto\s*totaal[\s\n]*Totaal\s+([\d.,]+)/)
    if (totaalMatch) {
      totaal = parseFloat(totaalMatch[1].replace(/\./g, '').replace(',', '.'))
    }
  } else if (isGealan) {
    const totaalMatch = text.match(/Netto\s*totaal[\s\n]*Totaal\s*([\d.,]+)/)
    if (totaalMatch) {
      totaal = parseFloat(totaalMatch[1].replace(/\./g, '').replace(',', '.'))
    }
  } else if (isSchuco) {
    // Schüco netto totaal (excl BTW): "Netto totaal 7.510,44" op laatste
    // pagina, OF "Totaal 7.510,44" boven "Korting". We willen nooit de
    // BTW-inclusieve "Totaal BTW inb." regel.
    const m1 = text.match(/Netto\s*totaal[\s\n]*([\d.,]+)/i)
    const m2 = !m1 ? text.match(/Totaal\s+([\d.,]+)[\s\n]+Korting/i) : null
    const totaalMatch = m1 || m2
    if (totaalMatch) {
      totaal = parseFloat(totaalMatch[1].replace(/\./g, '').replace(',', '.'))
    }
  } else if (isKochs) {
    // Kochs Primus MD / Premidoor: de regel "Totaal offerte/order" is EXCL de
    // TZ-toeslag (doorgaans 32%, leveranciersmarge — geen BTW). Onder deze
    // regel komt "Netto Totaal" waar de TZ al bij opgeteld is. Dat is de
    // échte inkoopprijs. Eerst Netto/Eind totaal proberen, dan pas de lagere
    // Totaal offerte/order regel als fallback.
    const totaalMatch = text.match(/Eind\s*totaal\s*:\s*([\d.,]+)\s*EUR/i)
      || text.match(/Netto\s*Totaal\s*:\s*([\d.,]+)\s*EUR/i)
      || text.match(/Totaal\s*offerte\/order\s*:\s*([\d.,]+)\s*EUR/i)
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
  if (isGealanNL) {
    // Element header format: "<Naam (mogelijk multi-line)>\nAantal:N Verbinding:XX Systeem: Gealan\nS9000NL (Basis|Hef-schuif)"
    // Begin altijd na "Productie maten\n".
    const elementPattern = /Productie\s+maten\s*\n([\s\S]*?)Aantal\s*:\s*(\d+)\s+Verbinding\s*:\s*(\w+)\s+Systeem\s*:\s*([^\n]+(?:\n[^\n]+)?)/g
    while ((match = elementPattern.exec(text)) !== null) {
      const nextPattern = /Productie\s+maten\s*\n[\s\S]*?Aantal\s*:\s*\d+\s+Verbinding\s*:/g
      nextPattern.lastIndex = match.index + match[0].length
      const nextMatch = nextPattern.exec(text)
      const sectionEnd = nextMatch ? nextMatch.index : text.length
      const section = text.substring(match.index, sectionEnd)
      // Kleur: "Kader <profiel> <RAL_buiten> <omschr_buiten> <RAL_binnen> <omschr_binnen>"
      const kleurLine = section.match(/Kader\s+([^\n]+)/)
      let kleur = ''
      if (kleurLine) {
        const kl = kleurLine[1].trim()
        const ralMatch = kl.match(/(\d{4}\s+[^\d][^\n]*?)\s+(\d{4}\s+[^\n]+)$/)
        if (ralMatch) {
          kleur = `${ralMatch[1].trim()} / ${ralMatch[2].trim()}`
        } else {
          kleur = kl
        }
      }
      const rawName = match[1].replace(/\n/g, ' ').replace(/\s+/g, ' ').trim()
      headers.push({
        naam: rawName,
        hoeveelheid: parseInt(match[2]),
        systeem: ('Gealan ' + match[4].replace(/^Gealan\s*/i, '')).trim().replace(/\n/g, ' ').replace(/\s+/g, ' '),
        kleur,
        idx: match.index,
        endIdx: match.index + match[0].length,
      })
    }
  } else if (isGealan) {
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
  } else if (isSchuco) {
    // Schüco header: "Merk A Aantal stuks:1 Verbinding: :45 Systeem: Schüco Slide"
    // Systeem-naam kan over meerdere regels breken (bv. "Schüco\nVerdiept 15°").
    // Encoding tolerance: "Sch¿co" of "Schüco" beide toegestaan.
    // Schüco-decoder heeft soms geen getal voor 'Aantal stuks' en geen colons.
    // Patroon is flexibel: Merk-letter, Aantal stuks (optionele :N), Verbinding
    // (tot iets dat lijkt op Systeem), dan Systeem-naam tot EOL.
    const elementPattern = /Merk\s+([A-Z])\s+Aantal\s*stuks\s*:?\s*(\d*)[\s\S]{0,40}?Systeem\s*:?\s*([^\n]+(?:\n(?!Merk|Productie)[^\n]+)?)/gi
    while ((match = elementPattern.exec(text)) !== null) {
      const nextPat = /Merk\s+[A-Z]\s+Aantal\s*stuks/gi
      nextPat.lastIndex = match.index + match[0].length
      const next = nextPat.exec(text)
      const sectionEnd = next ? next.index : text.length
      const section = text.substring(match.index, sectionEnd)
      const kleurMatch = section.match(/Kader[\s\S]{0,200}?(\d{4}\s*GLAD|\d{4}\s*\w+)/i)
      // Systeem-naam is altijd een van de bekende Schüco varianten — extraheer
      // gericht zodat encoded residu (%%2>-',8&9-8 = 'AANZICHT: BUITEN') niet
      // meekomt.
      let systeem = 'Schüco'
      const sysSlide = /Schüco\s*Slide/i.exec(match[3])
      const sysVerdiept = /Schüco[\s\S]{0,20}?Verdiept\s*(\d+°)?/i.exec(match[3])
      if (sysSlide) systeem = 'Schüco Slide'
      else if (sysVerdiept) systeem = 'Schüco Verdiept' + (sysVerdiept[1] ? ' ' + sysVerdiept[1] : '')
      headers.push({
        naam: 'Merk ' + match[1].toUpperCase(),
        hoeveelheid: parseInt(match[2]) || 1,
        systeem,
        kleur: kleurMatch ? kleurMatch[1].trim() : '',
        idx: match.index,
        endIdx: match.index + match[0].length,
      })
    }
  } else if (isKochs) {
    // Kochs K-Vision OF Primus MD:
    //   K-Vision: "001 Kozijnmerk D\nBinnenzicht\nSysteem : K-Vision 120\nAfmeting : 1500 x 1200 mm\n1\n"
    //   Primus MD: "001 \nBinnenzicht\n Systeem : Premidoor 76\nAfmeting : 2600 x 2450 mm\n1\n"
    // Het verschil: Primus MD heeft geen omschrijving op de "001"-regel en soms een leading space voor "Systeem".
    const elementPattern = /(?:^|\n)\s*(\d{3})(?:\s+[^\n]*)?\n[\s\S]{0,400}?Systeem\s*:\s*([^\n]+)\n[\s\S]{0,100}?Afmeting(?:en)?\s*:\s*(\d+)\s*x\s*(\d+)\s*mm\n\s*(\d+)\n/g
    while ((match = elementPattern.exec(text)) !== null) {
      const hoeveelheid = parseInt(match[5]) || 1

      // Find next element to determine section boundary
      const nextPattern = /(?:^|\n)\s*\d{3}(?:\s+[^\n]*)?\n[\s\S]{0,400}?Systeem\s*:/g
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
    // Vind element-headers: "Element NNN" / "Deur NNN" / "Gekoppeld Element NNN".
    // Accepteer match ongeacht begin-of-line (sommige PDF-extractors strippen
    // newlines), maar valideer binnen 80 chars dat "Hoev." of "Systeem" volgt —
    // dat is het signaal voor een echte element-header. Filtert losse tekstuele
    // verwijzingen als "element 557" in "Prijs van het element 557,80 E".
    const headerPattern = /((?:Gekoppeld\s+)?(?:Element|ELEMENT|Deur|DEUR)\s+(\d{3})(?:\/\d+)?)\b/g
    const headerMatches: { naam: string; idx: number }[] = []
    let hm
    while ((hm = headerPattern.exec(text)) !== null) {
      const absIdx = hm.index
      const immediate = text.substring(absIdx, absIdx + 80)
      const hasFields = /Hoev\.\s*:\s*\d|Systeem\s*:/i.test(immediate)
      if (!hasFields) continue
      if (headerMatches.some(x => Math.abs(x.idx - absIdx) < 50)) continue
      headerMatches.push({ naam: hm[1].trim(), idx: absIdx })
    }
    for (let i = 0; i < headerMatches.length; i++) {
      const h = headerMatches[i]
      const sectionEnd = i + 1 < headerMatches.length ? headerMatches[i + 1].idx : text.length
      const section = text.substring(h.idx, sectionEnd)
      const hoevMatch = section.match(/Hoev\.\s*:\s*(\d+)/)
      const kleurMatch = section.match(/Kleur\s*:\s*([\s\S]*?)(?:Systeem\s*:|Afmeting|\n\n)/)
      const systeemMatch = section.match(/Systeem\s*:\s*([^\n]+)/)
      headers.push({
        naam: h.naam,
        hoeveelheid: hoevMatch ? parseInt(hoevMatch[1]) : 1,
        systeem: systeemMatch ? systeemMatch[1].trim() : '',
        kleur: kleurMatch ? kleurMatch[1].trim() : '',
        idx: h.idx,
        endIdx: h.idx + h.naam.length,
      })
    }
  } else {
    // Flexibele fallback: vind element-headers aan begin van regel, met
    // validatie dat er echt element-velden in de sectie staan.
    const headerPattern = /(?:^|\n)[\t ]*((?:Deur|Element|DEUR|ELEMENT)\s+\d{3})(?=\s)/g
    const headerMatches: { naam: string; idx: number }[] = []
    let hm
    while ((hm = headerPattern.exec(text)) !== null) {
      const offset = hm[0].indexOf(hm[1])
      const absIdx = hm.index + offset
      const lookahead = text.substring(absIdx, absIdx + 1500)
      const hasFields = /Hoeveelheid\s*:|Systeem\s*:|Buitenkader|Aluprof/.test(lookahead)
      if (!hasFields) continue
      if (headerMatches.some(x => Math.abs(x.idx - absIdx) < 50)) continue
      headerMatches.push({ naam: hm[1].trim(), idx: absIdx })
    }
    for (let i = 0; i < headerMatches.length; i++) {
      const h = headerMatches[i]
      const sectionEnd = i + 1 < headerMatches.length ? headerMatches[i + 1].idx : text.length
      const section = text.substring(h.idx, sectionEnd)
      const hoevMatch = section.match(/Hoeveelheid\s*:[\s\n]*(\d+)/)
      const systeemMatch = section.match(/Systeem\s*:\s*([^\n]+)/)
      const kleurMatch = section.match(/Kleur\s*:\s*([^\n]+)/)
      headers.push({
        naam: h.naam,
        hoeveelheid: hoevMatch ? parseInt(hoevMatch[1]) : 1,
        systeem: systeemMatch ? systeemMatch[1].trim() : '',
        kleur: kleurMatch ? kleurMatch[1].trim() : '',
        idx: h.idx,
        endIdx: h.idx + h.naam.length,
      })
    }
  }

  // Find all Buitenaanzicht positions (only for original format where specs appear BEFORE each header)
  const allBuitenPositions: number[] = []
  const specsPositions: number[] = []
  if (!isEkoOkna && !isGealan && !isGealanNL && !isKochs) {
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
  if (!isEkoOkna && !isGealan && !isGealanNL && !isKochs) {
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

    if (isGealan || isGealanNL || isSchuco) {
      // Specs komen AFTER de header (zelfde als Gealan)
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
    if (isGealanNL) {
      // "Netto prijs\nRaam <unit>\nTotaal <aantal*unit>" — Raam = per-stuk prijs
      const gnlPriceMatch = searchText.match(/Netto\s*prijs\s*\n\s*Raam\s+([\d.,]+)/i)
      if (gnlPriceMatch) {
        prijs = parseFloat(gnlPriceMatch[1].replace(/\./g, '').replace(',', '.'))
      }
    } else if (isGealan) {
      const gealanPriceMatch = searchText.match(/Netto\s*prijs[\s\n]+\w+?\s*([\d.,]+)/)
      if (gealanPriceMatch) {
        prijs = parseFloat(gealanPriceMatch[1].replace(/\./g, '').replace(',', '.'))
      }
    } else if (isSchuco) {
      // Schüco prijs-tabel per element:
      //   Brutopr.  Korting   Netto prijs
      //   Raam  4.165,92  0,00%  0,00
      //                                4.165,92
      //   Totaal  4.165,92  4.165,92
      // In de tekst wordt "Raam" gevolgd door: bruto, korting%, korting€, netto.
      // Het laatste getal is per-stuk netto prijs.
      const m = searchText.match(/Raam[\s\n]+([\d.,]+)[\s\n]+[\d.,]+\s*%[\s\n]+[\d.,]+[\s\n]+([\d.,]+)/)
      if (m) {
        prijs = parseFloat(m[2].replace(/\./g, '').replace(',', '.'))
      } else {
        // Fallback: zoek "Totaal <x> <x>" waar beide getallen gelijk zijn
        const tm = searchText.match(/Totaal[\s\n]+([\d.,]+)[\s\n]+([\d.,]+)/)
        if (tm) prijs = parseFloat(tm[2].replace(/\./g, '').replace(',', '.'))
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
      // Prijs kan op meerdere manieren staan. Flexibele patronen met
      // optionele whitespace/newlines tussen label en getal:
      const patterns = [
        /Prijs\s+van\s+het\s+element[\s\n]*\d+\s*x\s*([\d\s.]+,\d{2})/i,
        /Prijs\s+van\s+het\s+element[\s\n]*([\d\s.]+,\d{2})/i,
        /Deurprijs[\s\n]*([\d\s.]+[.,]\d{2})/i,
        /Prijs\s+gekoppeld\s+element[\s\n]*([\d\s.]+[.,]\d{2})/i,
      ]
      let ekoPriceMatch: RegExpMatchArray | null = null
      for (const p of patterns) {
        const m = searchText.match(p)
        if (m) { ekoPriceMatch = m; break }
      }
      // Laatste redmiddel: pak het GROOTSTE bedrag in de sectie met formaat
      // "X,XX E" of "X.XXX,XX E" — dit is vrijwel altijd de element-prijs
      // omdat kleinere getallen afmetingen/gewicht zijn en "Prijs op aanvraag"
      // niet matcht. Beperk tot bedragen > 30 om false positives uit te sluiten.
      if (!ekoPriceMatch) {
        const allPriceMatches = [...searchText.matchAll(/([\d][\d\s.]*,\d{2})\s*E\b/g)]
        let maxPrijs = 0
        for (const m of allPriceMatches) {
          const v = parseFloat(m[1].replace(/\s/g, '').replace(/\./g, '').replace(',', '.'))
          if (v > 30 && v > maxPrijs) maxPrijs = v
        }
        if (maxPrijs > 0) prijs = maxPrijs
      }
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
    } else if (isGealanNL) {
      // Vleugel regels in S9000NL: "Vleugel DK Raam 6003", "Vleugel Deur binnendr. 6025",
      // "Vleugel Deur buitendr. 6027", "Vleugel Hef-schuif 2 delig- 6362", "Vleugel Valraam 6003".
      const vleugelLines = searchText.match(/Vleugel\s+[^\n]+/gi)
      if (/Hef-schuif/i.test(header.systeem)) {
        type = 'Schuifpui'
      } else if (vleugelLines) {
        for (const v of vleugelLines) {
          if (/Hef-schuif/i.test(v)) { type = 'Schuifpui' }
          else if (/Stolpdeur\s+buitendr/i.test(v)) { type = 'Stolpdeur'; drapirichting = 'Naar buiten draaiend' }
          else if (/Stolpdeur\s+binnendr/i.test(v)) { type = 'Stolpdeur'; drapirichting = 'Naar binnen draaiend' }
          else if (/Deur\s+binnendr/i.test(v)) { type = 'Deur'; drapirichting = 'Naar binnen draaiend' }
          else if (/Deur\s+buitendr/i.test(v)) { type = 'Deur'; drapirichting = 'Naar buiten draaiend' }
          else if (/DK\s*Raam/i.test(v)) { type = 'Draai-kiep raam' }
          else if (/Valraam/i.test(v)) { type = 'Valraam' }
          else if (/Draai\s*Raam/i.test(v)) { type = 'Draairaam' }
        }
      } else {
        type = 'Vast raam'
      }
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

    const vleugelMatches = !isGealan && !isGealanNL ? specsText.match(/Vleugel\s*(?:\d\s*\n\s*)?(17\d{4}\s+[^\n]+|K\d{5,6}[,\s]+[^\n]+|COR-\d{4}[,\s]+[^\n]+|Vast raam in de kader)/g) : null
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
    // In S9000NL staat beslag in "Vleugel <type> 60XX\n<BESLAG_OMSCHR>" bv.
    // "Vleugel DK Raam 6003\nROTO STANDAARD BESLAG" / "Vleugel Deur binnendr. 6025\nDEUR BINNEN DR ENKEL"
    // / "Vleugel Hef-schuif 2 delig- 6362\n2 DELIG- ENKEL HEF-SCHUIF DEUR"
    const gealanNLBeslagMatch = isGealanNL ? searchText.match(/Vleugel\s+[^\n]*?\d{4}\s*\n([A-Z0-9][A-Z0-9\s\-.,+]+?)\s*\n/i) : null
    let beslag = cleanField(beslagRaw || (gealanBeslagMatch ? gealanBeslagMatch[1].trim() : '') || (gealanNLBeslagMatch ? gealanNLBeslagMatch[1].trim() : ''))
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
    let afmetingen = ''
    const afmMatch = searchText.match(/Afmetingen[\s\S]{0,30}?(\d+\s*mm\s*x\s*\d+\s*mm)/) ||
                     searchText.match(/Afmeting\s*:\s*(\d+\s*x\s*\d+\s*mm)/)
    if (afmMatch) {
      afmetingen = afmMatch[1]
    } else if (isGealanNL) {
      // In S9000NL zijn totale afmetingen de laatste 2 stand-alone integer regels VOOR
      // "Beschrijving Kleur test" (volgorde: height, width). Kleinere sub-breedtes staan
      // op regels met meerdere getallen en worden genegeerd.
      const beschrIdx = searchText.search(/Beschrijving\s+Kleur\s+test/i)
      if (beschrIdx > 0) {
        const before = searchText.substring(0, beschrIdx)
        const standalones: number[] = []
        const lineRe = /^\s*(\d{3,4})\s*$/gm
        let lm
        while ((lm = lineRe.exec(before)) !== null) {
          const n = parseInt(lm[1])
          if (n >= 100 && n <= 9999) standalones.push(n)
        }
        if (standalones.length >= 2) {
          const h = standalones[standalones.length - 2]
          const w = standalones[standalones.length - 1]
          afmetingen = `${w} mm x ${h} mm`
        }
      }
    }

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
    if ((isGealan || isGealanNL) && !glasType) {
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
    // Gealan (oude) helper: "Label\n \nValue\n"
    const gealanSpec = isGealan ? (label: string) => {
      const m = searchText.match(new RegExp(label + '\\s*\\n\\s*\\n([^\\n]+)', 'i'))
      return m ? cleanField(m[1].trim()) : ''
    } : () => ''
    // Gealan NL helper: "Label Value" op één regel (bv. "Dorpel Isostone", "Slot Fuhr SKG Cilinderbediend",
    // "Cilinder Doorgaand 45/65", "Kleur scharnieren Wit 9016", "Uitv. scharnieren 3+1 scharnieren",
    // "Kruk binnen Kruk HVN Bi", "Kruk buiten Kruk kerntr+Cil", "Raamkruk Wit niet afsluitbaar").
    const gealanNLSpec = isGealanNL ? (label: string) => {
      const m = searchText.match(new RegExp('^\\s*' + label + '\\s+([^\\n]+)', 'im'))
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
      dorpel: (dorpelMatch ? cleanField(dorpelMatch[1].trim()) : '') || gealanSpec('Dorpel') || gealanNLSpec('Dorpel'),
      sluiting: (sluitingMatch ? cleanField(sluitingMatch[1].trim()) : '') || gealanSpec('Slot') || gealanNLSpec('Slot'),
      scharnieren: (isGealanNL ? gealanNLSpec('Uitv\\. scharnieren') : '') || (scharnierenMatch ? cleanField(scharnierenMatch[1].trim()) : '') || gealanSpec('Uitv\\. scharnieren'),
      gewicht: gewichtMatch ? gewichtMatch[1].trim() : '',
      omtrek: omtrekMatch ? omtrekMatch[1].trim() : '',
      paneel: paneelMatch ? cleanField(paneelMatch[1].trim()) : '',
      commentaar,
      tekeningPath: '',
      hoekverbinding: hoekverbindingMatch ? cleanField(hoekverbindingMatch[1].trim()) : '',
      montageGaten: montageGatenMatch ? cleanField(montageGatenMatch[1].trim()) : '',
      afwatering: afwateringMatch ? cleanField(afwateringMatch[1].trim()) : '',
      scharnierenKleur: (scharnierenKleurMatch ? cleanField(scharnierenKleurMatch[1].trim()) : '') || gealanSpec('Kleur scharnieren') || gealanNLSpec('Kleur scharnieren'),
      lakKleur: lakKleurMatch ? cleanField(lakKleurMatch[1].trim()) : '',
      sluitcilinder: (sluitcilinderMatch ? cleanField(sluitcilinderMatch[1].trim()) : '') || gealanSpec('Cilinder') || gealanNLSpec('Cilinder'),
      aantalSleutels: aantalSleutelsMatch ? cleanField(aantalSleutelsMatch[1].trim()) : '',
      gelijksluitend: gelijksluitendMatch ? cleanField(gelijksluitendMatch[1].trim()) : '',
      krukBinnen: (krukBinnenMatch ? cleanField(krukBinnenMatch[1].trim()) : '') || gealanSpec('Kruk binnen') || gealanNLSpec('Kruk binnen'),
      krukBuiten: (krukBuitenMatch ? cleanField(krukBuitenMatch[1].trim()) : '') || gealanSpec('Kruk buiten') || gealanNLSpec('Kruk Buiten') || gealanNLSpec('Kruk buiten'),
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

// Autodetect op basis van regex-patronen. Wordt gebruikt als second-opinion
// voor de AI-detectie (om confidence te verhogen) of als fallback bij AI-fout.
export function detectLeverancierFromText(text: string): LeverancierKey | null {
  const cleaned = text.replace(/[-]/g, '')
  if (/(?:Deur|Element)\s+\d{3}[\s\n]+Hoeveelheid\s*:/i.test(cleaned)) return 'aluplast'
  if (/Productie\s+maten/i.test(cleaned) && /Netto\s*prijs/i.test(cleaned) && /Aantal\s*:\s*\d+\s+Verbinding\s*:/i.test(cleaned) && !/Merk\s+[\dA-Z]+\s*Aantal/.test(cleaned)) return 'gealan-nl'
  if (/Merk\s+[\dA-Z]+\s*Aantal\s*:\s*\d+/.test(cleaned) && /Netto\s*totaal/i.test(cleaned) && !/Merk\s+[A-Z]\s*Aantal\s*stuks/i.test(cleaned)) return 'gealan'
  if (/Merk\s+[A-Z]\s*Aantal\s*stuks\s*:\s*\d+/i.test(cleaned) || /Sch[ü¿u\s][cCG][oO]\s+(?:Slide|Verdiept)/i.test(cleaned) || /1IVO\s*[%&'()*+,\-.]/.test(cleaned)) return 'schuco'
  if (/K-Vision\s+\d+/.test(cleaned) || /KOCHS|Primus\s*MD|Premidoor\s*\d+/i.test(cleaned)) return 'kochs'
  if (/Hoev\.\s*:\s*\d+/.test(cleaned)) return 'eko-okna'
  return null
}
