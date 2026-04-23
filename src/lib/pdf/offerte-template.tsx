import React from 'react'
import { Document, Page, Text, View, Image } from '@react-pdf/renderer'
import { sharedStyles as s, COMPANY, COLORS, formatCurrencyPdf, formatDatePdf } from './shared-styles'
import path from 'path'

interface Regel {
  omschrijving: string
  aantal: number
  prijs: number
  btw_percentage: number
  totaal: number
}

interface Relatie {
  bedrijfsnaam: string
  contactpersoon?: string | null
  adres?: string | null
  postcode?: string | null
  plaats?: string | null
}

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
  tekeningUrl: string // base64 data URL or public URL (first/only page)
  tekeningUrls?: { url: string; pageIndex: number; totalPages: number }[] // multi-page support
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

interface OfferteData {
  offertenummer: string
  datum: string
  geldig_tot?: string | null
  onderwerp?: string | null
  inleiding?: string | null
  subtotaal: number
  btw_totaal: number
  totaal: number
  opmerkingen?: string | null
  versie_nummer?: number | null
  relatie?: Relatie | null
  regels?: Regel[]
  kozijnElementen?: KozijnElement[]
  leverancierTotaal?: number
}

const logoPath = path.join(process.cwd(), 'public', 'images', 'logo-rebu.png')
const coverBgPath = path.join(process.cwd(), 'public', 'images', 'cover-bg.png')
const backPagePath = path.join(process.cwd(), 'public', 'images', 'back-page.jpg')
const rkIconPath = path.join(process.cwd(), 'public', 'images', 'rk-icon-transparent.png')

