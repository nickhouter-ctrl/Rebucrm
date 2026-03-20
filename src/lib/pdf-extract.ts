// Server-side PDF text extraction using pdfjs-dist
export async function parsePdfBuffer(buffer: Buffer): Promise<{ text: string }> {
  // Must use legacy build - main build requires DOMMatrix (browser-only)
  const pdfjsLib = await import('pdfjs-dist/legacy/build/pdf.mjs')

  const data = new Uint8Array(buffer)
  const loadingTask = pdfjsLib.getDocument({
    data,
    useSystemFonts: true,
    // Disable worker in serverless environment
    isEvalSupported: false,
  })

  const doc = await loadingTask.promise

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
