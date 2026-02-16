import { NextResponse } from 'next/server'
import { renderToBuffer } from '@react-pdf/renderer'
import { createClient } from '@/lib/supabase/server'
import { FactuurDocument } from '@/lib/pdf/factuur-template'

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const supabase = await createClient()

  const { data: factuur, error } = await supabase
    .from('facturen')
    .select('*, relatie:relaties(*), regels:factuur_regels(*)')
    .eq('id', id)
    .single()

  if (error || !factuur) {
    return NextResponse.json({ error: 'Factuur niet gevonden' }, { status: 404 })
  }

  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const buffer = await renderToBuffer(FactuurDocument({ factuur }) as any)
    const uint8 = new Uint8Array(buffer)

    return new NextResponse(uint8, {
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `inline; filename="Factuur-${factuur.factuurnummer}.pdf"`,
      },
    })
  } catch (err) {
    console.error('PDF generation error:', err)
    return NextResponse.json({ error: 'PDF generatie mislukt' }, { status: 500 })
  }
}
