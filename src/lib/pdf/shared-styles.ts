import { StyleSheet } from '@react-pdf/renderer'

export const COLORS = {
  black: '#000000',
  green: '#00a66e',
  white: '#FFFFFF',
  gray: '#6B7280',
  lightGray: '#F3F4F6',
  text: '#111827',
  textLight: '#6B7280',
}

export const COMPANY = {
  naam: 'Rebu kozijnen B.V.',
  adres: 'Samsonweg 26F',
  postcode: '1521 RM',
  plaats: 'Wormerveer',
  telefoon: '+31 6 58 86 60 70',
  email: 'info@rebukozijnen.nl',
  website: 'www.rebukozijnen.nl',
  btw: 'NL 865 427 926 B01',
  kvk: '907 204 74',
  iban: 'NL80 INGB 0675 6102 73',
}

export const sharedStyles = StyleSheet.create({
  page: {
    fontFamily: 'Helvetica',
    fontSize: 10,
    color: COLORS.text,
  },

  // === COVER PAGE (uses background image) ===
  coverBottomBar: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    height: 80,
    backgroundColor: COLORS.green,
    display: 'flex',
    flexDirection: 'column',
    justifyContent: 'center',
    paddingHorizontal: 30,
  },
  // Full-page background image
  fullPageBg: {
    position: 'absolute',
    top: 0,
    left: 0,
    width: '100%',
    height: '100%',
  },

  // === CONTENT PAGE ===
  contentPage: {
    position: 'relative',
    paddingTop: 40,
    paddingBottom: 80,
    paddingLeft: 50,
    paddingRight: 50,
  },
  contentSidebar: {
    position: 'absolute',
    top: 0,
    right: 0,
    width: 45,
    height: '100%',
    backgroundColor: COLORS.black,
  },

  // Logo top-right
  logoArea: {
    position: 'absolute',
    top: 30,
    right: 60,
    textAlign: 'right',
  },
  logoRebu: {
    fontSize: 20,
    fontFamily: 'Helvetica-Bold',
    color: COLORS.black,
    letterSpacing: 2,
  },
  logoKozijnen: {
    fontSize: 20,
    fontFamily: 'Helvetica-Bold',
    color: COLORS.green,
    letterSpacing: 1,
  },
  logoSlogan: {
    fontSize: 8,
    color: COLORS.textLight,
    marginTop: 1,
  },

  // Client info
  clientSection: {
    marginBottom: 30,
    maxWidth: 250,
  },
  clientName: {
    fontSize: 12,
    fontFamily: 'Helvetica-Bold',
    color: COLORS.text,
    marginBottom: 3,
  },
  clientDetail: {
    fontSize: 10,
    color: COLORS.text,
    marginBottom: 2,
  },

  // Offerte meta info
  metaSection: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 40,
    marginTop: 20,
  },
  metaLeft: {},
  metaRight: {},
  metaLine: {
    fontSize: 9,
    color: COLORS.text,
    marginBottom: 3,
  },
  metaLabel: {
    fontFamily: 'Helvetica-Bold',
  },

  // Table
  table: {
    marginBottom: 10,
  },
  tableHeader: {
    flexDirection: 'row',
    borderBottomWidth: 1,
    borderBottomColor: '#D1D5DB',
    paddingBottom: 6,
    marginBottom: 4,
  },
  tableRow: {
    flexDirection: 'row',
    paddingVertical: 5,
  },
  tableColAantal: { width: 40 },
  tableColEenheid: { width: 50 },
  tableColDesc: { flex: 1 },
  tableColBedrag: { width: 80, textAlign: 'right' },
  tableColKorting: { width: 60, textAlign: 'right' },
  tableColTotaal: { width: 80, textAlign: 'right' },
  tableHeaderText: {
    fontSize: 8,
    fontFamily: 'Helvetica-Bold',
    color: COLORS.text,
  },
  tableCellText: {
    fontSize: 9,
    color: COLORS.text,
  },

  // Totals
  totalsSection: {
    alignItems: 'flex-end',
    marginTop: 15,
  },
  totalsRow: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    width: 220,
    paddingVertical: 3,
  },
  totalsLabel: {
    flex: 1,
    fontSize: 9,
    color: COLORS.text,
    textAlign: 'right',
    paddingRight: 15,
    fontFamily: 'Helvetica-Bold',
  },
  totalsValue: {
    width: 80,
    fontSize: 9,
    textAlign: 'right',
    color: COLORS.text,
  },
  totalsFinal: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    width: 220,
    paddingVertical: 6,
    borderTopWidth: 1,
    borderTopColor: COLORS.text,
    marginTop: 4,
  },
  totalsFinalLabel: {
    flex: 1,
    fontSize: 10,
    fontFamily: 'Helvetica-Bold',
    color: COLORS.text,
    textAlign: 'right',
    paddingRight: 15,
  },
  totalsFinalValue: {
    width: 80,
    fontSize: 10,
    fontFamily: 'Helvetica-Bold',
    textAlign: 'right',
    color: COLORS.text,
  },

  // Footer
  footer: {
    position: 'absolute',
    bottom: 25,
    left: 50,
    right: 60,
    flexDirection: 'row',
    justifyContent: 'space-between',
    borderTopWidth: 0.5,
    borderTopColor: '#D1D5DB',
    paddingTop: 10,
  },
  footerCol: {
    flex: 1,
  },
  footerLabel: {
    fontSize: 7,
    fontFamily: 'Helvetica-Bold',
    color: COLORS.text,
  },
  footerText: {
    fontSize: 7,
    color: COLORS.textLight,
    marginTop: 1,
  },

  // Watermark (RK icon image)
  watermarkImage: {
    position: 'absolute',
    top: '28%',
    left: '22%',
    width: 280,
    height: 'auto',
    opacity: 0.06,
  },

  // Kozijn element pages
  elementHeaderBar: {
    backgroundColor: COLORS.green,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 4,
    marginBottom: 10,
    maxWidth: 280,
  },
  elementHeaderTitle: {
    fontSize: 13,
    fontFamily: 'Helvetica-Bold',
    color: '#FFFFFF',
    letterSpacing: 1,
  },
  elementHeaderSub: {
    fontSize: 8,
    color: '#FFFFFF',
    marginTop: 1,
  },
  // Clean element name (no green bar)
  elementNameText: {
    fontSize: 12,
    fontFamily: 'Helvetica-Bold',
    color: '#111827',
    letterSpacing: 0.5,
  },
  elementSubText: {
    fontSize: 8,
    color: '#6B7280',
    marginTop: 2,
    marginBottom: 8,
  },
  elementPriceBelow: {
    fontSize: 13,
    fontFamily: 'Helvetica-Bold',
    color: COLORS.green,
  },
  elementImage: {
    maxWidth: '100%',
    maxHeight: 460,
    objectFit: 'contain' as const,
    marginBottom: 10,
  },
  // Full-page element image (used when specs are on separate page)
  elementImageFullPage: {
    width: '100%',
    height: 760,
    objectFit: 'contain' as const,
    marginBottom: 10,
  },
  // Page indicator for multi-page elements
  pageIndicator: {
    fontSize: 8,
    color: '#6B7280',
    textAlign: 'right' as const,
    marginBottom: 4,
  },
  specsTable: {
    backgroundColor: '#F3F4F6',
    borderRadius: 4,
    padding: 12,
  },
  specsTitle: {
    fontSize: 9,
    fontFamily: 'Helvetica-Bold',
    color: '#6B7280',
    marginBottom: 8,
    textTransform: 'uppercase' as const,
    letterSpacing: 1,
  },
  specsRow: {
    flexDirection: 'row',
    paddingVertical: 3,
    borderBottomWidth: 0.5,
    borderBottomColor: '#D1D5DB',
  },
  specsLabel: {
    width: 100,
    fontSize: 8,
    fontFamily: 'Helvetica-Bold',
    color: '#111827',
  },
  specsValue: {
    flex: 1,
    fontSize: 8,
    color: '#111827',
  },
  // Separate specs page styles
  specsPageTable: {
    backgroundColor: '#F9FAFB',
    borderRadius: 6,
    padding: 16,
    borderWidth: 0.5,
    borderColor: '#E5E7EB',
  },
  specsPageRow: {
    flexDirection: 'row',
    paddingVertical: 5,
    paddingHorizontal: 8,
    borderBottomWidth: 0.5,
    borderBottomColor: '#E5E7EB',
  },
  specsPageRowAlt: {
    flexDirection: 'row',
    paddingVertical: 5,
    paddingHorizontal: 8,
    borderBottomWidth: 0.5,
    borderBottomColor: '#E5E7EB',
    backgroundColor: '#F3F4F6',
  },
  specsPageLabel: {
    width: 140,
    fontSize: 9,
    fontFamily: 'Helvetica-Bold',
    color: '#374151',
  },
  specsPageValue: {
    flex: 1,
    fontSize: 9,
    color: '#111827',
  },

  // Remarks
  remarksSection: {
    marginTop: 20,
    padding: 12,
    backgroundColor: COLORS.lightGray,
    borderRadius: 4,
  },
  remarksLabel: {
    fontSize: 8,
    fontFamily: 'Helvetica-Bold',
    color: COLORS.textLight,
    marginBottom: 4,
    textTransform: 'uppercase',
  },
  remarksText: {
    fontSize: 9,
    color: COLORS.text,
    lineHeight: 1.5,
  },

})

export function formatCurrencyPdf(amount: number): string {
  return new Intl.NumberFormat('nl-NL', { style: 'currency', currency: 'EUR' }).format(amount)
}

export function formatDatePdf(date: string): string {
  return new Date(date).toLocaleDateString('nl-NL', { day: '2-digit', month: '2-digit', year: 'numeric' })
}
