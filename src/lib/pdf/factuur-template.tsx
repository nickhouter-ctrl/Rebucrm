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

interface FactuurData {
  factuurnummer: string
  datum: string
  vervaldatum?: string | null
  onderwerp?: string | null
  subtotaal: number
  btw_totaal: number
  totaal: number
  betaald_bedrag: number
  opmerkingen?: string | null
  relatie?: Relatie | null
  regels?: Regel[]
}

const logoPath = path.join(process.cwd(), 'public', 'images', 'logo-rebu.png')

export function FactuurDocument({ factuur }: { factuur: FactuurData }) {
  const regels = factuur.regels || []
  const relatie = factuur.relatie

  // Bereken BTW groepen
  const btwGroepen: Record<number, number> = {}
  regels.forEach(r => {
    const btwBedrag = (r.aantal * r.prijs * r.btw_percentage) / 100
    btwGroepen[r.btw_percentage] = (btwGroepen[r.btw_percentage] || 0) + btwBedrag
  })

  return (
    <Document>
      {/* ====== PAGINA 1: COVER ====== */}
      <Page size="A4" style={[s.page, { padding: 0 }]}>
        <View style={s.coverPage}>
          {/* Linker helft: zwart met logo tekst */}
          <View style={s.coverLeft}>
            <View style={{ alignItems: 'center' }}>
              <Text style={s.coverRebu}>REBU</Text>
              <Text style={s.coverKozijnen}>KOZIJNEN</Text>
              <Text style={s.coverSlogan}>Maken het verschil.</Text>
            </View>
          </View>

          {/* Rechter helft: wit met RK icoon */}
          <View style={s.coverRight}>
            <Text style={s.coverRkIcon}>RK</Text>
          </View>
        </View>

        {/* Groene balk onderaan */}
        <View style={s.coverBottomBar}>
          <View style={{ flexDirection: 'row', gap: 40 }}>
            <View>
              <Text style={s.coverBottomLabel}>FACTUURNUMMER:</Text>
              <Text style={s.coverBottomValue}>{factuur.factuurnummer}</Text>
            </View>
            <View>
              <Text style={s.coverBottomLabel}>FACTUURDATUM:</Text>
              <Text style={s.coverBottomValue}>{formatDatePdf(factuur.datum)}</Text>
            </View>
            {factuur.vervaldatum && (
              <View>
                <Text style={s.coverBottomLabel}>VERVALDATUM:</Text>
                <Text style={s.coverBottomValue}>{formatDatePdf(factuur.vervaldatum)}</Text>
              </View>
            )}
          </View>
        </View>
      </Page>

      {/* ====== PAGINA 2: INHOUD ====== */}
      <Page size="A4" style={[s.page, s.contentPage]}>
        {/* Zwarte sidebar rechts */}
        <View style={s.contentSidebar} />

        {/* Watermark RK */}
        <Text style={s.watermark}>RK</Text>

        {/* Logo rechts boven */}
        <View style={s.logoArea}>
          <Image src={logoPath} style={{ width: 160, height: 'auto' }} />
        </View>

        {/* Klantgegevens links boven */}
        <View style={s.clientSection}>
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

        {/* Meta info: factuur details */}
        <View style={s.metaSection}>
          <View style={s.metaLeft}>
            <Text style={s.metaLine}>
              <Text style={s.metaLabel}>Factuurnummer: </Text>{factuur.factuurnummer}
            </Text>
            <Text style={s.metaLine}>
              <Text style={s.metaLabel}>Factuurdatum: </Text>{formatDatePdf(factuur.datum)}
            </Text>
            {factuur.vervaldatum && (
              <Text style={s.metaLine}>
                <Text style={s.metaLabel}>Vervaldatum: </Text>{formatDatePdf(factuur.vervaldatum)}
              </Text>
            )}
          </View>
          <View style={s.metaRight}>
            {factuur.onderwerp && (
              <Text style={s.metaLine}>
                <Text style={s.metaLabel}>Referentie: </Text>{factuur.onderwerp}
              </Text>
            )}
          </View>
        </View>

        {/* Regels tabel */}
        <View style={s.table}>
          <View style={s.tableHeader}>
            <View style={s.tableColAantal}><Text style={s.tableHeaderText}>Aantal</Text></View>
            <View style={s.tableColEenheid}><Text style={s.tableHeaderText}>Eenheid</Text></View>
            <View style={s.tableColDesc}><Text style={s.tableHeaderText}>Omschrijving</Text></View>
            <View style={s.tableColBedrag}><Text style={s.tableHeaderText}>Bedrag</Text></View>
            <View style={s.tableColKorting}><Text style={s.tableHeaderText}>Korting</Text></View>
            <View style={s.tableColTotaal}><Text style={s.tableHeaderText}>Totaal</Text></View>
          </View>
          {regels.map((regel, i) => (
            <View key={i} style={s.tableRow}>
              <View style={s.tableColAantal}><Text style={s.tableCellText}>{regel.aantal}</Text></View>
              <View style={s.tableColEenheid}><Text style={s.tableCellText}>Stuk</Text></View>
              <View style={s.tableColDesc}><Text style={s.tableCellText}>{regel.omschrijving}</Text></View>
              <View style={s.tableColBedrag}><Text style={s.tableCellText}>{formatCurrencyPdf(regel.prijs)}</Text></View>
              <View style={s.tableColKorting}><Text style={s.tableCellText}>0%</Text></View>
              <View style={s.tableColTotaal}><Text style={s.tableCellText}>{formatCurrencyPdf(regel.aantal * regel.prijs)}</Text></View>
            </View>
          ))}
        </View>

        {/* Totalen */}
        <View style={s.totalsSection}>
          <View style={s.totalsRow}>
            <Text style={s.totalsLabel}>Subtotaal</Text>
            <Text style={s.totalsValue}>{formatCurrencyPdf(factuur.subtotaal)}</Text>
          </View>
          <View style={s.totalsRow}>
            <Text style={s.totalsLabel}></Text>
            <Text style={s.totalsValue}>{formatCurrencyPdf(0)}</Text>
          </View>
          <View style={s.totalsRow}>
            <Text style={s.totalsLabel}>Totaal excl. BTW</Text>
            <Text style={s.totalsValue}>{formatCurrencyPdf(factuur.subtotaal)}</Text>
          </View>
          {Object.entries(btwGroepen).map(([perc, bedrag]) => (
            <View key={perc} style={s.totalsRow}>
              <Text style={s.totalsLabel}>BTW {perc}%</Text>
              <Text style={s.totalsValue}>{formatCurrencyPdf(bedrag)}</Text>
            </View>
          ))}
          <View style={s.totalsFinal}>
            <Text style={s.totalsFinalLabel}>Totaal bedrag incl. BTW</Text>
            <Text style={s.totalsFinalValue}>{formatCurrencyPdf(factuur.totaal)}</Text>
          </View>
        </View>

        {/* Betaalinformatie */}
        <View style={{ marginTop: 20, padding: 12, backgroundColor: '#F0FDF4', borderRadius: 4 }}>
          <Text style={{ fontSize: 8, fontFamily: 'Helvetica-Bold', color: '#166534', marginBottom: 4, textTransform: 'uppercase' }}>
            Betaalinformatie
          </Text>
          <Text style={{ fontSize: 9, color: '#166534', marginBottom: 2 }}>
            Gelieve het bedrag van {formatCurrencyPdf(factuur.totaal)} over te maken op:
          </Text>
          <Text style={{ fontSize: 9, color: '#166534', fontFamily: 'Helvetica-Bold' }}>
            IBAN: {COMPANY.iban} t.n.v. {COMPANY.naam}
          </Text>
          <Text style={{ fontSize: 9, color: '#166534', marginTop: 2 }}>
            Onder vermelding van factuurnummer: {factuur.factuurnummer}
          </Text>
        </View>

        {/* Opmerkingen */}
        {factuur.opmerkingen && (
          <View style={s.remarksSection}>
            <Text style={s.remarksLabel}>Opmerkingen</Text>
            <Text style={s.remarksText}>{factuur.opmerkingen}</Text>
          </View>
        )}

        {/* Footer met bedrijfsgegevens */}
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

      {/* ====== PAGINA 3: ACHTERPAGINA MET CONTACTGEGEVENS ====== */}
      <Page size="A4" style={[s.page, { padding: 0, backgroundColor: COLORS.black }]}>
        <View style={{ flex: 1, justifyContent: 'flex-end' }}>
          {/* Groene balk onderaan */}
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
