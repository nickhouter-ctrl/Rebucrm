import React from 'react'
import { Document, Page, Text, View } from '@react-pdf/renderer'
import { sharedStyles as s, COMPANY, COLORS, formatCurrencyPdf, formatDatePdf } from './shared-styles'

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

export function FactuurDocument({ factuur }: { factuur: FactuurData }) {
  const regels = factuur.regels || []
  const relatie = factuur.relatie

  return (
    <Document>
      {/* Pagina 1: Cover */}
      <Page size="A4" style={[s.page, { padding: 0 }]}>
        <View style={s.coverPage}>
          <Text style={s.coverMonogram}>RK</Text>
          <View style={s.coverLine} />
          <Text style={s.coverTitle}>FACTUUR</Text>
          {relatie && <Text style={s.coverSubtitle}>{relatie.bedrijfsnaam}</Text>}
          <Text style={s.coverDate}>{formatDatePdf(factuur.datum)}</Text>
        </View>
      </Page>

      {/* Pagina 2+: Inhoud */}
      <Page size="A4" style={[s.page, s.contentPage]}>
        {/* Header */}
        <View style={s.header}>
          <View style={s.headerLeft}>
            <Text style={s.companyName}>{COMPANY.naam}</Text>
            <Text style={s.companyDetail}>{COMPANY.adres}</Text>
            <Text style={s.companyDetail}>{COMPANY.postcode} {COMPANY.plaats}</Text>
            <Text style={s.companyDetail}>{COMPANY.telefoon}</Text>
          </View>
          <View style={s.headerRight}>
            <Text style={s.companyDetail}>{COMPANY.email}</Text>
            <Text style={s.companyDetail}>{COMPANY.website}</Text>
            <Text style={s.companyDetail}>KVK: {COMPANY.kvk}</Text>
            <Text style={s.companyDetail}>BTW: {COMPANY.btw}</Text>
          </View>
        </View>

        {/* Klant + Factuur info */}
        <View style={s.infoSection}>
          <View style={s.infoBlock}>
            <Text style={s.infoLabel}>Aan</Text>
            {relatie ? (
              <>
                <Text style={s.infoValueBold}>{relatie.bedrijfsnaam}</Text>
                {relatie.contactpersoon && <Text style={s.infoValue}>t.a.v. {relatie.contactpersoon}</Text>}
                {relatie.adres && <Text style={s.infoValue}>{relatie.adres}</Text>}
                {(relatie.postcode || relatie.plaats) && (
                  <Text style={s.infoValue}>{[relatie.postcode, relatie.plaats].filter(Boolean).join(' ')}</Text>
                )}
              </>
            ) : (
              <Text style={s.infoValue}>-</Text>
            )}
          </View>
          <View style={[s.infoBlock, { alignItems: 'flex-end' }]}>
            <Text style={s.infoLabel}>Factuur</Text>
            <Text style={s.infoValueBold}>{factuur.factuurnummer}</Text>
            <Text style={s.infoValue}>Factuurdatum: {formatDatePdf(factuur.datum)}</Text>
            {factuur.vervaldatum && <Text style={s.infoValue}>Vervaldatum: {formatDatePdf(factuur.vervaldatum)}</Text>}
          </View>
        </View>

        {/* Onderwerp */}
        {factuur.onderwerp && (
          <View style={{ marginBottom: 15 }}>
            <Text style={{ fontSize: 12, fontFamily: 'Helvetica-Bold', color: COLORS.text }}>
              {factuur.onderwerp}
            </Text>
          </View>
        )}

        {/* Regels tabel */}
        <View style={s.table}>
          <View style={s.tableHeader}>
            <View style={s.tableColDesc}><Text style={s.tableHeaderText}>Omschrijving</Text></View>
            <View style={s.tableColAantal}><Text style={s.tableHeaderText}>Aantal</Text></View>
            <View style={s.tableColPrijs}><Text style={s.tableHeaderText}>Prijs</Text></View>
            <View style={s.tableColBtw}><Text style={s.tableHeaderText}>BTW</Text></View>
            <View style={s.tableColTotaal}><Text style={s.tableHeaderText}>Totaal</Text></View>
          </View>
          {regels.map((regel, i) => (
            <View key={i} style={s.tableRow}>
              <View style={s.tableColDesc}><Text style={s.tableCellText}>{regel.omschrijving}</Text></View>
              <View style={s.tableColAantal}><Text style={s.tableCellText}>{regel.aantal}</Text></View>
              <View style={s.tableColPrijs}><Text style={s.tableCellText}>{formatCurrencyPdf(regel.prijs)}</Text></View>
              <View style={s.tableColBtw}><Text style={s.tableCellText}>{regel.btw_percentage}%</Text></View>
              <View style={s.tableColTotaal}><Text style={s.tableCellText}>{formatCurrencyPdf(regel.totaal)}</Text></View>
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
            <Text style={s.totalsLabel}>BTW</Text>
            <Text style={s.totalsValue}>{formatCurrencyPdf(factuur.btw_totaal)}</Text>
          </View>
          <View style={s.totalsFinal}>
            <Text style={s.totalsFinalLabel}>Totaal</Text>
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

        {/* Footer */}
        <View style={s.footer}>
          <Text style={s.footerText}>KVK: {COMPANY.kvk} | BTW: {COMPANY.btw}</Text>
          <Text style={s.footerText}>IBAN: {COMPANY.iban}</Text>
          <Text style={s.footerText}>{COMPANY.email} | {COMPANY.website}</Text>
        </View>
      </Page>
    </Document>
  )
}
