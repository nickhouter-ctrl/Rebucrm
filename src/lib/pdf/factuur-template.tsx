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
  datum: string | null
  vervaldatum?: string | null
  status?: string | null
  onderwerp?: string | null
  subtotaal: number
  btw_totaal: number
  totaal: number
  betaald_bedrag: number
  opmerkingen?: string | null
  relatie?: Relatie | null
  regels?: Regel[]
  offerte?: { offertenummer: string | null } | null
}

const logoPath = path.join(process.cwd(), 'public', 'images', 'logo-rebu.png')

export function FactuurDocument({ factuur }: { factuur: FactuurData }) {
  const regels = factuur.regels || []
  const relatie = factuur.relatie
  const isConcept = factuur.status === 'concept'

  // Bereken BTW groepen
  const btwGroepen: Record<number, number> = {}
  regels.forEach(r => {
    const btwBedrag = (r.aantal * r.prijs * r.btw_percentage) / 100
    btwGroepen[r.btw_percentage] = (btwGroepen[r.btw_percentage] || 0) + btwBedrag
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

          {/* FACTUUR titel */}
          <View style={{ marginTop: 90, alignItems: 'center' }}>
            <Text style={{ fontSize: 34, fontFamily: 'Helvetica-Bold', color: COLORS.text, letterSpacing: 4 }}>
              {isConcept ? 'CONCEPT FACTUUR' : 'FACTUUR'}
            </Text>
            <View style={{ width: 60, height: 3, backgroundColor: COLORS.green, marginTop: 14 }} />
          </View>

          {/* Factuur info block */}
          <View style={{ marginTop: 40, alignItems: 'center' }}>
            {relatie && (
              <Text style={{ fontSize: 14, color: COLORS.text, marginBottom: 14 }}>
                Voor: <Text style={{ fontFamily: 'Helvetica-Bold' }}>{relatie.bedrijfsnaam}</Text>
              </Text>
            )}
            <Text style={{ fontSize: 10, color: COLORS.textLight, letterSpacing: 1 }}>
              FACTUURNUMMER · <Text style={{ color: COLORS.text, fontFamily: 'Helvetica-Bold' }}>{factuur.factuurnummer}</Text>
            </Text>
            {!isConcept && factuur.datum && (
              <Text style={{ fontSize: 10, color: COLORS.textLight, letterSpacing: 1, marginTop: 4 }}>
                FACTUURDATUM · <Text style={{ color: COLORS.text, fontFamily: 'Helvetica-Bold' }}>{formatDatePdf(factuur.datum)}</Text>
              </Text>
            )}
            {!isConcept && factuur.vervaldatum && (
              <Text style={{ fontSize: 10, color: COLORS.textLight, letterSpacing: 1, marginTop: 4 }}>
                VERVALDATUM · <Text style={{ color: COLORS.text, fontFamily: 'Helvetica-Bold' }}>{formatDatePdf(factuur.vervaldatum)}</Text>
              </Text>
            )}
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
      <Page size="A4" style={[s.page, { paddingTop: 40, paddingBottom: 60, paddingLeft: 50, paddingRight: 50 }]}>
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
              <Text style={s.metaLabel}>Factuurnummer: </Text>{factuur.factuurnummer}
            </Text>
            {!isConcept && factuur.datum && (
              <Text style={s.metaLine}>
                <Text style={s.metaLabel}>Factuurdatum: </Text>{formatDatePdf(factuur.datum)}
              </Text>
            )}
            {!isConcept && factuur.vervaldatum && (
              <Text style={s.metaLine}>
                <Text style={s.metaLabel}>Vervaldatum: </Text>{formatDatePdf(factuur.vervaldatum)}
              </Text>
            )}
            {factuur.offerte?.offertenummer && (
              <Text style={s.metaLine}>
                <Text style={s.metaLabel}>Offertenummer: </Text>{factuur.offerte.offertenummer}
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
              Heeft u vragen over deze factuur? Neem gerust contact met ons op.
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
