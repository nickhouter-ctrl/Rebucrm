import { createAdminClient } from '@/lib/supabase/admin'
import { NextResponse } from 'next/server'

function normalize(naam: string): string {
  return naam
    .toLowerCase()
    .trim()
    .replace(/\s+/g, ' ')
    .replace(/[.,\-_]/g, '')
    .replace(/\b(bv|nv|vof)\b/gi, '')
    .trim()
}

export async function GET() {
  const supabase = createAdminClient()

  // Haal ALLE relaties op (admin client, geen RLS)
  const { data: relaties, error } = await supabase
    .from('relaties')
    .select('id, bedrijfsnaam, administratie_id, created_at')
    .order('created_at', { ascending: true })
    .range(0, 9999)

  if (error) return NextResponse.json({ error: error.message })
  if (!relaties) return NextResponse.json({ error: 'Geen data' })

  // Groepeer imports per dag
  const perDag = new Map<string, number>()
  for (const r of relaties) {
    const dag = r.created_at?.substring(0, 10) || 'onbekend'
    perDag.set(dag, (perDag.get(dag) || 0) + 1)
  }

  // Zoek fuzzy duplicaten per administratie
  const perAdmin = new Map<string, typeof relaties>()
  for (const r of relaties) {
    const aid = r.administratie_id || 'none'
    if (!perAdmin.has(aid)) perAdmin.set(aid, [])
    perAdmin.get(aid)!.push(r)
  }

  let totaalDubbelen = 0
  const voorbeelden: { naam: string; aantal: number; varianten: { bedrijfsnaam: string; created_at: string }[] }[] = []

  for (const [, adminRelaties] of perAdmin) {
    const groepen = new Map<string, typeof relaties>()
    for (const r of adminRelaties) {
      const key = normalize(r.bedrijfsnaam || '')
      if (!key) continue
      if (!groepen.has(key)) groepen.set(key, [])
      groepen.get(key)!.push(r)
    }

    for (const [key, groep] of groepen) {
      if (groep.length <= 1) continue
      totaalDubbelen += groep.length - 1
      if (voorbeelden.length < 30) {
        voorbeelden.push({
          naam: key,
          aantal: groep.length,
          varianten: groep.map(r => ({ bedrijfsnaam: r.bedrijfsnaam, created_at: r.created_at })),
        })
      }
    }
  }

  return NextResponse.json({
    totaal: relaties.length,
    administraties: [...perAdmin.entries()].map(([aid, rs]) => ({ id: aid, aantal: rs.length })),
    importPerDag: Object.fromEntries([...perDag.entries()].sort()),
    totaalDubbelen,
    voorbeelden: voorbeelden.sort((a, b) => b.aantal - a.aantal),
  })
}

export async function POST() {
  const supabase = createAdminClient()

  // Haal alle relaties op
  const { data: relaties } = await supabase
    .from('relaties')
    .select('id, bedrijfsnaam, administratie_id, created_at')
    .order('created_at', { ascending: true })
    .range(0, 9999)

  if (!relaties) return NextResponse.json({ error: 'Geen data' })

  // Haal gekoppelde relatie_ids op (alle administraties)
  const [offertesRes, ordersRes, facturenRes, projectenRes, takenRes] = await Promise.all([
    supabase.from('offertes').select('relatie_id').not('relatie_id', 'is', null).range(0, 9999),
    supabase.from('orders').select('relatie_id').not('relatie_id', 'is', null).range(0, 9999),
    supabase.from('facturen').select('relatie_id').not('relatie_id', 'is', null).range(0, 9999),
    supabase.from('projecten').select('relatie_id').not('relatie_id', 'is', null).range(0, 9999),
    supabase.from('taken').select('relatie_id').not('relatie_id', 'is', null).range(0, 9999),
  ])
  const gekoppeldeIds = new Set([
    ...(offertesRes.data || []).map(r => r.relatie_id),
    ...(ordersRes.data || []).map(r => r.relatie_id),
    ...(facturenRes.data || []).map(r => r.relatie_id),
    ...(projectenRes.data || []).map(r => r.relatie_id),
    ...(takenRes.data || []).map(r => r.relatie_id),
  ])

  // Groepeer per administratie + genormaliseerde naam
  const perAdmin = new Map<string, typeof relaties>()
  for (const r of relaties) {
    const key = `${r.administratie_id}::${normalize(r.bedrijfsnaam || '')}`
    if (!normalize(r.bedrijfsnaam || '')) continue
    if (!perAdmin.has(key)) perAdmin.set(key, [])
    perAdmin.get(key)!.push(r)
  }

  // Per groep: behoud degene met koppelingen of de oudste
  const teVerwijderen: string[] = []
  for (const [, groep] of perAdmin) {
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
