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
  tekeningUrls?: { url: string; pageIndex: number; totalPages: number }[]
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
const coverBgPath = path.join(process.cwd(), 'public', 'images', 'cover-bg.png')
const backPagePath = path.join(process.cwd(), 'public', 'images', 'back-page.jpg')
const rkIconPath = path.join(process.cwd(), 'public', 'images', 'rk-icon-transparent.png')

export function TekeningenDocument({ offerte }: { offerte: TekeningenData }) {
  let totaalGewicht = 0
  offerte.elementen.forEach(e => {
    const m = e.gewicht.match(/([\d.,]+)\s*Kg/i)
    if (m) totaalGewicht += parseFloat(m[1].replace(',', '.')) * e.hoeveelheid
  })

  let totaalOmtrek = 0
  offerte.elementen.forEach(e => {
    const omtrekMmMatch = e.omtrek?.match(/([\d.,]+)\s*mm/i)
    const omtrekMMatch = !omtrekMmMatch ? e.omtrek?.match(/([\d.,]+)\s*m\b/i) : null
    if (omtrekMmMatch) {
      const val = parseFloat(omtrekMmMatch[1].replace(/\./g, '').replace(',', '.'))
      totaalOmtrek += val * e.hoeveelheid
    } else if (omtrekMMatch) {
      const val = parseFloat(omtrekMMatch[1].replace(',', '.'))
      totaalOmtrek += val * 1000 * e.hoeveelheid
    } else {
      const afmMatch = e.afmetingen?.match(/(\d+)\s*mm\s*x\s*(\d+)\s*mm/)
      if (afmMatch) {
        totaalOmtrek += 2 * (parseInt(afmMatch[1]) + parseInt(afmMatch[2])) * e.hoeveelheid
      }
    }
  })

  return (
    <Document>
      {/* ====== ELEMENT PAGINA'S (ZONDER PRIJZEN, geen Rebu branding — klant zet er zelf offerte omheen) ====== */}
      {offerte.elementen.map((element, idx) => {
        const pages = element.tekeningUrls && element.tekeningUrls.length > 0
          ? element.tekeningUrls
          : element.tekeningUrl
            ? [{ url: element.tekeningUrl, pageIndex: 0, totalPages: 1 }]
            : []

        return (
          <React.Fragment key={`tekening-${idx}`}>
            {pages.map((pg, pi) => (
              <Page key={`tekening-${idx}-p${pi}`} size="A4" style={[s.page, { padding: 20 }]}>
                <View style={{ marginBottom: 6 }}>
                  <Text style={s.elementNameText}>
                    {element.naam.toUpperCase()}
                    {element.hoeveelheid > 1 ? ` (${element.hoeveelheid}x)` : ''}
                  </Text>
                  <Text style={s.elementSubText}>
                    {[element.systeem, element.afmetingen].filter(Boolean).join(' \u00B7 ')}
                  </Text>
                </View>

                {pg.totalPages > 1 && (
                  <Text style={s.pageIndicator}>Pagina {pg.pageIndex + 1}/{pg.totalPages}</Text>
                )}

                {pg.url && (
                  <View style={{ alignItems: 'center', overflow: 'hidden', flex: 1 }}>
                    <Image src={pg.url} style={s.elementImageFullPage} />
                  </View>
                )}
              </Page>
            ))}
          </React.Fragment>
        )
      })}

      {/* ====== SAMENVATTING (geen Rebu branding — klant voegt eigen offerte toe) ====== */}
      <Page size="A4" style={[s.page, { padding: 24 }]}>
        <View style={{ marginBottom: 14 }}>
          <Text style={{ fontSize: 16, fontFamily: 'Helvetica-Bold', color: COLORS.text, letterSpacing: 0.5, marginBottom: 14 }}>
            SAMENVATTING
          </Text>

          {/* Element overzicht tabel */}
          <View style={{ borderWidth: 0.7, borderColor: '#D1D5DB', borderRadius: 4, marginBottom: 14 }}>
            {/* Header */}
            <View style={{ flexDirection: 'row', backgroundColor: '#F3F4F6', borderBottomWidth: 0.7, borderBottomColor: '#D1D5DB', paddingVertical: 8, paddingHorizontal: 10 }}>
              <Text style={{ fontSize: 10, fontFamily: 'Helvetica-Bold', color: COLORS.text, flex: 3 }}>Element</Text>
              <Text style={{ fontSize: 10, fontFamily: 'Helvetica-Bold', color: COLORS.text, flex: 2 }}>Systeem</Text>
              <Text style={{ fontSize: 10, fontFamily: 'Helvetica-Bold', color: COLORS.text, width: 85, textAlign: 'center' }}>Afmeting</Text>
              <Text style={{ fontSize: 10, fontFamily: 'Helvetica-Bold', color: COLORS.text, width: 40, textAlign: 'center' }}>Hvh</Text>
            </View>
            {/* Rows */}
            {offerte.elementen.map((el, i) => (
              <View key={`sum-${i}`} style={{ flexDirection: 'row', borderBottomWidth: i < offerte.elementen.length - 1 ? 0.5 : 0, borderBottomColor: '#E5E7EB', paddingVertical: 7, paddingHorizontal: 10 }}>
                <Text style={{ fontSize: 10, color: COLORS.text, flex: 3 }}>{el.naam}{el.type ? ` (${el.type})` : ''}</Text>
                <Text style={{ fontSize: 10, color: COLORS.text, flex: 2 }}>{el.systeem}</Text>
                <Text style={{ fontSize: 10, color: COLORS.text, width: 85, textAlign: 'center' }}>{el.afmetingen}</Text>
                <Text style={{ fontSize: 10, color: COLORS.text, width: 40, textAlign: 'center' }}>{el.hoeveelheid}</Text>
              </View>
            ))}
          </View>

          {/* Totalen */}
          <View style={{ flexDirection: 'row', justifyContent: 'flex-end', gap: 30, marginTop: 6 }}>
            {totaalGewicht > 0 && (
              <View style={{ flexDirection: 'row' }}>
                <Text style={{ fontSize: 10, fontFamily: 'Helvetica-Bold', color: COLORS.text }}>Totaal gewicht: </Text>
                <Text style={{ fontSize: 10, color: COLORS.text }}>{totaalGewicht.toFixed(1).replace('.', ',')} Kg</Text>
              </View>
            )}
            {totaalOmtrek > 0 && (
              <View style={{ flexDirection: 'row' }}>
                <Text style={{ fontSize: 10, fontFamily: 'Helvetica-Bold', color: COLORS.text }}>Totale omtrek: </Text>
                <Text style={{ fontSize: 10, color: COLORS.text }}>{(totaalOmtrek / 1000).toFixed(2).replace('.', ',')} m</Text>
              </View>
            )}
          </View>
        </View>

        {/* Voorwaarden tekst */}
        <View style={{ borderTopWidth: 0.5, borderTopColor: '#D1D5DB', paddingTop: 10, marginBottom: 8 }}>
          <Text style={{ fontSize: 9, color: COLORS.text, lineHeight: 1.5 }}>
            Volgens de bepalingen van de Europese Norm vereisen sommige constructies van ramen en deuren het gebruik van veiligheidsglas. Als het ontwerp niet voldoet aan deze eisen, betekent dit dat de klant bewust afziet van het gebruik van veiligheidsglas. In het geval van ongevallen en schade veroorzaakt door het niet naleven van bepalingen van de normen, ligt de verantwoordelijkheid geheel bij de klant.
          </Text>
        </View>

        <View style={{ borderTopWidth: 0.5, borderTopColor: '#D1D5DB', paddingTop: 8, marginBottom: 8 }}>
          <Text style={{ fontSize: 9, color: COLORS.text, lineHeight: 1.5, fontFamily: 'Helvetica-Bold' }}>
            Controleer de bestelling A.U.B. zorgvuldig.
          </Text>
        </View>

        <View style={{ marginBottom: 8 }}>
          <Text style={{ fontSize: 9, color: COLORS.text, lineHeight: 1.5 }}>
            Met deze handtekening bevestigt u het akkoord voor de productie.
          </Text>
        </View>

        <View style={{ marginBottom: 8 }}>
          <Text style={{ fontSize: 9, color: COLORS.text, lineHeight: 1.5 }}>
            De aangeboden offerte omvat de definitieve afmetingen, kleuren, draai richtingen en accessoires van de producten. Controleer de hoeveelheid artikelen, afmetingen, kleuren, richtingen, beglazingen en de geselecteerde accessoires daarom zorgvuldig.
          </Text>
        </View>

        <View style={{ marginBottom: 8 }}>
          <Text style={{ fontSize: 9, color: COLORS.text, lineHeight: 1.5 }}>
            Door uw aanbetaling stemt u in met de definitieve vorm van de aanbieding en met de verkoopvoorwaarden.
          </Text>
        </View>

        <View style={{ borderTopWidth: 0.5, borderTopColor: '#D1D5DB', paddingTop: 8, marginBottom: 8 }}>
          <Text style={{ fontSize: 9, color: COLORS.text, lineHeight: 1.5, fontFamily: 'Helvetica-Bold' }}>
            Wij voldoen aan de norm ISO 9001:2015 i ISO 14001:2015
          </Text>
        </View>

        <View style={{ borderTopWidth: 0.5, borderTopColor: '#D1D5DB', paddingTop: 8, marginBottom: 8 }}>
          <Text style={{ fontSize: 9, color: COLORS.text, lineHeight: 1.5 }}>
            Hoewel wij de grootst mogelijke zorgvuldigheid in acht nemen, hebben wij geen volledige controle over vertragingen m.b.t. de levering. Het gevolg kan zijn van bovenaf opgelegde wettelijke voorschriften die van invloed zijn op de doorstroming van het vervoer, de beschikbaarheid van personeel of andere belemmeringen. Indien wij van dergelijke beperkingen op de hoogte zijn, zullen wij daar z.s.m over informeren. De mogelijke gevolgen voor de tijdigheid van uw bestelling, kunnen hierdoor veranderen. In acht genomen is dat dit over omstandigheden gaat waar wij geen controle over hebben.
          </Text>
        </View>

      </Page>
    </Document>
  )
}
