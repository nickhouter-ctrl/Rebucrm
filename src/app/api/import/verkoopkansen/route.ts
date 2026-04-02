import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'

export async function POST(request: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Niet ingelogd' }, { status: 401 })

  const { data: profiel } = await supabase
    .from('profielen')
    .select('administratie_id, rol')
    .eq('id', user.id)
    .single()
  if (!profiel || profiel.rol !== 'admin') return NextResponse.json({ error: 'Geen admin' }, { status: 403 })
  const adminId = profiel.administratie_id

  // Haal alle relaties op voor matching
  const allRelaties: { id: string; bedrijfsnaam: string }[] = []
  let from = 0
  while (true) {
    const { data } = await supabase
      .from('relaties')
      .select('id, bedrijfsnaam')
      .eq('administratie_id', adminId)
      .range(from, from + 999)
    if (!data || data.length === 0) break
    allRelaties.push(...data)
    if (data.length < 1000) break
    from += 1000
  }

  // Haal bestaande projecten op om duplicaten te voorkomen
  const allProjecten: { naam: string; relatie_id: string | null }[] = []
  from = 0
  while (true) {
    const { data } = await supabase
      .from('projecten')
      .select('naam, relatie_id')
      .eq('administratie_id', adminId)
      .range(from, from + 999)
    if (!data || data.length === 0) break
    allProjecten.push(...data)
    if (data.length < 1000) break
    from += 1000
  }
  const bestaandeSet = new Set(allProjecten.map(p => `${(p.naam || '').toLowerCase().trim()}|${p.relatie_id || ''}`))

  // Normaliseer voor matching
  function normalize(s: string) {
    return s.toLowerCase().replace(/[^a-z0-9]/g, '').trim()
  }

  const relatieMap = new Map<string, string>()
  for (const r of allRelaties) {
    relatieMap.set(normalize(r.bedrijfsnaam), r.id)
  }

  // Parse CSV uit request body
  const body = await request.json()
  const rows: { nummer: string; relatie: string; onderwerp: string; fase: string; bedrag: string; kans: string; contactpersoon: string }[] = body.rows

  const results = {
    total: rows.length,
    imported: 0,
    skipped: 0,
    noRelatie: [] as string[],
    duplicates: 0,
    errors: [] as string[],
  }

  // Batch insert
  const toInsert: {
    administratie_id: string
    relatie_id: string | null
    naam: string
    omschrijving: string | null
    status: string
    budget: number | null
  }[] = []

  for (const row of rows) {
    const naam = row.onderwerp?.trim() || row.nummer
    if (!naam) { results.skipped++; continue }

    // Match relatie
    const relatieNorm = normalize(row.relatie || '')
    let relatieId: string | null = relatieMap.get(relatieNorm) || null

    // Fuzzy: probeer substring match als exacte match faalt
    if (!relatieId && relatieNorm) {
      for (const [key, id] of relatieMap) {
        if (key.includes(relatieNorm) || relatieNorm.includes(key)) {
          relatieId = id
          break
        }
      }
    }

    if (!relatieId && row.relatie?.trim()) {
      results.noRelatie.push(row.relatie.trim())
    }

    // Status mapping
    let status = 'actief'
    const fase = (row.fase || '').toLowerCase()
    if (fase === 'klaar') status = 'afgerond'

    // Bedrag parsing (NL format: 1.234,56)
    let budget: number | null = null
    if (row.bedrag) {
      const cleaned = row.bedrag.replace(/\./g, '').replace(',', '.')
      const parsed = parseFloat(cleaned)
      if (!isNaN(parsed)) budget = parsed
    }

    // Duplicaat check
    const dupKey = `${naam.toLowerCase().trim()}|${relatieId || ''}`
    if (bestaandeSet.has(dupKey)) {
      results.duplicates++
      continue
    }
    bestaandeSet.add(dupKey)

    toInsert.push({
      administratie_id: adminId,
      relatie_id: relatieId,
      naam,
      omschrijving: row.contactpersoon?.trim() ? `Contactpersoon: ${row.contactpersoon.trim()}` : null,
      status,
      budget,
    })
  }

  // Insert in batches van 100
  for (let i = 0; i < toInsert.length; i += 100) {
    const batch = toInsert.slice(i, i + 100)
    const { error } = await supabase.from('projecten').insert(batch)
    if (error) {
      results.errors.push(`Batch ${i}-${i + batch.length}: ${error.message}`)
    } else {
      results.imported += batch.length
    }
  }

  // Unieke niet-gematchte relaties
  results.noRelatie = [...new Set(results.noRelatie)]

  return NextResponse.json(results)
}
