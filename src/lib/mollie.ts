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

export async function createMolliePayment(options: {
  amount: number
  description: string
  redirectUrl: string
  webhookUrl: string
  metadata?: Record<string, string>
}) {
  const mollie = getMollieClient()

  const payment = await mollie.payments.create({
    amount: {
      currency: 'EUR',
      value: options.amount.toFixed(2),
    },
    description: options.description,
    redirectUrl: options.redirectUrl,
    webhookUrl: options.webhookUrl,
    metadata: options.metadata,
  })

  return {
    id: payment.id,
    checkoutUrl: payment.getCheckoutUrl(),
    status: payment.status,
  }
}

export async function getMolliePaymentStatus(paymentId: string) {
  const mollie = getMollieClient()
  const payment = await mollie.payments.get(paymentId)

  return {
    id: payment.id,
    status: payment.status,
    amount: parseFloat(payment.amount.value),
    paidAt: payment.paidAt,
  }
}
