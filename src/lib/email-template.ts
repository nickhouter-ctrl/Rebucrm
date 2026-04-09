export function buildRebuEmailHtml(body: string, ctaLink?: string, ctaLabel?: string): string {
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'
  const logoUrl = `${baseUrl}/images/logo-rebu-white.png`
  const bodyHtml = body
    .split('\n')
    .map(line => line.trim() === '' ? '<br>' : `<p style="margin:0 0 6px 0;font-size:14px;line-height:1.6;color:#333333;">${line.replace(/^- /, '&#8226; ')}</p>`)
    .join('\n')

  const ctaBlock = ctaLink ? `
        <tr>
          <td style="padding:8px 32px 32px 32px;text-align:center;">
            <a href="${ctaLink}" style="display:inline-block;background-color:#f97316;color:#ffffff;padding:14px 36px;text-decoration:none;border-radius:8px;font-weight:bold;font-size:15px;letter-spacing:0.3px;">
              ${ctaLabel || 'Bekijken'}
            </a>
          </td>
        </tr>` : ''

  return `<!DOCTYPE html>
<html lang="nl">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1.0"></head>
<body style="margin:0;padding:0;background-color:#f4f4f5;font-family:'Segoe UI',Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:#f4f4f5;padding:32px 0;">
    <tr><td align="center">
      <table width="600" cellpadding="0" cellspacing="0" border="0" style="max-width:600px;width:100%;background-color:#ffffff;border-radius:12px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,0.06);">
        <tr>
          <td style="background-color:#00a66e;padding:24px 32px;text-align:center;">
            <img src="${logoUrl}" alt="Rebu Kozijnen" width="160" style="display:inline-block;" />
          </td>
        </tr>
        <tr>
          <td style="padding:32px 32px 16px 32px;">
            ${bodyHtml}
          </td>
        </tr>
        ${ctaBlock}
        <tr>
          <td style="padding:0 32px;">
            <hr style="border:none;border-top:1px solid #e5e7eb;margin:0;" />
          </td>
        </tr>
        <tr>
          <td style="padding:24px 32px;">
            <table cellpadding="0" cellspacing="0" border="0" width="100%">
              <tr>
                <td style="vertical-align:top;padding-right:24px;border-right:2px solid #00a66e;width:50%;">
                  <p style="margin:0;font-size:14px;font-weight:bold;color:#111827;">Rebu kozijnen B.V.</p>
                  <p style="margin:6px 0 0;font-size:12px;color:#6b7280;line-height:1.7;">
                    Samsonweg 26F<br>1521 RM Wormerveer
                  </p>
                </td>
                <td style="vertical-align:top;padding-left:24px;width:50%;">
                  <p style="margin:0;font-size:12px;color:#6b7280;line-height:1.7;">
                    <a href="tel:+31658866070" style="color:#00a66e;text-decoration:none;">+31 6 58 86 60 70</a><br>
                    <a href="mailto:info@rebukozijnen.nl" style="color:#00a66e;text-decoration:none;">info@rebukozijnen.nl</a><br>
                    <a href="https://www.rebukozijnen.nl" style="color:#00a66e;text-decoration:none;">www.rebukozijnen.nl</a>
                  </p>
                </td>
              </tr>
            </table>
          </td>
        </tr>
        <tr>
          <td style="background-color:#f9fafb;padding:12px 32px;border-top:1px solid #e5e7eb;">
            <p style="margin:0;font-size:11px;color:#9ca3af;text-align:center;">
              KVK: 907 204 74 &nbsp;|&nbsp; BTW: NL 865 427 926 B01 &nbsp;|&nbsp; IBAN: NL80 INGB 0675 6102 73
            </p>
          </td>
        </tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`
}
