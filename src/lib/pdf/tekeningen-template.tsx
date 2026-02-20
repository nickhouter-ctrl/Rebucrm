import React from 'react'
import { Document, Page, Text, View, Image } from '@react-pdf/renderer'
import { sharedStyles as s, COMPANY, COLORS } from './shared-styles'
import path from 'path'

export interface TekeningenElement {
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
  tekeningUrl: string
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

interface TekeningenData {
  offertenummer: string
  elementen: TekeningenElement[]
}

const logoPath = path.join(process.cwd(), 'public', 'images', 'logo-rebu.png')

export function TekeningenDocument({ offerte }: { offerte: TekeningenData }) {
  let totaalGewicht = 0
  offerte.elementen.forEach(e => {
    const m = e.gewicht.match(/([\d.,]+)\s*Kg/i)
    if (m) totaalGewicht += parseFloat(m[1].replace(',', '.')) * e.hoeveelheid
  })

  let totaalOmtrek = 0
  offerte.elementen.forEach(e => {
    // Prefer parsed Eenheidsomtrek value (mm)
    const omtrekMmMatch = e.omtrek?.match(/([\d.,]+)\s*mm/i)
    // Also handle meters format (e.g. "8.4 m" from Aluprof/Eko-Okna PDFs)
    const omtrekMMatch = !omtrekMmMatch ? e.omtrek?.match(/([\d.,]+)\s*m\b/i) : null
    if (omtrekMmMatch) {
      // Dutch format: dot = thousands separator, comma = decimal
      const val = parseFloat(omtrekMmMatch[1].replace(/\./g, '').replace(',', '.'))
      totaalOmtrek += val * e.hoeveelheid
    } else if (omtrekMMatch) {
      // Meters → convert to mm
      const val = parseFloat(omtrekMMatch[1].replace(',', '.'))
      totaalOmtrek += val * 1000 * e.hoeveelheid
    } else {
      // Fallback: compute from afmetingen
      const afmMatch = e.afmetingen?.match(/(\d+)\s*mm\s*x\s*(\d+)\s*mm/)
      if (afmMatch) {
        totaalOmtrek += 2 * (parseInt(afmMatch[1]) + parseInt(afmMatch[2])) * e.hoeveelheid
      }
    }
  })

  return (
    <Document>
      {/* ====== COVER ====== */}
      <Page size="A4" style={[s.page, { padding: 0 }]}>
        <View style={s.coverPage}>
          <View style={s.coverLeft}>
            <View style={{ alignItems: 'center' }}>
              <Text style={s.coverRebu}>REBU</Text>
              <Text style={s.coverKozijnen}>KOZIJNEN</Text>
              <Text style={s.coverSlogan}>Maken het verschil.</Text>
            </View>
          </View>
          <View style={s.coverRight}>
            <Text style={s.coverRkIcon}>RK</Text>
          </View>
        </View>
        <View style={s.coverBottomBar}>
          <View style={{ flexDirection: 'row', gap: 40 }}>
            <View>
              <Text style={s.coverBottomLabel}>TEKENINGEN</Text>
              <Text style={s.coverBottomValue}>{offerte.offertenummer}</Text>
            </View>
          </View>
        </View>
      </Page>

      {/* ====== ELEMENT PAGINA'S (ZONDER PRIJZEN) ====== */}
      {offerte.elementen.map((element, idx) => (
        <Page key={`tekening-${idx}`} size="A4" style={[s.page, s.contentPage]}>
          <View style={s.contentSidebar} />
          <Text style={s.watermark}>RK</Text>
          <View style={s.logoArea}>
            <Image src={logoPath} style={{ width: 120, height: 'auto' }} />
          </View>

          {/* Groene header bar — compact, links uitgelijnd */}
          <View style={s.elementHeaderBar}>
            <Text style={s.elementHeaderTitle}>
              {element.naam.toUpperCase()}
              {element.hoeveelheid > 1 ? ` (${element.hoeveelheid}x)` : ''}
            </Text>
            <Text style={s.elementHeaderSub}>
              {[element.systeem, element.afmetingen].filter(Boolean).join(' \u00B7 ')}
            </Text>
          </View>

          {/* Tekening afbeelding */}
          {element.tekeningUrl && (
            <View style={{ alignItems: 'center', marginBottom: 15 }}>
              <Image src={element.tekeningUrl} style={s.elementImage} />
            </View>
          )}

          {/* Specificaties tabel */}
          <View style={s.specsTable}>
            <Text style={s.specsTitle}>Specificaties</Text>
            {element.type && (
              <View style={s.specsRow}>
                <Text style={s.specsLabel}>Type</Text>
                <Text style={s.specsValue}>{element.type}{element.drapirichting ? ` — ${element.drapirichting}` : ''}</Text>
              </View>
            )}
            {element.systeem && (
              <View style={s.specsRow}>
                <Text style={s.specsLabel}>Systeem</Text>
                <Text style={s.specsValue}>{element.systeem}</Text>
              </View>
            )}
            {element.kleur && (
              <View style={s.specsRow}>
                <Text style={s.specsLabel}>Kleur</Text>
                <Text style={s.specsValue}>{element.kleur}</Text>
              </View>
            )}
            {element.afmetingen && (
              <View style={s.specsRow}>
                <Text style={s.specsLabel}>Afmetingen</Text>
                <Text style={s.specsValue}>{element.afmetingen}</Text>
              </View>
            )}
            {element.glasType && (
              <View style={s.specsRow}>
                <Text style={s.specsLabel}>Beglazing</Text>
                <Text style={s.specsValue}>{element.glasType}</Text>
              </View>
            )}
            {element.beslag && (
              <View style={s.specsRow}>
                <Text style={s.specsLabel}>Beslag</Text>
                <Text style={s.specsValue}>{element.beslag}</Text>
              </View>
            )}
            {element.sluiting && (
              <View style={s.specsRow}>
                <Text style={s.specsLabel}>Sluiting</Text>
                <Text style={s.specsValue}>{element.sluiting}</Text>
              </View>
            )}
            {element.scharnieren && (
              <View style={s.specsRow}>
                <Text style={s.specsLabel}>Scharnieren</Text>
                <Text style={s.specsValue}>{element.scharnieren}</Text>
              </View>
            )}
            {element.scharnierenKleur && (
              <View style={s.specsRow}>
                <Text style={s.specsLabel}>Kleur scharnieren</Text>
                <Text style={s.specsValue}>{element.scharnierenKleur}</Text>
              </View>
            )}
            {element.lakKleur && (
              <View style={s.specsRow}>
                <Text style={s.specsLabel}>Lak kleur</Text>
                <Text style={s.specsValue}>{element.lakKleur}</Text>
              </View>
            )}
            {element.hoekverbinding && (
              <View style={s.specsRow}>
                <Text style={s.specsLabel}>Hoekverbinding</Text>
                <Text style={s.specsValue}>{element.hoekverbinding}</Text>
              </View>
            )}
            {element.montageGaten && (
              <View style={s.specsRow}>
                <Text style={s.specsLabel}>Montage gaten</Text>
                <Text style={s.specsValue}>{element.montageGaten}</Text>
              </View>
            )}
            {element.afwatering && (
              <View style={s.specsRow}>
                <Text style={s.specsLabel}>Afwatering</Text>
                <Text style={s.specsValue}>{element.afwatering}</Text>
              </View>
            )}
            {element.sluitcilinder && (
              <View style={s.specsRow}>
                <Text style={s.specsLabel}>Sluitcilinder</Text>
                <Text style={s.specsValue}>{element.sluitcilinder}</Text>
              </View>
            )}
            {element.aantalSleutels && (
              <View style={s.specsRow}>
                <Text style={s.specsLabel}>Aantal sleutels</Text>
                <Text style={s.specsValue}>{element.aantalSleutels}</Text>
              </View>
            )}
            {element.gelijksluitend && (
              <View style={s.specsRow}>
                <Text style={s.specsLabel}>Gelijksluitend</Text>
                <Text style={s.specsValue}>{element.gelijksluitend}</Text>
              </View>
            )}
            {element.krukBinnen && (
              <View style={s.specsRow}>
                <Text style={s.specsLabel}>Kruk binnen</Text>
                <Text style={s.specsValue}>{element.krukBinnen}</Text>
              </View>
            )}
            {element.krukBuiten && (
              <View style={s.specsRow}>
                <Text style={s.specsLabel}>Kruk buiten</Text>
                <Text style={s.specsValue}>{element.krukBuiten}</Text>
              </View>
            )}
            {element.dorpel && (
              <View style={s.specsRow}>
                <Text style={s.specsLabel}>Deur drempel</Text>
                <Text style={s.specsValue}>{element.dorpel}</Text>
              </View>
            )}
            {element.paneel && (
              <View style={s.specsRow}>
                <Text style={s.specsLabel}>Paneel</Text>
                <Text style={s.specsValue}>{element.paneel}</Text>
              </View>
            )}
            {element.uwWaarde && (
              <View style={s.specsRow}>
                <Text style={s.specsLabel}>Uw-waarde</Text>
                <Text style={s.specsValue}>{element.uwWaarde}</Text>
              </View>
            )}
            {element.gewicht && (
              <View style={s.specsRow}>
                <Text style={s.specsLabel}>Gewicht</Text>
                <Text style={s.specsValue}>{element.gewicht}</Text>
              </View>
            )}
            {element.commentaar && (
              <View style={[s.specsRow, { borderBottomWidth: 0 }]}>
                <Text style={s.specsLabel}>Opmerking</Text>
                <Text style={[s.specsValue, { color: '#DC2626' }]}>{element.commentaar}</Text>
              </View>
            )}
          </View>

          {/* Footer */}
          <View style={s.footer}>
            <View style={s.footerCol}>
              <Text style={s.footerLabel}>{COMPANY.naam}</Text>
              <Text style={s.footerText}>{COMPANY.adres}</Text>
              <Text style={s.footerText}>{COMPANY.postcode} {COMPANY.plaats}</Text>
            </View>
            <View style={s.footerCol}>
              <Text style={s.footerText}>{COMPANY.telefoon}</Text>
              <Text style={s.footerText}>{COMPANY.email}</Text>
              <Text style={s.footerText}>{COMPANY.website}</Text>
            </View>
            <View style={s.footerCol}>
              <Text style={s.footerText}><Text style={s.footerLabel}>BTW: </Text>{COMPANY.btw}</Text>
              <Text style={s.footerText}><Text style={s.footerLabel}>KVK: </Text>{COMPANY.kvk}</Text>
              <Text style={s.footerText}><Text style={s.footerLabel}>IBAN: </Text>{COMPANY.iban}</Text>
            </View>
          </View>
        </Page>
      ))}

      {/* ====== SAMENVATTING + VOORWAARDEN ====== */}
      <Page size="A4" style={[s.page, s.contentPage]}>
        <View style={s.contentSidebar} />
        <Text style={s.watermark}>RK</Text>
        <View style={s.logoArea}>
          <Image src={logoPath} style={{ width: 120, height: 'auto' }} />
        </View>

        {/* Samenvatting */}
        <View style={{ marginBottom: 20 }}>
          <View style={s.elementHeaderBar}>
            <Text style={s.elementHeaderTitle}>SAMENVATTING</Text>
          </View>

          <View style={{ flexDirection: 'row', justifyContent: 'flex-end', gap: 30, marginTop: 10 }}>
            {totaalGewicht > 0 && (
              <View style={{ flexDirection: 'row' }}>
                <Text style={{ fontSize: 9, fontFamily: 'Helvetica-Bold', color: COLORS.text }}>Totaal gewicht: </Text>
                <Text style={{ fontSize: 9, color: COLORS.text }}>{totaalGewicht.toFixed(1).replace('.', ',')} Kg</Text>
              </View>
            )}
            {totaalOmtrek > 0 && (
              <View style={{ flexDirection: 'row' }}>
                <Text style={{ fontSize: 9, fontFamily: 'Helvetica-Bold', color: COLORS.text }}>Totale omtrek: </Text>
                <Text style={{ fontSize: 9, color: COLORS.text }}>{(totaalOmtrek / 1000).toFixed(2).replace('.', ',')} m</Text>
              </View>
            )}
          </View>
        </View>

        {/* Voorwaarden tekst */}
        <View style={{ borderTopWidth: 0.5, borderTopColor: '#D1D5DB', paddingTop: 10, marginBottom: 8 }}>
          <Text style={{ fontSize: 7.5, color: COLORS.text, lineHeight: 1.5 }}>
            Volgens de bepalingen van de Europese Norm vereisen sommige constructies van ramen en deuren het gebruik van veiligheidsglas. Als het ontwerp niet voldoet aan deze eisen, betekent dit dat de klant bewust afziet van het gebruik van veiligheidsglas. In het geval van ongevallen en schade veroorzaakt door het niet naleven van bepalingen van de normen, ligt de verantwoordelijkheid geheel bij de klant.
          </Text>
        </View>

        <View style={{ borderTopWidth: 0.5, borderTopColor: '#D1D5DB', paddingTop: 8, marginBottom: 8 }}>
          <Text style={{ fontSize: 7.5, color: COLORS.text, lineHeight: 1.5, fontFamily: 'Helvetica-Bold' }}>
            Controleer de bestelling A.U.B. zorgvuldig.
          </Text>
        </View>

        <View style={{ marginBottom: 8 }}>
          <Text style={{ fontSize: 7.5, color: COLORS.text, lineHeight: 1.5 }}>
            Met deze handtekening bevestigt u het akkoord voor de productie.
          </Text>
        </View>

        <View style={{ marginBottom: 8 }}>
          <Text style={{ fontSize: 7.5, color: COLORS.text, lineHeight: 1.5 }}>
            De aangeboden offerte omvat de definitieve afmetingen, kleuren, draai richtingen en accessoires van de producten. Controleer de hoeveelheid artikelen, afmetingen, kleuren, richtingen, beglazingen en de geselecteerde accessoires daarom zorgvuldig.
          </Text>
        </View>

        <View style={{ marginBottom: 8 }}>
          <Text style={{ fontSize: 7.5, color: COLORS.text, lineHeight: 1.5 }}>
            Door uw aanbetaling stemt u in met de definitieve vorm van de aanbieding en met de verkoopvoorwaarden.
          </Text>
        </View>

        <View style={{ borderTopWidth: 0.5, borderTopColor: '#D1D5DB', paddingTop: 8, marginBottom: 8 }}>
          <Text style={{ fontSize: 7.5, color: COLORS.text, lineHeight: 1.5, fontFamily: 'Helvetica-Bold' }}>
            Wij voldoen aan de norm ISO 9001:2015 i ISO 14001:2015
          </Text>
        </View>

        <View style={{ borderTopWidth: 0.5, borderTopColor: '#D1D5DB', paddingTop: 8, marginBottom: 8 }}>
          <Text style={{ fontSize: 7.5, color: COLORS.text, lineHeight: 1.5 }}>
            Hoewel wij de grootst mogelijke zorgvuldigheid in acht nemen, hebben wij geen volledige controle over vertragingen m.b.t. de levering. Het gevolg kan zijn van bovenaf opgelegde wettelijke voorschriften die van invloed zijn op de doorstroming van het vervoer, de beschikbaarheid van personeel of andere belemmeringen. Indien wij van dergelijke beperkingen op de hoogte zijn, zullen wij daar z.s.m over informeren. De mogelijke gevolgen voor de tijdigheid van uw bestelling, kunnen hierdoor veranderen. In acht genomen is dat dit over omstandigheden gaat waar wij geen controle over hebben.
          </Text>
        </View>

        <View style={{ borderTopWidth: 0.5, borderTopColor: '#D1D5DB', paddingTop: 8 }}>
          <Text style={{ fontSize: 7.5, color: COLORS.green, lineHeight: 1.5, fontStyle: 'italic' }}>
            Op deze offerte en de uiteindelijke overeenkomst zijn de Algemene Voorwaarden van Rebu Kozijnen van toepassing. Deze zijn met de offerte aan u toegezonden alsmede te vinden op www.rebukozijnen.nl/algemene-voorwaarden.
          </Text>
        </View>

        {/* Footer */}
        <View style={s.footer}>
          <View style={s.footerCol}>
            <Text style={s.footerLabel}>{COMPANY.naam}</Text>
            <Text style={s.footerText}>{COMPANY.adres}</Text>
            <Text style={s.footerText}>{COMPANY.postcode} {COMPANY.plaats}</Text>
          </View>
          <View style={s.footerCol}>
            <Text style={s.footerText}>{COMPANY.telefoon}</Text>
            <Text style={s.footerText}>{COMPANY.email}</Text>
            <Text style={s.footerText}>{COMPANY.website}</Text>
          </View>
          <View style={s.footerCol}>
            <Text style={s.footerText}><Text style={s.footerLabel}>BTW: </Text>{COMPANY.btw}</Text>
            <Text style={s.footerText}><Text style={s.footerLabel}>KVK: </Text>{COMPANY.kvk}</Text>
            <Text style={s.footerText}><Text style={s.footerLabel}>IBAN: </Text>{COMPANY.iban}</Text>
          </View>
        </View>
      </Page>

      {/* ====== ACHTERPAGINA ====== */}
      <Page size="A4" style={[s.page, { padding: 0, backgroundColor: COLORS.black }]}>
        <View style={{ flex: 1, justifyContent: 'flex-end' }}>
          <View style={{
            backgroundColor: COLORS.green,
            paddingHorizontal: 40,
            paddingVertical: 25,
            flexDirection: 'row',
            justifyContent: 'space-between',
            alignItems: 'flex-end',
          }}>
            <View>
              <Text style={{ fontSize: 14, fontFamily: 'Helvetica-Bold', color: COLORS.white, marginBottom: 4 }}>
                06 58 86 60 70
              </Text>
              <Text style={{ fontSize: 10, color: COLORS.white, marginBottom: 10 }}>
                info@rebukozijnen.nl
              </Text>
              <Text style={{ fontSize: 10, color: COLORS.white }}>Samsonweg 26F</Text>
              <Text style={{ fontSize: 10, color: COLORS.white }}>1521 RM, Wormerveer</Text>
            </View>
            <View style={{ alignItems: 'flex-end' }}>
              <Text style={{ fontSize: 24, fontFamily: 'Helvetica-Bold', color: COLORS.white, letterSpacing: 2 }}>REBU</Text>
              <Text style={{ fontSize: 24, fontFamily: 'Helvetica-Bold', color: COLORS.white, letterSpacing: 1 }}>KOZIJNEN</Text>
              <Text style={{ fontSize: 9, color: COLORS.white }}>Maken het verschil.</Text>
            </View>
          </View>
        </View>
      </Page>
    </Document>
  )
}
