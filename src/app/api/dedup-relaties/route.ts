import { createAdminClient } from '@/lib/supabase/admin'
import { NextResponse } from 'next/server'

// GET = analyse, POST = verwijder
export async function GET() {
  const supabase = createAdminClient()

  const { data: admins } = await supabase.from('administraties').select('id')
  if (!admins?.[0]) return NextResponse.json({ error: 'Geen administraties' })
  const adminId = admins[0].id

  // Haal alle relaties op
  const { data: relaties } = await supabase
    .from('relaties')
    .select('id, bedrijfsnaam, created_at')
    .eq('administratie_id', adminId)
    .order('created_at', { ascending: true })
    .range(0, 9999)

  if (!relaties) return NextResponse.json({ error: 'Geen data' })

  // Groepeer imports per dag
  const perDag = new Map<string, number>()
  for (const r of relaties) {
    const dag = r.created_at?.substring(0, 10) || 'onbekend'
    perDag.set(dag, (perDag.get(dag) || 0) + 1)
  }

  // Zoek fuzzy duplicaten (normaliseer naam)
  function normalize(naam: string): string {
    return naam
      .toLowerCase()
      .trim()
      .replace(/\s+/g, ' ')
      .replace(/[.,\-_]/g, '')
      .replace(/\b(bv|b\.v\.|nv|n\.v\.|vof|v\.o\.f\.)\b/gi, '')
      .trim()
  }

  const groepen = new Map<string, typeof relaties>()
  for (const r of relaties) {
    const key = normalize(r.bedrijfsnaam || '')
    if (!key) continue
    if (!groepen.has(key)) groepen.set(key, [])
    groepen.get(key)!.push(r)
  }

  const dubbeleGroepen = [...groepen.entries()]
    .filter(([, g]) => g.length > 1)
    .map(([key, g]) => ({
      naam: key,
      aantal: g.length,
      varianten: g.map(r => ({ id: r.id, bedrijfsnaam: r.bedrijfsnaam, created_at: r.created_at })),
    }))
    .sort((a, b) => b.aantal - a.aantal)

  return NextResponse.json({
    totaal: relaties.length,
    importPerDag: Object.fromEntries(perDag),
    aantalDubbeleGroepen: dubbeleGroepen.length,
    totaalDubbelen: dubbeleGroepen.reduce((s, g) => s + g.aantal - 1, 0),
    voorbeelden: dubbeleGroepen.slice(0, 20),
  })
}

export async function POST() {
  const supabase = createAdminClient()

  const { data: admins } = await supabase.from('administraties').select('id')
  if (!admins?.[0]) return NextResponse.json({ error: 'Geen administraties' })
  const adminId = admins[0].id

  // Haal alle relaties op
  const { data: relaties } = await supabase
    .from('relaties')
    .select('id, bedrijfsnaam, created_at')
    .eq('administratie_id', adminId)
    .order('created_at', { ascending: true })
    .range(0, 9999)

  if (!relaties) return NextResponse.json({ error: 'Geen data' })

  // Haal gekoppelde relatie_ids op
  const [offertesRes, ordersRes, facturenRes, projectenRes, takenRes] = await Promise.all([
    supabase.from('offertes').select('relatie_id').eq('administratie_id', adminId).not('relatie_id', 'is', null),
    supabase.from('orders').select('relatie_id').not('relatie_id', 'is', null),
    supabase.from('facturen').select('relatie_id').eq('administratie_id', adminId).not('relatie_id', 'is', null),
    supabase.from('projecten').select('relatie_id').eq('administratie_id', adminId).not('relatie_id', 'is', null),
    supabase.from('taken').select('relatie_id').eq('administratie_id', adminId).not('relatie_id', 'is', null),
  ])
  const gekoppeldeIds = new Set([
    ...(offertesRes.data || []).map(r => r.relatie_id),
    ...(ordersRes.data || []).map(r => r.relatie_id),
    ...(facturenRes.data || []).map(r => r.relatie_id),
    ...(projectenRes.data || []).map(r => r.relatie_id),
    ...(takenRes.data || []).map(r => r.relatie_id),
  ])

  // Normaliseer en groepeer
  function normalize(naam: string): string {
    return naam
      .toLowerCase()
      .trim()
      .replace(/\s+/g, ' ')
      .replace(/[.,\-_]/g, '')
      .replace(/\b(bv|b\.v\.|nv|n\.v\.|vof|v\.o\.f\.)\b/gi, '')
      .trim()
  }

  const groepen = new Map<string, typeof relaties>()
  for (const r of relaties) {
    const key = normalize(r.bedrijfsnaam || '')
    if (!key) continue
    if (!groepen.has(key)) groepen.set(key, [])
    groepen.get(key)!.push(r)
  }

  // Per groep: behoud degene met koppelingen of de oudste
  const teVerwijderen: string[] = []
  for (const [, groep] of groepen) {
    if (groep.length <= 1) continue
    groep.sort((a, b) => {
      const aK = gekoppeldeIds.has(a.id) ? 0 : 1
      const bK = gekoppeldeIds.has(b.id) ? 0 : 1
      if (aK !== bK) return aK - bK
      return new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
    })
    for (let i = 1; i < groep.length; i++) {
      teVerwijderen.push(groep[i].id)
    }
  }

  // Verwijder in batches
  let removed = 0
  const BATCH = 100
  for (let i = 0; i < teVerwijderen.length; i += BATCH) {
    const batch = teVerwijderen.slice(i, i + BATCH)
    const { error } = await supabase.from('relaties').delete().in('id', batch)
    if (!error) removed += batch.length
  }

  return NextResponse.json({
    removed,
    remaining: relaties.length - removed,
  })
}