export function OfferteDocument({ offerte, hidePrices }: { offerte: OfferteData; hidePrices?: boolean }) {
  const regels = offerte.regels || []
  const relatie = offerte.relatie

  // Bereken BTW groepen
  const btwGroepen: Record<number, number> = {}
  regels.forEach(r => {
    const btwBedrag = (r.aantal * r.prijs * r.btw_percentage) / 100
    btwGroepen[r.btw_percentage] = (btwGroepen[r.btw_percentage] || 0) + btwBedrag
  })

  // Bereken kozijn totalen
  const kozijnen = offerte.kozijnElementen || []
  const elementenSum = kozijnen.reduce((sum, e) => sum + e.prijs * e.hoeveelheid, 0)
  const kozijnTotaalExcl = offerte.leverancierTotaal && offerte.leverancierTotaal > 0
    ? offerte.leverancierTotaal
    : elementenSum
  const kozijnBtw = kozijnTotaalExcl * 0.21
  const kozijnTotaalIncl = kozijnTotaalExcl + kozijnBtw

  let kozijnTotaalGewicht = 0
  kozijnen.forEach(e => {
    const m = e.gewicht.match(/([\d.,]+)\s*Kg/i)
    if (m) kozijnTotaalGewicht += parseFloat(m[1].replace(',', '.')) * e.hoeveelheid
  })

  let kozijnTotaalOmtrek = 0
  kozijnen.forEach(e => {
    const omtrekMmMatch = e.omtrek?.match(/([\d.,]+)\s*mm/i)
    const omtrekMMatch = !omtrekMmMatch ? e.omtrek?.match(/([\d.,]+)\s*m\b/i) : null
    if (omtrekMmMatch) {
      const val = parseFloat(omtrekMmMatch[1].replace(/\./g, '').replace(',', '.'))
      kozijnTotaalOmtrek += val * e.hoeveelheid
    } else if (omtrekMMatch) {
      const val = parseFloat(omtrekMMatch[1].replace(',', '.'))
      kozijnTotaalOmtrek += val * 1000 * e.hoeveelheid
    } else {
      const afmMatch = e.afmetingen?.match(/(\d+)\s*mm\s*x\s*(\d+)\s*mm/)
      if (afmMatch) {
        kozijnTotaalOmtrek += 2 * (parseInt(afmMatch[1]) + parseInt(afmMatch[2])) * e.hoeveelheid
      }
    }
  })

  return (
    <Document>
      {/* ====== PAGINA 1: COVER — fris wit met groen accent ====== */}
      <Page size="A4" style={[s.page, { padding: 0, backgroundColor: '#FFFFFF' }]}>
        <View style={{ width: '100%', height: '100%', position: 'relative' }}>
          {/* Top gradient accent */}
          <View style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 6, backgroundColor: COLORS.green }} />

          {/* Logo groot centraal */}
          <View style={{ marginTop: 180, alignItems: 'center' }}>
            <Image src={logoPath} style={{ width: 280, height: 'auto' }} />
            <Text style={{ fontSize: 11, color: COLORS.textLight, marginTop: 12, letterSpacing: 2 }}>MAKEN HET VERSCHIL</Text>
          </View>

          {/* OFFERTE titel */}
          <View style={{ marginTop: 90, alignItems: 'center' }}>
            <Text style={{ fontSize: 34, fontFamily: 'Helvetica-Bold', color: COLORS.text, letterSpacing: 4 }}>OFFERTE</Text>
            <View style={{ width: 60, height: 3, backgroundColor: COLORS.green, marginTop: 14 }} />
          </View>

          {/* Offerte info block */}
          <View style={{ marginTop: 40, alignItems: 'center' }}>
            {relatie && (
              <Text style={{ fontSize: 14, color: COLORS.text, marginBottom: 14 }}>
                Voor: <Text style={{ fontFamily: 'Helvetica-Bold' }}>{relatie.bedrijfsnaam}</Text>
              </Text>
            )}
            <Text style={{ fontSize: 10, color: COLORS.textLight, letterSpacing: 1 }}>
              OFFERTENUMMER · <Text style={{ color: COLORS.text, fontFamily: 'Helvetica-Bold' }}>{offerte.offertenummer}</Text>
            </Text>
            <Text style={{ fontSize: 10, color: COLORS.textLight, letterSpacing: 1, marginTop: 4 }}>
              DATUM · <Text style={{ color: COLORS.text, fontFamily: 'Helvetica-Bold' }}>{formatDatePdf(offerte.datum)}</Text>
            </Text>
          </View>

          {/* Footer — company info */}
          <View style={{ position: 'absolute', bottom: 50, left: 50, right: 50, alignItems: 'center' }}>
            <View style={{ width: '100%', height: 0.5, backgroundColor: '#E5E7EB', marginBottom: 16 }} />
            <Text style={{ fontSize: 9, fontFamily: 'Helvetica-Bold', color: COLORS.green, letterSpacing: 1 }}>{COMPANY.naam.toUpperCase()}</Text>
            <Text style={{ fontSize: 9, color: COLORS.textLight, marginTop: 4 }}>{COMPANY.adres} · {COMPANY.postcode} {COMPANY.plaats}</Text>
            <Text style={{ fontSize: 9, color: COLORS.textLight, marginTop: 2 }}>{COMPANY.telefoon} · {COMPANY.email} · {COMPANY.website}</Text>
          </View>
        </View>
      </Page>

      {/* ====== PAGINA 2: INHOUD — fris zonder sidebar/watermerk ====== */}
      {regels.length > 0 && <Page size="A4" style={[s.page, { paddingTop: 40, paddingBottom: 60, paddingLeft: 50, paddingRight: 50 }]}>
        {/* Top groene accent */}
        <View style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 4, backgroundColor: COLORS.green }} />

        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 28 }}>
          <View style={{ flex: 1 }}>
            {relatie && (
              <>
                <Text style={s.clientName}>{relatie.bedrijfsnaam}</Text>
                {relatie.contactpersoon && <Text style={s.clientDetail}>t.a.v. {relatie.contactpersoon}</Text>}
                {relatie.adres && <Text style={s.clientDetail}>{relatie.adres}</Text>}
                {(relatie.postcode || relatie.plaats) && (
                  <Text style={s.clientDetail}>{[relatie.postcode, relatie.plaats].filter(Boolean).join(' ')}</Text>
                )}
              </>
            )}
          </View>
          <Image src={logoPath} style={{ width: 130, height: 'auto' }} />
        </View>

        <View style={s.metaSection}>
          <View style={s.metaLeft}>
            <Text style={s.metaLine}>
              <Text style={s.metaLabel}>Offertenummer: </Text>{offerte.offertenummer}
            </Text>
            <Text style={s.metaLine}>
              <Text style={s.metaLabel}>Offertedatum: </Text>{formatDatePdf(offerte.datum)}
            </Text>
            {offerte.geldig_tot && (
              <Text style={s.metaLine}>
                <Text style={s.metaLabel}>Vervaldatum: </Text>{formatDatePdf(offerte.geldig_tot)}
              </Text>
            )}
            {offerte.versie_nummer && offerte.versie_nummer > 1 && (
              <Text style={s.metaLine}>
                <Text style={s.metaLabel}>Versie: </Text>{offerte.versie_nummer}
              </Text>
            )}
          </View>
          <View style={s.metaRight}>
            {offerte.onderwerp && (
              <Text style={s.metaLine}>
                <Text style={s.metaLabel}>Referentie: </Text>{offerte.onderwerp}
              </Text>
            )}
          </View>
        </View>

        <View style={s.table}>
          <View style={s.tableHeader}>
            <View style={s.tableColAantal}><Text style={s.tableHeaderText}>Aantal</Text></View>
            <View style={s.tableColEenheid}><Text style={s.tableHeaderText}>Eenheid</Text></View>
            <View style={s.tableColDesc}><Text style={s.tableHeaderText}>Omschrijving</Text></View>
            {!hidePrices && <View style={s.tableColBedrag}><Text style={s.tableHeaderText}>Bedrag</Text></View>}
            {!hidePrices && <View style={s.tableColKorting}><Text style={s.tableHeaderText}>Korting</Text></View>}
            {!hidePrices && <View style={s.tableColTotaal}><Text style={s.tableHeaderText}>Totaal</Text></View>}
          </View>
          {regels.map((regel, i) => (
            <View key={i} style={s.tableRow}>
              <View style={s.tableColAantal}><Text style={s.tableCellText}>{regel.aantal}</Text></View>
              <View style={s.tableColEenheid}><Text style={s.tableCellText}>Stuk</Text></View>
              <View style={s.tableColDesc}><Text style={s.tableCellText}>{regel.omschrijving}</Text></View>
              {!hidePrices && <View style={s.tableColBedrag}><Text style={s.tableCellText}>{formatCurrencyPdf(regel.prijs)}</Text></View>}
              {!hidePrices && <View style={s.tableColKorting}><Text style={s.tableCellText}>0%</Text></View>}
              {!hidePrices && <View style={s.tableColTotaal}><Text style={s.tableCellText}>{formatCurrencyPdf(regel.aantal * regel.prijs)}</Text></View>}
            </View>
          ))}
        </View>

        {!hidePrices && <View style={s.totalsSection}>
          <View style={s.totalsRow}>
            <Text style={s.totalsLabel}>Subtotaal</Text>
            <Text style={s.totalsValue}>{formatCurrencyPdf(offerte.subtotaal)}</Text>
          </View>
          <View style={s.totalsRow}>
            <Text style={s.totalsLabel}></Text>
            <Text style={s.totalsValue}>{formatCurrencyPdf(0)}</Text>
          </View>
          <View style={s.totalsRow}>
            <Text style={s.totalsLabel}>Totaal excl. BTW</Text>
            <Text style={s.totalsValue}>{formatCurrencyPdf(offerte.subtotaal)}</Text>
          </View>
          {Object.entries(btwGroepen).map(([perc, bedrag]) => (
            <View key={perc} style={s.totalsRow}>
              <Text style={s.totalsLabel}>BTW {perc}%</Text>
              <Text style={s.totalsValue}>{formatCurrencyPdf(bedrag)}</Text>
            </View>
          ))}
          <View style={s.totalsFinal}>
            <Text style={s.totalsFinalLabel}>Totaal bedrag incl. BTW</Text>
            <Text style={s.totalsFinalValue}>{formatCurrencyPdf(offerte.totaal)}</Text>
          </View>
        </View>}

        {offerte.opmerkingen && (
          <View style={s.remarksSection}>
            <Text style={s.remarksLabel}>Opmerkingen</Text>
            <Text style={s.remarksText}>{offerte.opmerkingen}</Text>
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
      </Page>}

      {/* ====== KOZIJN TEKENING PAGINA'S ====== */}
      {(offerte.kozijnElementen || []).map((element, idx) => {
        const realPages = element.tekeningUrls && element.tekeningUrls.length > 0
          ? element.tekeningUrls
          : element.tekeningUrl
            ? [{ url: element.tekeningUrl, pageIndex: 0, totalPages: 1 }]
            : []
        // Als er geen tekening is, render toch een element-specs pagina zonder afbeelding
        const pages = realPages.length > 0 ? realPages : [{ url: '', pageIndex: 0, totalPages: 1 }]

        return (
          <React.Fragment key={`kozijn-${idx}`}>
            {pages.map((pg, pi) => (
              <Page key={`kozijn-${idx}-p${pi}`} size="A4" style={[s.page, { paddingTop: 30, paddingBottom: 50, paddingLeft: 30, paddingRight: 30, display: 'flex', flexDirection: 'column' }]} wrap={false}>
                <View style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 4, backgroundColor: COLORS.green }} />

                <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 10, marginTop: 6 }}>
                  <View style={{ flex: 1, paddingRight: 12 }}>
                    <Text style={s.elementNameText}>
                      {element.naam.toUpperCase()}
                      {element.hoeveelheid > 1 ? ` (${element.hoeveelheid}x)` : ''}
                    </Text>
                    <Text style={s.elementSubText}>
                      {[element.systeem, element.afmetingen].filter(Boolean).join(' \u00B7 ')}
                    </Text>
                  </View>
                  <Image src={logoPath} style={{ width: 90, height: 'auto' }} />
                </View>

                {pg.totalPages > 1 && (
                  <Text style={s.pageIndicator}>Pagina {pg.pageIndex + 1}/{pg.totalPages}</Text>
                )}

                {pg.url && (
                  <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', marginBottom: 6, overflow: 'hidden' }}>
                    <Image src={pg.url} style={{ width: '100%', height: '100%', objectFit: 'contain' }} />
                  </View>
                )}

                {/* Verkoopprijs in groene letters (alleen op eerste pagina) */}
                {pi === 0 && element.prijs > 0 && (
                  <View style={{ alignItems: 'flex-end', marginBottom: 6 }} wrap={false}>
                    <Text style={{ fontSize: 13, fontFamily: 'Helvetica-Bold', color: COLORS.green }}>
                      {element.hoeveelheid > 1
                        ? `${element.hoeveelheid}x ${formatCurrencyPdf(element.prijs)} = ${formatCurrencyPdf(element.hoeveelheid * element.prijs)}`
                        : formatCurrencyPdf(element.prijs)
                      }
                    </Text>
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

      {/* ====== SAMENVATTING + VOORWAARDEN (alleen als er kozijnelementen zijn) ====== */}
      {kozijnen.length > 0 && (
        <Page size="A4" style={[s.page, { paddingTop: 40, paddingBottom: 60, paddingLeft: 50, paddingRight: 50 }]} wrap={false}>
          <View style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 4, backgroundColor: COLORS.green }} />

          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 24 }}>
            <Text style={{ fontSize: 16, fontFamily: 'Helvetica-Bold', color: COLORS.text, letterSpacing: 1 }}>TOTAALOVERZICHT</Text>
            <Image src={logoPath} style={{ width: 110, height: 'auto' }} />
          </View>

          {/* Totalen */}
          <View style={{ marginBottom: 20 }}>
            {/* Element overzicht tabel */}
            <View style={{ borderWidth: 0.5, borderColor: '#D1D5DB', borderRadius: 4, marginBottom: 12 }}>
              <View style={{ flexDirection: 'row', backgroundColor: '#F3F4F6', borderBottomWidth: 0.5, borderBottomColor: '#D1D5DB', paddingVertical: 5, paddingHorizontal: 8 }}>
                <Text style={{ fontSize: 7.5, fontFamily: 'Helvetica-Bold', color: COLORS.text, flex: 3 }}>Element</Text>
                <Text style={{ fontSize: 7.5, fontFamily: 'Helvetica-Bold', color: COLORS.text, flex: 2 }}>Systeem</Text>
                <Text style={{ fontSize: 7.5, fontFamily: 'Helvetica-Bold', color: COLORS.text, width: 30, textAlign: 'center' }}>Hvh</Text>
              </View>
              {kozijnen.map((el, i) => (
                <View key={`sum-${i}`} style={{ flexDirection: 'row', borderBottomWidth: i < kozijnen.length - 1 ? 0.5 : 0, borderBottomColor: '#E5E7EB', paddingVertical: 4, paddingHorizontal: 8 }}>
                  <Text style={{ fontSize: 7.5, color: COLORS.text, flex: 3 }}>{el.naam}{el.type ? ` (${el.type})` : ''}</Text>
                  <Text style={{ fontSize: 7.5, color: COLORS.text, flex: 2 }}>{el.systeem}</Text>
                  <Text style={{ fontSize: 7.5, color: COLORS.text, width: 30, textAlign: 'center' }}>{el.hoeveelheid}</Text>
                </View>
              ))}
            </View>

            <View style={s.totalsSection}>
              <View style={s.totalsRow}>
                <Text style={s.totalsLabel}>Totaal excl. BTW</Text>
                <Text style={s.totalsValue}>{formatCurrencyPdf(kozijnTotaalExcl)}</Text>
              </View>
              <View style={s.totalsRow}>
                <Text style={s.totalsLabel}>BTW 21%</Text>
                <Text style={s.totalsValue}>{formatCurrencyPdf(kozijnBtw)}</Text>
              </View>
              <View style={s.totalsFinal}>
                <Text style={s.totalsFinalLabel}>Totaal incl. BTW</Text>
                <Text style={s.totalsFinalValue}>{formatCurrencyPdf(kozijnTotaalIncl)}</Text>
              </View>
            </View>

            <View style={{ flexDirection: 'row', justifyContent: 'flex-end', gap: 30, marginTop: 10 }}>
              {kozijnTotaalGewicht > 0 && (
                <View style={{ flexDirection: 'row' }}>
                  <Text style={{ fontSize: 9, fontFamily: 'Helvetica-Bold', color: COLORS.text }}>Totaal gewicht: </Text>
                  <Text style={{ fontSize: 9, color: COLORS.text }}>{kozijnTotaalGewicht.toFixed(1).replace('.', ',')} Kg</Text>
                </View>
              )}
              {kozijnTotaalOmtrek > 0 && (
                <View style={{ flexDirection: 'row' }}>
                  <Text style={{ fontSize: 9, fontFamily: 'Helvetica-Bold', color: COLORS.text }}>Totale omtrek: </Text>
                  <Text style={{ fontSize: 9, color: COLORS.text }}>{(kozijnTotaalOmtrek / 1000).toFixed(2).replace('.', ',')} m</Text>
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
      )}

      {/* ====== ACHTERPAGINA — fris, wit met groene accent ====== */}
      <Page size="A4" style={[s.page, { padding: 0, backgroundColor: '#FFFFFF' }]}>
        <View style={{ width: '100%', height: '100%', position: 'relative', alignItems: 'center' }}>
          {/* Top groene accent */}
          <View style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 6, backgroundColor: COLORS.green }} />

          {/* Logo + bedankje */}
          <View style={{ marginTop: 240, alignItems: 'center' }}>
            <Image src={logoPath} style={{ width: 220, height: 'auto' }} />
            <Text style={{ fontSize: 11, color: COLORS.textLight, marginTop: 10, letterSpacing: 2 }}>MAKEN HET VERSCHIL</Text>
          </View>

          <View style={{ marginTop: 80, alignItems: 'center' }}>
            <Text style={{ fontSize: 22, fontFamily: 'Helvetica-Bold', color: COLORS.text, letterSpacing: 1 }}>Bedankt voor uw vertrouwen</Text>
            <View style={{ width: 60, height: 3, backgroundColor: COLORS.green, marginTop: 14 }} />
            <Text style={{ fontSize: 11, color: COLORS.textLight, marginTop: 18, textAlign: 'center', maxWidth: 360, lineHeight: 1.6 }}>
              We kijken er naar uit om samen dit project te realiseren. Heeft u vragen over deze offerte? Neem gerust contact met ons op.
            </Text>
          </View>

          {/* Footer company info */}
          <View style={{ position: 'absolute', bottom: 50, left: 50, right: 50, alignItems: 'center' }}>
            <View style={{ width: '100%', height: 0.5, backgroundColor: '#E5E7EB', marginBottom: 16 }} />
            <Text style={{ fontSize: 10, fontFamily: 'Helvetica-Bold', color: COLORS.green, letterSpacing: 1 }}>{COMPANY.naam.toUpperCase()}</Text>
            <Text style={{ fontSize: 9, color: COLORS.textLight, marginTop: 6 }}>{COMPANY.adres} · {COMPANY.postcode} {COMPANY.plaats}</Text>
            <Text style={{ fontSize: 9, color: COLORS.textLight, marginTop: 2 }}>{COMPANY.telefoon} · {COMPANY.email} · {COMPANY.website}</Text>
            <Text style={{ fontSize: 8, color: COLORS.textLight, marginTop: 8 }}>BTW {COMPANY.btw} · KVK {COMPANY.kvk} · IBAN {COMPANY.iban}</Text>
          </View>
        </View>
      </Page>
    </Document>
  )
}
