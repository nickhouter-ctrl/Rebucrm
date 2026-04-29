import nodemailer from 'nodemailer'

// Strakke timeouts zodat de request niet 60+ seconden blijft hangen als SMTP
// traag/niet bereikbaar is (bv. bij een login-flow waar de user onmiddellijke
// feedback nodig heeft).
const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST || 'smtp.gmail.com',
  port: parseInt(process.env.SMTP_PORT || '587'),
  secure: false,
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS,
  },
  connectionTimeout: 10000, // 10s voor TCP-connect
  greetingTimeout: 10000,   // 10s voor EHLO/HELO
  socketTimeout: 15000,     // 15s voor data-transfer
})

export async function sendEmail(options: {
  to: string
  subject: string
  html: string
  bcc?: string[]
  attachments?: { filename: string; content: Buffer | string; encoding?: string }[]
  replyTo?: string
  fromName?: string
  // Toon-adres in From-veld. SMTP gebruikt één account (SMTP_USER), maar we
  // kunnen het zichtbare afzender-adres overschrijven mits het domein het
  // toelaat (anders DMARC-fail). Default = SMTP_FROM.
  fromEmail?: string
}) {
  const defaultFrom = process.env.SMTP_FROM || process.env.SMTP_USER || 'info@rebukozijnen.nl'
  // Alleen overschrijven binnen eigen domein, anders DMARC fail.
  const eigenDomain = defaultFrom.split('@')[1]
  const useFrom = options.fromEmail && options.fromEmail.endsWith('@' + eigenDomain)
    ? options.fromEmail
    : defaultFrom
  const from = options.fromName ? `"${options.fromName}" <${useFrom}>` : useFrom

  await transporter.sendMail({
    from,
    to: options.to,
    subject: options.subject,
    html: options.html,
    bcc: options.bcc,
    // Default replyTo = de afzender (zodat reactie bij medewerker terechtkomt)
    replyTo: options.replyTo || (options.fromEmail || undefined),
    attachments: options.attachments,
  })
}
