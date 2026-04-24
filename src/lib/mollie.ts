import createMollieClient from '@mollie/api-client'

let mollieClient: ReturnType<typeof createMollieClient> | null = null

export function getMollieClient() {
  if (!mollieClient) {
    // Trim evt. trailing newline/spaces — anders "is not a legal HTTP header value"
    const apiKey = (process.env.MOLLIE_API_KEY || '').trim().replace(/[\r\n]/g, '')
    if (!apiKey) {
      throw new Error('MOLLIE_API_KEY is niet geconfigureerd')
    }
    mollieClient = createMollieClient({ apiKey })
  }
  return mollieClient
}

/**
 * Maakt een Mollie Payment Link (id begint met `pl_`) die standaard 30 dagen
 * geldig is. Voorheen maakten we een reguliere Payment (`tr_…`) die na
 * ~15 min verloopt; voor facturen die klanten dagen later openen was dat
 * ongeschikt.
 */
export async function createMolliePayment(options: {
  amount: number
  description: string
  redirectUrl: string
  webhookUrl: string
  metadata?: Record<string, string>
  expiresInDays?: number
}) {
  const mollie = getMollieClient()
  const expiresInDays = options.expiresInDays ?? 30
  const expiresAt = new Date(Date.now() + expiresInDays * 24 * 60 * 60 * 1000)
    .toISOString()
    .replace(/\.\d{3}Z$/, 'Z')

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const link: any = await (mollie as any).paymentLinks.create({
    amount: {
      currency: 'EUR',
      value: options.amount.toFixed(2),
    },
    description: options.description,
    redirectUrl: options.redirectUrl,
    webhookUrl: options.webhookUrl,
    expiresAt,
    metadata: options.metadata,
  })

  const paymentUrl = (typeof link.getPaymentUrl === 'function' ? link.getPaymentUrl() : null)
    || link._links?.paymentLink?.href
    || link.paymentLink?.href
    || ''

  return {
    id: link.id as string,
    checkoutUrl: paymentUrl as string,
    status: link.paid ? 'paid' : 'open',
  }
}

/**
 * Status ophalen. Ondersteunt zowel nieuwe Payment Links (`pl_…`) als oude
 * Payments (`tr_…`) voor backwards-compat met facturen die eerder via de
 * Payments API zijn aangemaakt.
 */
export async function getMolliePaymentStatus(paymentId: string) {
  const mollie = getMollieClient()

  if (paymentId.startsWith('pl_')) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const link: any = await (mollie as any).paymentLinks.get(paymentId)
    // Pak de laatste succesvolle payment om exact bedrag + timestamp te hebben.
    let paidAt: Date | null = null
    let paidAmount = 0
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const payments: any = await (mollie as any).paymentLinkPayments?.list?.({ paymentLinkId: paymentId })
        || await (mollie as any).paymentLinks.getPayments?.(paymentId)
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const lijst = Array.isArray(payments) ? payments : (payments?.data || payments?.items || [])
      for (const p of lijst) {
        if (p.status === 'paid') {
          paidAt = p.paidAt ? new Date(p.paidAt) : paidAt
          paidAmount += parseFloat(p.amount?.value || '0')
        }
      }
    } catch { /* ignore: payment-link-payments is optional */ }
    return {
      id: link.id as string,
      status: (link.paid ? 'paid' : 'open') as string,
      amount: paidAmount > 0 ? paidAmount : parseFloat(link.amount?.value || '0'),
      paidAt,
    }
  }

  const payment = await mollie.payments.get(paymentId)
  return {
    id: payment.id,
    status: payment.status,
    amount: parseFloat(payment.amount.value),
    paidAt: payment.paidAt,
  }
}
