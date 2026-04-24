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
}) {
  const fromAddress = process.env.SMTP_FROM || process.env.SMTP_USER || 'info@rebukozijnen.nl'
  const from = options.fromName ? `"${options.fromName}" <${fromAddress}>` : fromAddress

  await transporter.sendMail({
    from,
    to: options.to,
    subject: options.subject,
    html: options.html,
    bcc: options.bcc,
    replyTo: options.replyTo,
    attachments: options.attachments,
  })
}
