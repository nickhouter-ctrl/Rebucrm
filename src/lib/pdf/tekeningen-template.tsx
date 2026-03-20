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

function fmtPrice(n: number): string {
  return n.toFixed(2).replace('.', ',').replace(/\B(?=(\d{3})+(?!\d))/g, '.')
}

export function TekeningenDocument({ offerte }: { offerte: TekeningenData }) {
  let totaalPrijs = 0
  offerte.elementen.forEach(e => {
    if (e.prijs > 0) totaalPrijs += e.prijs * e.hoeveelheid
  })

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
      {/* ====== COVER ====== */}
      <Page size="A4" style={[s.page, { padding: 0 }]}>
        <View style={{ width: '100%', height: '100%', position: 'relative' }}>
          <Image src={coverBgPath} style={s.fullPageBg} />
          <View style={s.coverBottomBar}>
            <View>
              <Text style={{ fontSize: 8, fontFamily: 'Helvetica-Bold', color: COLORS.white, letterSpacing: 0.5 }}>
                <Text>TEKENINGEN</Text>
              </Text>
              <Text style={{ fontSize: 8, color: COLORS.white, marginTop: 2 }}>
                {offerte.offertenummer}
              </Text>
            </View>
          </View>
        </View>
      </Page>

      {/* ====== ELEMENT PAGINA'S (ZONDER PRIJZEN) ====== */}
      {offerte.elementen.map((element, idx) => {
        const pages = element.tekeningUrls && element.tekeningUrls.length > 0
          ? element.tekeningUrls
          : element.tekeningUrl
            ? [{ url: element.tekeningUrl, pageIndex: 0, totalPages: 1 }]
            : []

        return (
          <React.Fragment key={`tekening-${idx}`}>
            {pages.map((pg, pi) => (
              <Page key={`tekening-${idx}-p${pi}`} size="A4" style={[s.page, s.contentPage]}>
                <View style={s.contentSidebar} />
                <Image src={rkIconPath} style={s.watermarkImage} />
                <View style={s.logoArea}>
                  <Image src={logoPath} style={{ width: 120, height: 'auto' }} />
                </View>

                <View style={{ marginBottom: 4, marginTop: 20 }}>
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
                  <View style={{ alignItems: 'center', marginBottom: 8, overflow: 'hidden', maxHeight: 520 }}>
                    <Image src={pg.url} style={s.elementImageFullPage} />
                  </View>
                )}

                {/* Verkoopprijs in groen (alleen op eerste pagina van element) */}
                {pi === 0 && element.prijs > 0 && (
                  <View style={{ alignItems: 'flex-end', marginTop: 4, marginBottom: 4, paddingRight: 20 }}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', backgroundColor: '#F0FDF4', paddingHorizontal: 12, paddingVertical: 6, borderRadius: 4, borderWidth: 0.5, borderColor: '#16A34A' }}>
                      <Text style={{ fontSize: 9, color: '#16A34A', fontFamily: 'Helvetica-Bold' }}>
                        Prijs: € {fmtPrice(element.prijs * element.hoeveelheid)}
                      </Text>
                      {element.hoeveelheid > 1 && (
                        <Text style={{ fontSize: 7.5, color: '#16A34A', marginLeft: 6 }}>
                          ({element.hoeveelheid}x € {fmtPrice(element.prijs)})
                        </Text>
                      )}
                    </View>
                  </View>
                )}

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
          </React.Fragment>
        )
      })}

      {/* ====== SAMENVATTING + VOORWAARDEN ====== */}
      <Page size="A4" style={[s.page, s.contentPage]}>
        <View style={s.contentSidebar} />
        <Image src={rkIconPath} style={s.watermarkImage} />
        <View style={s.logoArea}>
          <Image src={logoPath} style={{ width: 120, height: 'auto' }} />
        </View>

        <View style={{ marginBottom: 12 }}>
          <Text style={{ fontSize: 13, fontFamily: 'Helvetica-Bold', color: COLORS.text, letterSpacing: 0.5, marginBottom: 10 }}>
            SAMENVATTING
          </Text>

          {/* Element overzicht tabel */}
          <View style={{ borderWidth: 0.5, borderColor: '#D1D5DB', borderRadius: 4, marginBottom: 10 }}>
            {/* Header */}
            <View style={{ flexDirection: 'row', backgroundColor: '#F3F4F6', borderBottomWidth: 0.5, borderBottomColor: '#D1D5DB', paddingVertical: 5, paddingHorizontal: 8 }}>
              <Text style={{ fontSize: 7.5, fontFamily: 'Helvetica-Bold', color: COLORS.text, flex: 3 }}>Element</Text>
              <Text style={{ fontSize: 7.5, fontFamily: 'Helvetica-Bold', color: COLORS.text, flex: 2 }}>Systeem</Text>
              <Text style={{ fontSize: 7.5, fontFamily: 'Helvetica-Bold', color: COLORS.text, width: 30, textAlign: 'center' }}>Hvh</Text>
              <Text style={{ fontSize: 7.5, fontFamily: 'Helvetica-Bold', color: COLORS.text, width: 80, textAlign: 'right' }}>Prijs</Text>
            </View>
            {/* Rows */}
            {offerte.elementen.map((el, i) => (
              <View key={`sum-${i}`} style={{ flexDirection: 'row', borderBottomWidth: i < offerte.elementen.length - 1 ? 0.5 : 0, borderBottomColor: '#E5E7EB', paddingVertical: 4, paddingHorizontal: 8 }}>
                <Text style={{ fontSize: 7.5, color: COLORS.text, flex: 3 }}>{el.naam}{el.type ? ` (${el.type})` : ''}</Text>
                <Text style={{ fontSize: 7.5, color: COLORS.text, flex: 2 }}>{el.systeem}</Text>
                <Text style={{ fontSize: 7.5, color: COLORS.text, width: 30, textAlign: 'center' }}>{el.hoeveelheid}</Text>
                <Text style={{ fontSize: 7.5, color: COLORS.text, width: 80, textAlign: 'right' }}>
                  {el.prijs > 0 ? `€ ${fmtPrice(el.prijs * el.hoeveelheid)}` : '-'}
                </Text>
              </View>
            ))}
          </View>

          {/* Totalen */}
          <View style={{ flexDirection: 'row', justifyContent: 'flex-end', gap: 30, marginTop: 4 }}>
            {totaalGewicht > 0 && (
              <View style={{ flexDirection: 'row' }}>
                <Text style={{ fontSize: 8, fontFamily: 'Helvetica-Bold', color: COLORS.text }}>Totaal gewicht: </Text>
                <Text style={{ fontSize: 8, color: COLORS.text }}>{totaalGewicht.toFixed(1).replace('.', ',')} Kg</Text>
              </View>
            )}
            {totaalOmtrek > 0 && (
              <View style={{ flexDirection: 'row' }}>
                <Text style={{ fontSize: 8, fontFamily: 'Helvetica-Bold', color: COLORS.text }}>Totale omtrek: </Text>
                <Text style={{ fontSize: 8, color: COLORS.text }}>{(totaalOmtrek / 1000).toFixed(2).replace('.', ',')} m</Text>
              </View>
            )}
            {totaalPrijs > 0 && (
              <View style={{ flexDirection: 'row', backgroundColor: '#F0FDF4', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 4, borderWidth: 0.5, borderColor: '#16A34A' }}>
                <Text style={{ fontSize: 9, fontFamily: 'Helvetica-Bold', color: '#16A34A' }}>Totaal: € {fmtPrice(totaalPrijs)}</Text>
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

      {/* ====== ACHTERPAGINA MET FOTO ====== */}
      <Page size="A4" style={[s.page, { padding: 0 }]}>
        <View style={{ width: '100%', height: '100%', position: 'relative' }}>
          <Image src={backPagePath} style={s.fullPageBg} />
        </View>
      </Page>
    </Document>
  )
}
