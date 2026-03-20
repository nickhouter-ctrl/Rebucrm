import pdfParse from 'pdf-parse/lib/pdf-parse.js'

export async function parsePdfBuffer(buffer: Buffer): Promise<{ text: string }> {
  return pdfParse(buffer)
}
