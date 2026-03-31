import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { parseLeverancierPdfText } from '@/lib/pdf-parser'

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const supabaseAdmin = createAdminClient()

  const { data: pdfDoc } = await supabaseAdmin
    .from('documenten')
    .select('*')
    .eq('entiteit_type', 'offerte_leverancier')
    .eq('entiteit_id', id)
    .maybeSingle()

  if (!pdfDoc) {
    return NextResponse.json({ error: 'Geen leverancier PDF gevonden' }, { status: 404 })
  }

  const { data: pdfFile } = await supabaseAdmin.storage
    .from('documenten')
    .download(pdfDoc.storage_path)

  if (!pdfFile) {
    return NextResponse.json({ error: 'Kan PDF niet downloaden' }, { status: 500 })
  }

  const { parsePdfBuffer: pdfParse } = await import('@/lib/pdf-extract')
  const pdfBuffer = Buffer.from(await pdfFile.arrayBuffer())
  const parsed = await pdfParse(pdfBuffer)

  const result = parseLeverancierPdfText(parsed.text)

  // Show first 5000 chars of raw text for debugging
  return NextResponse.json({
    rawTextLength: parsed.text.length,
    rawTextPreview: parsed.text.substring(0, 8000),
    isKochs: /K-Vision\s+\d+/.test(parsed.text),
    isGealan: /Merk\s+\d+\s*Aantal\s*:\s*\d+/.test(parsed.text),
    totaal: result.totaal,
    elementCount: result.elementen.length,
    elementen: result.elementen.map(e => ({
      naam: e.naam,
      hoeveelheid: e.hoeveelheid,
      prijs: e.prijs,
      systeem: e.systeem,
      afmetingen: e.afmetingen,
    })),
  })
}
