// Server-side PDF text extraction using unpdf (serverless-compatible)
export async function parsePdfBuffer(buffer: Buffer): Promise<{ text: string }> {
  const { extractText } = await import('unpdf')
  const data = new Uint8Array(buffer)
  const { text } = await extractText(data)
  return { text }
}
