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

// Genereert een leesbare platte-tekst-variant uit HTML. HTML-only mail telt
// mee als spamsignaal; een multipart-bericht met text-alternatief scoort beter
// bij spamfilters (en is leesbaar in clients die geen HTML tonen).
function htmlNaarTekst(html: string): string {
  return html
    .replace(/<head[\s\S]*?<\/head>/gi, '')
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<(br|\/p|\/div|\/tr|\/h[1-6]|\/li)[^>]*>/gi, '\n')
    .replace(/<li[^>]*>/gi, '• ')
    .replace(/<a[^>]*href=["']([^"']+)["'][^>]*>(.*?)<\/a>/gi, '$2 ($1)')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\n{3,}/g, '\n\n')
    .split('\n').map(l => l.trim()).join('\n')
    .trim()
}

export async function sendEmail(options: {
  to: string
  subject: string
  html: string
  text?: string
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
    // Platte-tekst-alternatief: meegeleverd of automatisch uit de HTML afgeleid.
    text: options.text || htmlNaarTekst(options.html),
    bcc: options.bcc,
    // Default replyTo = de afzender (zodat reactie bij medewerker terechtkomt)
    replyTo: options.replyTo || (options.fromEmail || undefined),
    attachments: options.attachments,
  })
}
