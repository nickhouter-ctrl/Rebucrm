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
}

export function OfferteDocument({ offerte }: { offerte: OfferteData }) {
  const regels = offerte.regels || []
  const relatie = offerte.relatie

  return (
    <Document>
      {/* Pagina 1: Cover */}
      <Page size="A4" style={[s.page, { padding: 0 }]}>
        <View style={s.coverPage}>
          <Text style={s.coverMonogram}>RK</Text>
          <View style={s.coverLine} />
          <Text style={s.coverTitle}>OFFERTE</Text>
          {relatie && <Text style={s.coverSubtitle}>{relatie.bedrijfsnaam}</Text>}
          <Text style={s.coverDate}>
            {formatDatePdf(offerte.datum)}
            {offerte.versie_nummer && offerte.versie_nummer > 1 ? ` - Versie ${offerte.versie_nummer}` : ''}
          </Text>
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

        {/* Klant + Offerte info */}
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
            <Text style={s.infoLabel}>Offerte</Text>
            <Text style={s.infoValueBold}>{offerte.offertenummer}</Text>
            <Text style={s.infoValue}>Datum: {formatDatePdf(offerte.datum)}</Text>
            {offerte.geldig_tot && <Text style={s.infoValue}>Geldig tot: {formatDatePdf(offerte.geldig_tot)}</Text>}
            {offerte.versie_nummer && offerte.versie_nummer > 1 && (
              <Text style={s.infoValue}>Versie: {offerte.versie_nummer}</Text>
            )}
          </View>
        </View>

        {/* Onderwerp */}
        {offerte.onderwerp && (
          <View style={{ marginBottom: 15 }}>
            <Text style={{ fontSize: 12, fontFamily: 'Helvetica-Bold', color: COLORS.text }}>
              {offerte.onderwerp}
            </Text>
          </View>
        )}

        {/* Inleiding */}
        {offerte.inleiding && (
          <View style={{ marginBottom: 15 }}>
            <Text style={{ fontSize: 9, color: COLORS.text, lineHeight: 1.5 }}>{offerte.inleiding}</Text>
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
            <Text style={s.totalsValue}>{formatCurrencyPdf(offerte.subtotaal)}</Text>
          </View>
          <View style={s.totalsRow}>
            <Text style={s.totalsLabel}>BTW</Text>
            <Text style={s.totalsValue}>{formatCurrencyPdf(offerte.btw_totaal)}</Text>
          </View>
          <View style={s.totalsFinal}>
            <Text style={s.totalsFinalLabel}>Totaal</Text>
            <Text style={s.totalsFinalValue}>{formatCurrencyPdf(offerte.totaal)}</Text>
          </View>
        </View>

        {/* Opmerkingen */}
        {offerte.opmerkingen && (
          <View style={s.remarksSection}>
            <Text style={s.remarksLabel}>Opmerkingen</Text>
            <Text style={s.remarksText}>{offerte.opmerkingen}</Text>
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
