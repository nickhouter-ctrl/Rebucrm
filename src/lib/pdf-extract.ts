// Server-side PDF text extraction using unpdf (serverless-compatible)
export async function parsePdfBuffer(buffer: Buffer): Promise<{ text: string }> {
  const { extractText } = await import('unpdf')
  const data = new Uint8Array(buffer)
  const result = await extractText(data)
  // unpdf returns text as string[] (one per page) — join into single string
  const text = Array.isArray(result.text) ? result.text.join('\n\n') : String(result.text)
  return { text }
}
