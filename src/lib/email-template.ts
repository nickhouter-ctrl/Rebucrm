export function buildRebuEmailHtml(
  body: string,
  ctaLink?: string,
  ctaLabel?: string,
  medewerker?: { naam?: string; email?: string; telefoon?: string },
): string {
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'
  const logoUrl = `${baseUrl}/images/logo-rebu.png`

  // Body kan HTML (uit rich-text-editor) of plain text zijn.
  // Detecteer HTML en laat het dan ongemoeid (met default font/kleur wrapper).
  const isHtml = /<(p|br|div|b|i|u|ul|ol|span|font|strong|em)\b/i.test(body)
  const bodyHtml = isHtml
    ? `<div style="font-size:15px;line-height:1.65;color:#1f2937;">${body}</div>`
    : body
      .split('\n')
      .map(line => {
        const l = line.trim()
        if (l === '') return '<div style="height:10px;line-height:10px;">&nbsp;</div>'
        const withLinks = l.replace(/(https?:\/\/[^\s]+)/g, '<a href="$1" style="color:#00a66e;text-decoration:underline;">$1</a>')
        if (/^[-•]\s/.test(l)) {
          return `<p style="margin:0 0 6px 0;padding-left:18px;position:relative;font-size:15px;line-height:1.65;color:#1f2937;"><span style="position:absolute;left:0;color:#00a66e;font-weight:bold;">•</span>${withLinks.replace(/^[-•]\s/, '')}</p>`
        }
        return `<p style="margin:0 0 10px 0;font-size:15px;line-height:1.65;color:#1f2937;">${withLinks}</p>`
      })
      .join('\n')

  // Gebruik een <table>-based button met bgcolor-attribuut zodat Outlook,
  // iOS Mail en webmail-previews (die linear-gradient en box-shadow strippen)
  // altijd een groene klikbare knop tonen in plaats van een lege witte rechthoek.
  const ctaBlock = ctaLink ? `
        <tr>
          <td align="center" style="padding:4px 40px 32px 40px;">
            <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:0 auto;">
              <tr>
                <td bgcolor="#00a66e" align="center" style="background-color:#00a66e;background:#00a66e;background:linear-gradient(135deg,#00a66e 0%,#008f5f 100%);border-radius:10px;">
                  <a href="${ctaLink}" target="_blank" style="display:inline-block;background-color:#00a66e;color:#ffffff !important;padding:14px 40px;text-decoration:none;border-radius:10px;font-weight:600;font-size:15px;letter-spacing:0.2px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Arial,sans-serif;mso-padding-alt:0;">
                    <!--[if mso]>&nbsp;&nbsp;&nbsp;&nbsp;<![endif]--><span style="color:#ffffff;">${ctaLabel || 'Bekijken'}</span><!--[if mso]>&nbsp;&nbsp;&nbsp;&nbsp;<![endif]-->
                  </a>
                </td>
              </tr>
            </table>
          </td>
        </tr>` : ''

  return `<!DOCTYPE html>
<html lang="nl">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1.0">
  <meta name="color-scheme" content="light">
  <meta name="supported-color-schemes" content="light">
</head>
<body style="margin:0;padding:0;background-color:#f1f5f4;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Arial,sans-serif;color:#1f2937;">
  <div style="display:none;max-height:0;overflow:hidden;">Rebu Kozijnen</div>
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:#f1f5f4;padding:40px 16px;">
    <tr><td align="center">
      <table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0" style="max-width:600px;width:100%;background-color:#ffffff;border-radius:16px;overflow:hidden;box-shadow:0 4px 20px rgba(15,23,42,0.06);">
        <!-- Header met wit logo -->
        <tr>
          <td style="background-color:#ffffff;padding:32px 40px 20px 40px;text-align:left;border-bottom:1px solid #f1f5f4;">
            <img src="${logoUrl}" alt="Rebu Kozijnen" width="150" style="display:block;max-width:150px;height:auto;" />
          </td>
        </tr>
        <!-- Groen accent lijntje -->
        <tr>
          <td style="height:4px;background:linear-gradient(90deg,#00a66e 0%,#22d3ae 50%,#00a66e 100%);"></td>
        </tr>
        <!-- Body -->
        <tr>
          <td style="padding:36px 40px 24px 40px;">
            ${bodyHtml}
          </td>
        </tr>
        ${ctaBlock}
        <!-- Contact kaart -->
        <tr>
          <td style="padding:0 40px 28px 40px;">
            <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="background-color:#f8faf9;border-radius:12px;border:1px solid #e6f4ee;">
              <tr>
                <td style="padding:20px 24px;">
                  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
                    <tr>
                      <td style="vertical-align:top;width:50%;padding-right:12px;">
                        <p style="margin:0 0 4px 0;font-size:13px;font-weight:700;color:#064e3b;letter-spacing:0.3px;">REBU KOZIJNEN B.V.</p>
                        <p style="margin:0;font-size:13px;color:#4b5563;line-height:1.6;">
                          Samsonweg 26F<br>
                          1521 RM Wormerveer
                        </p>
                      </td>
                      <td style="vertical-align:top;width:50%;padding-left:12px;border-left:2px solid #00a66e;">
                        ${medewerker?.naam ? `<p style="margin:0 0 4px 0;font-size:13px;font-weight:600;color:#064e3b;">${medewerker.naam}</p>` : ''}
                        <p style="margin:0;font-size:13px;color:#4b5563;line-height:1.8;">
                          <a href="tel:${(medewerker?.telefoon || '+31658866070').replace(/\s/g, '')}" style="color:#00a66e;text-decoration:none;font-weight:500;">📞 ${medewerker?.telefoon || '+31 6 58 86 60 70'}</a><br>
                          <a href="mailto:${medewerker?.email || 'info@rebukozijnen.nl'}" style="color:#00a66e;text-decoration:none;font-weight:500;">✉️ ${medewerker?.email || 'info@rebukozijnen.nl'}</a><br>
                          <a href="https://www.rebukozijnen.nl" style="color:#00a66e;text-decoration:none;font-weight:500;">🌐 www.rebukozijnen.nl</a>
                        </p>
                      </td>
                    </tr>
                  </table>
                </td>
              </tr>
            </table>
          </td>
        </tr>
        <!-- Sub-footer: KVK/BTW/IBAN -->
        <tr>
          <td style="background-color:#f8faf9;padding:14px 40px;border-top:1px solid #e6f4ee;">
            <p style="margin:0;font-size:11px;color:#6b7280;text-align:center;letter-spacing:0.2px;">
              KVK 907 204 74 · BTW NL 865 427 926 B01 · IBAN NL80 INGB 0675 6102 73
            </p>
          </td>
        </tr>
      </table>
      <!-- Footer tagline -->
      <table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0" style="max-width:600px;width:100%;margin-top:16px;">
        <tr><td style="text-align:center;padding:0 16px;">
          <p style="margin:0;font-size:11px;color:#9ca3af;">Rebu Kozijnen · Kwaliteitskozijnen direct van de leverancier</p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`
}
