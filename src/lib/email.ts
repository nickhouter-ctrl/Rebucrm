import nodemailer from 'nodemailer'

const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST || 'smtp.gmail.com',
  port: parseInt(process.env.SMTP_PORT || '587'),
  secure: false,
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS,
  },
})

export async function sendEmail(options: {
  to: string
  subject: string
  html: string
  attachments?: { filename: string; content: Buffer | string; encoding?: string }[]
}) {
  const from = process.env.SMTP_FROM || process.env.SMTP_USER || 'Nick@rebukozijnen.nl'

  await transporter.sendMail({
    from,
    to: options.to,
    subject: options.subject,
    html: options.html,
    attachments: options.attachments,
  })
}
