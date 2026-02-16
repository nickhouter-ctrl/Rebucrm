import { StyleSheet } from '@react-pdf/renderer'

export const COLORS = {
  black: '#000000',
  green: '#00C9A7',
  darkGreen: '#00A88A',
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
  // Cover page
  coverPage: {
    backgroundColor: COLORS.black,
    display: 'flex',
    flexDirection: 'column',
    justifyContent: 'center',
    alignItems: 'center',
    height: '100%',
    padding: 60,
  },
  coverMonogram: {
    fontSize: 120,
    fontFamily: 'Helvetica-Bold',
    color: COLORS.white,
    letterSpacing: 10,
    marginBottom: 20,
  },
  coverLine: {
    width: 80,
    height: 3,
    backgroundColor: COLORS.green,
    marginBottom: 30,
  },
  coverTitle: {
    fontSize: 28,
    fontFamily: 'Helvetica-Bold',
    color: COLORS.white,
    letterSpacing: 8,
    marginBottom: 20,
  },
  coverSubtitle: {
    fontSize: 14,
    color: COLORS.green,
    marginBottom: 6,
  },
  coverDate: {
    fontSize: 12,
    color: '#999999',
  },
  // Content page
  contentPage: {
    padding: 50,
    paddingTop: 40,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 30,
    paddingBottom: 15,
    borderBottomWidth: 2,
    borderBottomColor: COLORS.green,
  },
  headerLeft: {
    flex: 1,
  },
  headerRight: {
    textAlign: 'right',
  },
  companyName: {
    fontSize: 16,
    fontFamily: 'Helvetica-Bold',
    color: COLORS.text,
    marginBottom: 4,
  },
  companyDetail: {
    fontSize: 8,
    color: COLORS.textLight,
    marginBottom: 2,
  },
  // Info section
  infoSection: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 25,
  },
  infoBlock: {
    flex: 1,
  },
  infoLabel: {
    fontSize: 8,
    color: COLORS.textLight,
    marginBottom: 4,
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  infoValue: {
    fontSize: 10,
    color: COLORS.text,
    marginBottom: 2,
  },
  infoValueBold: {
    fontSize: 11,
    fontFamily: 'Helvetica-Bold',
    color: COLORS.text,
    marginBottom: 2,
  },
  // Table
  table: {
    marginBottom: 20,
  },
  tableHeader: {
    flexDirection: 'row',
    backgroundColor: COLORS.lightGray,
    borderBottomWidth: 1,
    borderBottomColor: '#D1D5DB',
    paddingVertical: 8,
    paddingHorizontal: 8,
  },
  tableRow: {
    flexDirection: 'row',
    borderBottomWidth: 0.5,
    borderBottomColor: '#E5E7EB',
    paddingVertical: 6,
    paddingHorizontal: 8,
  },
  tableColDesc: { flex: 4 },
  tableColAantal: { flex: 1, textAlign: 'right' },
  tableColPrijs: { flex: 1.5, textAlign: 'right' },
  tableColBtw: { flex: 1, textAlign: 'right' },
  tableColTotaal: { flex: 1.5, textAlign: 'right' },
  tableHeaderText: {
    fontSize: 8,
    fontFamily: 'Helvetica-Bold',
    color: COLORS.textLight,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  tableCellText: {
    fontSize: 9,
    color: COLORS.text,
  },
  // Totals
  totalsSection: {
    alignItems: 'flex-end',
    marginTop: 10,
  },
  totalsRow: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    width: 200,
    paddingVertical: 3,
  },
  totalsLabel: {
    flex: 1,
    fontSize: 9,
    color: COLORS.textLight,
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
    width: 200,
    paddingVertical: 6,
    borderTopWidth: 1,
    borderTopColor: COLORS.text,
    marginTop: 4,
  },
  totalsFinalLabel: {
    flex: 1,
    fontSize: 11,
    fontFamily: 'Helvetica-Bold',
    color: COLORS.text,
  },
  totalsFinalValue: {
    width: 80,
    fontSize: 11,
    fontFamily: 'Helvetica-Bold',
    textAlign: 'right',
    color: COLORS.text,
  },
  // Footer
  footer: {
    position: 'absolute',
    bottom: 30,
    left: 50,
    right: 50,
    flexDirection: 'row',
    justifyContent: 'space-between',
    borderTopWidth: 0.5,
    borderTopColor: '#D1D5DB',
    paddingTop: 8,
  },
  footerText: {
    fontSize: 7,
    color: COLORS.textLight,
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
  return new Date(date).toLocaleDateString('nl-NL', { day: 'numeric', month: 'long', year: 'numeric' })
}
