import { createAdminClient } from '@/lib/supabase/admin'
import { NextResponse } from 'next/server'

export async function POST() {
  const supabase = createAdminClient()

  // Haal alle administraties op om per administratie te dedupliceren
  const { data: admins } = await supabase.from('administraties').select('id')
  if (!admins) return NextResponse.json({ error: 'Geen administraties' })

  let totalRemoved = 0

  for (const admin of admins) {
    const adminId = admin.id

    // Haal alle relaties op
    const { data: relaties } = await supabase
      .from('relaties')
      .select('id, bedrijfsnaam, created_at')
      .eq('administratie_id', adminId)
      .order('created_at', { ascending: true })
      .range(0, 9999)

    if (!relaties || relaties.length === 0) continue

    // Haal relatie_ids op die gekoppeld zijn
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

    // Groepeer op bedrijfsnaam (case-insensitive)
    const groepen = new Map<string, typeof relaties>()
    for (const r of relaties) {
      const key = r.bedrijfsnaam?.toLowerCase().trim() || ''
      if (!key) continue
      if (!groepen.has(key)) groepen.set(key, [])
      groepen.get(key)!.push(r)
    }

    // Bepaal welke te verwijderen
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
    const BATCH = 100
    for (let i = 0; i < teVerwijderen.length; i += BATCH) {
      const batch = teVerwijderen.slice(i, i + BATCH)
      const { error } = await supabase.from('relaties').delete().in('id', batch)
      if (!error) totalRemoved += batch.length
    }
  }

  return NextResponse.json({ removed: totalRemoved })
}
