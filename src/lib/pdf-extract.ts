// Polyfill DOMMatrix for Node.js/serverless environments (required by pdfjs-dist)
if (typeof globalThis.DOMMatrix === 'undefined') {
  // @ts-expect-error minimal polyfill for pdfjs-dist text extraction
  globalThis.DOMMatrix = class DOMMatrix {
    m: number[] = [1, 0, 0, 1, 0, 0]
    constructor(init?: string | number[]) {
      if (Array.isArray(init)) this.m = init
    }
    get a() { return this.m[0] }
    get b() { return this.m[1] }
    get c() { return this.m[2] }
    get d() { return this.m[3] }
    get e() { return this.m[4] }
    get f() { return this.m[5] }
    isIdentity = true
    is2D = true
    inverse() { return new DOMMatrix() }
    multiply() { return new DOMMatrix() }
    translate() { return new DOMMatrix() }
    scale() { return new DOMMatrix() }
    rotate() { return new DOMMatrix() }
    transformPoint() { return { x: 0, y: 0, z: 0, w: 1 } }
  }
}

// Server-side PDF text extraction using pdfjs-dist
export async function parsePdfBuffer(buffer: Buffer): Promise<{ text: string }> {
  const pdfjsLib = await import('pdfjs-dist/legacy/build/pdf.mjs')

  const data = new Uint8Array(buffer)
  const loadingTask = pdfjsLib.getDocument({
    data,
    useSystemFonts: true,
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
