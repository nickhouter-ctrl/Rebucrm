// Server-side PDF text extraction using pdfjs-dist (replaces pdf-parse which doesn't bundle on Vercel)
export async function parsePdfBuffer(buffer: Buffer): Promise<{ text: string }> {
  const pdfjsLib = await import('pdfjs-dist/legacy/build/pdf.mjs')

  const data = new Uint8Array(buffer)
  const doc = await pdfjsLib.getDocument({ data, useSystemFonts: true }).promise

  let text = ''
  for (let i = 1; i <= doc.numPages; i++) {
    const page = await doc.getPage(i)
    const content = await page.getTextContent()
    let lastY: number | null = null
    for (const item of content.items) {
      if (!('str' in item)) continue
      if (lastY !== null && lastY !== item.transform[5]) {
        text += '\n'
      }
      text += item.str
      lastY = item.transform[5]
    }
    text += '\n\n'
  }

  doc.destroy()
  return { text }
}
