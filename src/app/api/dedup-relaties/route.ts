import { deduplicateRelaties } from '@/lib/actions'
import { NextResponse } from 'next/server'

export async function POST() {
  const result = await deduplicateRelaties()
  return NextResponse.json(result)
}
