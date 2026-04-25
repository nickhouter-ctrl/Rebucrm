'use server'

import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { revalidatePath } from 'next/cache'
import { sendEmail } from '@/lib/email'
import { buildRebuEmailHtml } from '@/lib/email-template'

// Helper: pagineer Supabase queries die door de 1000-rij limiet heen moeten
async function fetchAllRows<T>(queryFn: (from: number, to: number) => PromiseLike<{ data: T[] | null }>): Promise<T[]> {
  const all: T[] = []
  let from = 0
  const PAGE = 1000
  while (true) {
    const { data } = await queryFn(from, from + PAGE - 1)
    if (!data || data.length === 0) break
    all.push(...data)
    if (data.length < PAGE) break
    from += PAGE
  }
  return all
}

export async function getAdministratieId(): Promise<string | null> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null

  // Use admin client to bypass RLS (server actions may have stale JWT for RLS)
  const supabaseAdmin = createAdminClient()
  const { data: profiel } = await supabaseAdmin
    .from('profielen')
    .select('administratie_id')
    .eq('id', user.id)
    .single()

  return profiel?.administratie_id || null
}

export async function getVolgendeNummer(type: string): Promise<string> {
  const supabase = await createClient()
  const adminId = await getAdministratieId()
  if (!adminId) return ''

  const { data } = await supabase.rpc('volgende_nummer', {
    p_administratie_id: adminId,
    p_type: type,
  })

  return data || ''
}

// Genereer volgend taaknummer (YYYY-NNNNN)
async function getVolgendTaaknummer(supabaseClient: ReturnType<typeof createAdminClient>): Promise<string> {
  const jaar = new Date().getFullYear().toString()
  const { data } = await supabaseClient
    .from('taken')
    .select('taaknummer')
    .like('taaknummer', `${jaar}-%`)
    .order('taaknummer', { ascending: false })
    .limit(1)
  const laatsteNr = data?.[0]?.taaknummer
  const volgendNr = laatsteNr ? parseInt(laatsteNr.split('-')[1]) + 1 : 1
  return `${jaar}-${String(volgendNr).padStart(5, '0')}`
}

// === RELATIES ===
export async function getRelaties() {
  const supabase = await createClient()

  const relaties = await fetchAllRows((from, to) =>
    supabase.from('relaties').select('id, bedrijfsnaam, type, contactpersoon, email, telefoon, plaats, standaard_marge').order('bedrijfsnaam').range(from, to)
  )

  if (relaties.length === 0) return []

  const [notities, projecten, taken, facturen, emails] = await Promise.all([
    fetchAllRows((from, to) =>
      supabase.from('notities')
        .select('relatie_id, tekst, created_at')
        .not('relatie_id', 'is', null)
        .order('created_at', { ascending: false })
        .range(from, to)
    ),
    fetchAllRows((from, to) =>
      supabase.from('projecten')
        .select('relatie_id')
        .not('relatie_id', 'is', null)
        .in('status', ['actief', 'on_hold'])
        .range(from, to)
    ),
    fetchAllRows((from, to) =>
      supabase.from('taken')
        .select('relatie_id')
        .not('relatie_id', 'is', null)
        .neq('status', 'afgerond')
        .range(from, to)
    ),
    fetchAllRows((from, to) =>
      supabase.from('facturen')
        .select('relatie_id, totaal, betaald_bedrag, status, vervaldatum')
        .not('relatie_id', 'is', null)
        .in('status', ['verzonden', 'deels_betaald', 'vervallen'])
        .range(from, to)
    ),
    fetchAllRows((from, to) =>
      supabase.from('emails')
        .select('relatie_id, datum')
        .not('relatie_id', 'is', null)
        .order('datum', { ascending: false })
        .range(from, to)
    ),
  ])

  // Laatste notitie per relatie (notities al gesorteerd op created_at desc)
  const laatsteNotitieMap = new Map<string, { tekst: string; datum: string }>()
  for (const n of notities) {
    if (n.relatie_id && !laatsteNotitieMap.has(n.relatie_id)) {
      laatsteNotitieMap.set(n.relatie_id, { tekst: n.tekst, datum: n.created_at })
    }
  }

  // Actieve projecten per relatie
  const projectenCountMap = new Map<string, number>()
  for (const p of projecten) {
    if (p.relatie_id) projectenCountMap.set(p.relatie_id, (projectenCountMap.get(p.relatie_id) || 0) + 1)
  }

  // Open taken per relatie
  const takenCountMap = new Map<string, number>()
  for (const t of taken) {
    if (t.relatie_id) takenCountMap.set(t.relatie_id, (takenCountMap.get(t.relatie_id) || 0) + 1)
  }

  // Openstaande facturen per relatie
  const facturenMap = new Map<string, { openstaand: number; heeft_vervallen: boolean }>()
  const today = new Date().toISOString().split('T')[0]
  for (const f of facturen) {
    if (!f.relatie_id) continue
    if (!facturenMap.has(f.relatie_id)) facturenMap.set(f.relatie_id, { openstaand: 0, heeft_vervallen: false })
    const entry = facturenMap.get(f.relatie_id)!
    entry.openstaand += (f.totaal || 0) - (f.betaald_bedrag || 0)
    if (f.status === 'vervallen' || (f.vervaldatum && f.vervaldatum < today)) entry.heeft_vervallen = true
  }

  // Laatste email per relatie (emails al gesorteerd op datum desc)
  const laatsteEmailMap = new Map<string, string>()
  for (const e of emails) {
    if (e.relatie_id && !laatsteEmailMap.has(e.relatie_id)) laatsteEmailMap.set(e.relatie_id, e.datum)
  }

  return relaties.map(r => {
    const notitie = laatsteNotitieMap.get(r.id)
    const emailDatum = laatsteEmailMap.get(r.id)
    let laatsteContact: string | null = null
    if (notitie?.datum && emailDatum) {
      laatsteContact = notitie.datum > emailDatum ? notitie.datum : emailDatum
    } else {
      laatsteContact = notitie?.datum || emailDatum || null
    }

    return {
      ...r,
      laatste_notitie: notitie?.tekst || null,
      laatste_notitie_datum: notitie?.datum || null,
      actieve_verkoopkansen: projectenCountMap.get(r.id) || 0,
      open_taken: takenCountMap.get(r.id) || 0,
      openstaand_bedrag: facturenMap.get(r.id)?.openstaand || 0,
      heeft_vervallen: facturenMap.get(r.id)?.heeft_vervallen || false,
      laatste_contact: laatsteContact,
    }
  })
}

// Volledige export van alle relaties — alle velden
export async function exportRelaties() {
  const adminId = await getAdministratieId()
  if (!adminId) return { error: 'Niet ingelogd' }

  // Gebruik admin client om RLS issues met stale JWT in server actions te omzeilen,
  // administratie_id filter waarborgt dat alleen eigen relaties worden opgehaald
  const supabaseAdmin = createAdminClient()

  const allRelaties: Array<{
    bedrijfsnaam: string
    type: string | null
    contactpersoon: string | null
    email: string | null
    telefoon: string | null
    adres: string | null
    postcode: string | null
    plaats: string | null
    land: string | null
    kvk_nummer: string | null
    btw_nummer: string | null
    iban: string | null
    opmerkingen: string | null
    actief: boolean | null
    created_at: string
  }> = []
  let from = 0
  const PAGE = 1000

  while (true) {
    const { data, error } = await supabaseAdmin
      .from('relaties')
      .select('bedrijfsnaam, type, contactpersoon, email, telefoon, adres, postcode, plaats, land, kvk_nummer, btw_nummer, iban, opmerkingen, actief, created_at')
      .eq('administratie_id', adminId)
      .order('bedrijfsnaam')
      .range(from, from + PAGE - 1)

    if (error) {
      console.error('[exportRelaties] Query error:', error)
      return { error: `Query fout: ${error.message}` }
    }

    if (!data || data.length === 0) break
    allRelaties.push(...data)
    if (data.length < PAGE) break
    from += PAGE
  }

  return { success: true, relaties: allRelaties }
}

export async function getRelatie(id: string) {
  const supabase = await createClient()
  const { data } = await supabase
    .from('relaties')
    .select('*')
    .eq('id', id)
    .single()
  return data
}

export async function saveRelatie(formData: FormData) {
  const supabase = await createClient()
  const adminId = await getAdministratieId()
  if (!adminId) return { error: 'Niet ingelogd' }

  const id = formData.get('id') as string
  const record = {
    administratie_id: adminId,
    bedrijfsnaam: formData.get('bedrijfsnaam') as string,
    type: formData.get('type') as string,
    contactpersoon: formData.get('contactpersoon') as string || null,
    email: formData.get('email') as string || null,
    factuur_email: formData.get('factuur_email') as string || null,
    telefoon: formData.get('telefoon') as string || null,
    adres: formData.get('adres') as string || null,
    postcode: formData.get('postcode') as string || null,
    plaats: formData.get('plaats') as string || null,
    kvk_nummer: formData.get('kvk_nummer') as string || null,
    btw_nummer: formData.get('btw_nummer') as string || null,
    iban: formData.get('iban') as string || null,
    opmerkingen: formData.get('opmerkingen') as string || null,
    standaard_marge: formData.get('standaard_marge') ? parseFloat(formData.get('standaard_marge') as string) : null,
  }

  if (id) {
    const { error } = await supabase.from('relaties').update(record).eq('id', id)
    if (error) return { error: error.message }
    revalidatePath('/relatiebeheer')
    return { success: true, id }
  } else {
    const { data, error } = await supabase.from('relaties').insert(record).select('id').single()
    if (error) return { error: error.message }
    revalidatePath('/relatiebeheer')
    return { success: true, id: data.id }
  }
}

export async function importRelaties(rows: {
  bedrijfsnaam: string
  type?: string
  contactpersoon?: string
  email?: string
  telefoon?: string
  adres?: string
  postcode?: string
  plaats?: string
  kvk_nummer?: string
  btw_nummer?: string
  iban?: string
  website?: string
  opmerkingen?: string
}[]) {
  const supabase = await createClient()
  const adminId = await getAdministratieId()
  if (!adminId) return { error: 'Niet ingelogd' }

  // Fetch existing relaties for duplicate check (pagineer voor >1000)
  const existing = await fetchAllRows((from, to) =>
    supabase.from('relaties').select('bedrijfsnaam, kvk_nummer').eq('administratie_id', adminId).range(from, to)
  )

  const existingNames = new Set(
    existing.map(r => r.bedrijfsnaam.toLowerCase().trim())
  )
  const existingKvk = new Set(
    existing.filter(r => r.kvk_nummer).map(r => r.kvk_nummer!.trim())
  )

  const toInsert: typeof rows = []
  const duplicates: string[] = []
  const invalid: string[] = []

  for (const row of rows) {
    const name = row.bedrijfsnaam?.trim()
    if (!name) {
      invalid.push(row.bedrijfsnaam || '(leeg)')
      continue
    }

    if (existingNames.has(name.toLowerCase())) {
      duplicates.push(name)
      continue
    }
    if (row.kvk_nummer?.trim() && existingKvk.has(row.kvk_nummer.trim())) {
      duplicates.push(name)
      continue
    }

    const type = ['particulier', 'zakelijk'].includes(row.type?.toLowerCase() || '')
      ? row.type!.toLowerCase()
      : 'particulier'

    toInsert.push({ ...row, bedrijfsnaam: name, type })
    existingNames.add(name.toLowerCase())
    if (row.kvk_nummer?.trim()) existingKvk.add(row.kvk_nummer.trim())
  }

  let imported = 0
  const errors: string[] = []

  if (toInsert.length > 0) {
    const BATCH_SIZE = 100
    for (let i = 0; i < toInsert.length; i += BATCH_SIZE) {
      const batch = toInsert.slice(i, i + BATCH_SIZE).map(row => ({
        administratie_id: adminId,
        bedrijfsnaam: row.bedrijfsnaam,
        type: row.type || 'particulier',
        contactpersoon: row.contactpersoon || null,
        email: row.email || null,
        telefoon: row.telefoon || null,
        adres: row.adres || null,
        postcode: row.postcode || null,
        plaats: row.plaats || null,
        kvk_nummer: row.kvk_nummer || null,
        btw_nummer: row.btw_nummer || null,
        iban: row.iban || null,
        website: row.website || null,
        opmerkingen: row.opmerkingen || null,
      }))

      const { error } = await supabase.from('relaties').insert(batch)
      if (error) {
        errors.push(error.message)
      } else {
        imported += batch.length
      }
    }
  }

  revalidatePath('/relatiebeheer')
  return {
    success: true,
    imported,
    duplicates: duplicates.length,
    duplicateNames: duplicates.slice(0, 10),
    invalid: invalid.length,
    errors,
  }
}

export async function deduplicateRelaties() {
  'use server'
  const supabase = await createClient()
  const adminId = await getAdministratieId()
  if (!adminId) return { error: 'Niet ingelogd' }

  // Haal alle relaties op (gepagineerd)
  const relaties = await fetchAllRows((from, to) =>
    supabase.from('relaties').select('id, bedrijfsnaam, created_at').eq('administratie_id', adminId).order('created_at', { ascending: true }).range(from, to)
  )

  if (relaties.length === 0) return { removed: 0 }

  // Haal relatie_ids op die gekoppeld zijn aan andere tabellen
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

  // Bepaal welke te verwijderen: behoud de oudste of degene met koppelingen
  const teVerwijderen: string[] = []
  for (const [, groep] of groepen) {
    if (groep.length <= 1) continue
    // Sorteer: gekoppelde eerst, dan op created_at (oudste eerst)
    groep.sort((a, b) => {
      const aKoppeling = gekoppeldeIds.has(a.id) ? 0 : 1
      const bKoppeling = gekoppeldeIds.has(b.id) ? 0 : 1
      if (aKoppeling !== bKoppeling) return aKoppeling - bKoppeling
      return new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
    })
    // Behoud de eerste, verwijder de rest
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

  revalidatePath('/relatiebeheer')
  revalidatePath('/')
  return { removed, total: relaties.length, remaining: relaties.length - removed }
}

export async function deleteRelatie(id: string) {
  const supabase = await createClient()
  const { error } = await supabase.from('relaties').delete().eq('id', id)
  if (error) return { error: error.message }
  revalidatePath('/relatiebeheer')
  return { success: true }
}

// === PRODUCTEN ===
export async function getProducten() {
  const supabase = await createClient()
  const { data } = await supabase
    .from('producten')
    .select('*')
    .order('naam')
  return data || []
}

export async function getProduct(id: string) {
  const supabase = await createClient()
  const { data } = await supabase
    .from('producten')
    .select('*')
    .eq('id', id)
    .single()
  return data
}

export async function saveProduct(formData: FormData) {
  const supabase = await createClient()
  const adminId = await getAdministratieId()
  if (!adminId) return { error: 'Niet ingelogd' }

  const id = formData.get('id') as string
  const record = {
    administratie_id: adminId,
    naam: formData.get('naam') as string,
    omschrijving: formData.get('omschrijving') as string || null,
    eenheid: formData.get('eenheid') as string || 'stuk',
    prijs: parseFloat(formData.get('prijs') as string) || 0,
    btw_percentage: parseInt(formData.get('btw_percentage') as string) || 21,
    type: formData.get('type') as string || 'product',
    voorraad_bijhouden: formData.get('voorraad_bijhouden') === 'true',
    voorraad: parseInt(formData.get('voorraad') as string) || 0,
    artikelnummer: formData.get('artikelnummer') as string || null,
  }

  if (id) {
    const { error } = await supabase.from('producten').update(record).eq('id', id)
    if (error) return { error: error.message }
  } else {
    const { error } = await supabase.from('producten').insert(record)
    if (error) return { error: error.message }
  }

  revalidatePath('/producten')
  return { success: true }
}

export async function deleteProduct(id: string) {
  const supabase = await createClient()
  const { error } = await supabase.from('producten').delete().eq('id', id)
  if (error) return { error: error.message }
  revalidatePath('/producten')
  return { success: true }
}

// === OFFERTES ===
export async function getOffertes(includeArchief = false) {
  const supabase = await createClient()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const data = await fetchAllRows<any>((from, to) => {
    let q = supabase
      .from('offertes')
      .select('*, relatie:relaties(bedrijfsnaam), project:projecten(naam)')
      .order('datum', { ascending: false })
      .range(from, to)
    if (!includeArchief) q = q.or('gearchiveerd.is.null,gearchiveerd.eq.false')
    return q
  })
  const perNummer = new Map<string, typeof data[number]>()
  for (const o of data) {
    const key = o.offertenummer || `__${o.id}`
    const huidig = perNummer.get(key)
    if (!huidig || (Number(o.versie_nummer) || 0) > (Number(huidig.versie_nummer) || 0)) {
      perNummer.set(key, o)
    }
  }
  return Array.from(perNummer.values())
}

export async function getArchiefOffertes() {
  const supabase = await createClient()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const data = await fetchAllRows<any>((from, to) =>
    supabase
      .from('offertes')
      .select('*, relatie:relaties(bedrijfsnaam), project:projecten(naam)')
      .eq('gearchiveerd', true)
      .order('gearchiveerd_op', { ascending: false })
      .range(from, to)
  )
  const perNummer = new Map<string, typeof data[number]>()
  for (const o of data) {
    const key = o.offertenummer || `__${o.id}`
    const huidig = perNummer.get(key)
    if (!huidig || (Number(o.versie_nummer) || 0) > (Number(huidig.versie_nummer) || 0)) {
      perNummer.set(key, o)
    }
  }
  return Array.from(perNummer.values())
}

export async function archiveerOfferte(offerteId: string, gearchiveerd = true) {
  const supabase = await createClient()
  const { error } = await supabase
    .from('offertes')
    .update({ gearchiveerd, gearchiveerd_op: gearchiveerd ? new Date().toISOString() : null })
    .eq('id', offerteId)
  if (error) return { error: error.message }
  revalidatePath('/offertes')
  revalidatePath('/archief')
  revalidatePath(`/offertes/${offerteId}`)
  return { success: true }
}

export async function getArchiefFacturen() {
  const adminId = await getAdministratieId()
  if (!adminId) return []
  const supabase = await createClient()
  const data = await fetchAllRows((from, to) =>
    supabase
      .from('facturen')
      .select('id, factuurnummer, datum, status, totaal, subtotaal, btw_totaal, factuur_type, relatie:relaties(bedrijfsnaam)')
      .eq('administratie_id', adminId)
      .or('status.eq.gecrediteerd,factuur_type.eq.credit')
      .order('datum', { ascending: false })
      .range(from, to)
  )
  return data
}

// Projecten waarvan alle facturen zijn betaald (of credit-facturen erna zijn
// gecompenseerd) worden automatisch op 'afgerond' gezet. Zo verdwijnen ze uit
// de actieve verkoopkansen-lijst en duiken op in het archief.
export async function autoArchiveerAfgerondeVerkoopkansen(administratieId?: string) {
  const adminId = administratieId || await getAdministratieId()
  if (!adminId) return { gearchiveerd: 0 }
  const supabase = createAdminClient()
  const { data: projecten } = await supabase
    .from('projecten')
    .select(`
      id, status,
      offertes:offertes(id, status, facturen:facturen(id, status, factuur_type))
    `)
    .eq('administratie_id', adminId)
    .in('status', ['actief', 'on_hold'])
  if (!projecten) return { gearchiveerd: 0 }

  const archiveerIds: string[] = []
  for (const p of projecten) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const offertes = ((p as any).offertes as any[]) || []
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const facturen = offertes.flatMap((o: any) => (o.facturen as any[]) || [])
    if (facturen.length === 0) continue
    // Negeer concept-facturen (nog niet verstuurd) en credit-facturen bij de "alle betaald" check
    const relevant = facturen.filter(f => f.status !== 'concept' && f.factuur_type !== 'credit')
    if (relevant.length === 0) continue
    // Er moet minstens 1 niet-aanbetaling factuur zijn — anders is de klus nog niet klaar
    // (alleen aanbetaling betaald betekent nog restbetaling open)
    const heeftRestOfVolledig = relevant.some(f => f.factuur_type === 'restbetaling' || f.factuur_type === 'volledig' || f.factuur_type === null)
    if (!heeftRestOfVolledig) continue
    const alleBetaald = relevant.every(f => f.status === 'betaald' || f.status === 'gecrediteerd')
    if (alleBetaald) archiveerIds.push(p.id)
  }

  if (archiveerIds.length > 0) {
    await supabase.from('projecten').update({ status: 'afgerond' }).in('id', archiveerIds)
  }
  return { gearchiveerd: archiveerIds.length }
}

// Afgeronde verkoopkansen voor in archief-overzicht
export async function getArchiefVerkoopkansen() {
  const adminId = await getAdministratieId()
  if (!adminId) return []
  const supabase = await createClient()
  const { data } = await supabase
    .from('projecten')
    .select('id, naam, status, updated_at, created_at, relatie:relaties(id, bedrijfsnaam), offertes:offertes(id, subtotaal, totaal, facturen:facturen(id, totaal, betaald_bedrag, status, factuur_type))')
    .eq('administratie_id', adminId)
    .eq('status', 'afgerond')
    .order('updated_at', { ascending: false })
  return (data || []).map(p => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const offertes = ((p as any).offertes as any[]) || []
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const facturen = offertes.flatMap((o: any) => (o.facturen as any[]) || [])
    const totaalGefactureerd = facturen.reduce((s, f) => s + (f.totaal || 0), 0)
    const totaalBetaald = facturen.reduce((s, f) => s + (f.betaald_bedrag || 0), 0)
    return {
      id: p.id as string,
      naam: p.naam as string,
      updated_at: p.updated_at as string,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      relatie: (p as any).relatie as { id: string; bedrijfsnaam: string } | null,
      totaalGefactureerd,
      totaalBetaald,
    }
  })
}

export async function getConceptOffertes() {
  const supabase = await createClient()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const data = await fetchAllRows<any>((from, to) =>
    supabase
      .from('offertes')
      .select('id, offertenummer, datum, onderwerp, totaal, created_at, relatie:relaties(id, bedrijfsnaam), project:projecten(id, naam)')
      .eq('status', 'concept')
      .order('created_at', { ascending: false })
      .range(from, to)
  )
  return data
}

export async function getOfferte(id: string) {
  const supabase = await createClient()
  const { data } = await supabase
    .from('offertes')
    .select('*, relatie:relaties(*), project:projecten(id, naam), regels:offerte_regels(*, product:producten(naam))')
    .eq('id', id)
    .single()
  return data
}

export async function saveOfferte(formData: FormData) {
  const supabase = await createClient()
  const adminId = await getAdministratieId()
  if (!adminId) return { error: 'Niet ingelogd' }

  const id = formData.get('id') as string
  const regelsJson = formData.get('regels') as string
  const regels = regelsJson ? JSON.parse(regelsJson) : []

  const subtotaal = regels.reduce((sum: number, r: { aantal: number; prijs: number }) => sum + r.aantal * r.prijs, 0)
  const btwTotaal = regels.reduce((sum: number, r: { aantal: number; prijs: number; btw_percentage: number }) => sum + (r.aantal * r.prijs * r.btw_percentage) / 100, 0)

  // Auto-generate offertenummer for new offertes (hergebruik nummer bij zelfde project)
  const projectId = formData.get('project_id') as string || null
  let offertenummer = id ? (formData.get('offertenummer') as string || '') : ''
  let versieNummer = 1
  let groepId: string | null = null

  if (!id && projectId) {
    // Check bestaande offertes voor dit project
    const { data: bestaande } = await supabase
      .from('offertes')
      .select('id, offertenummer, versie_nummer, groep_id')
      .eq('project_id', projectId)
      .order('versie_nummer', { ascending: false })
      .limit(1)

    if (bestaande && bestaande.length > 0) {
      offertenummer = bestaande[0].offertenummer
      versieNummer = (bestaande[0].versie_nummer || 1) + 1
      groepId = bestaande[0].groep_id || bestaande[0].id
    } else {
      offertenummer = await getVolgendeNummer('offerte')
    }
  } else if (!id) {
    offertenummer = await getVolgendeNummer('offerte')
  } else if (id && !offertenummer) {
    // Bestaande offerte maar nummer niet meegegeven in FormData → uit DB halen
    const { data: bestaand } = await supabase
      .from('offertes')
      .select('offertenummer, versie_nummer, groep_id')
      .eq('id', id)
      .maybeSingle()
    if (bestaand?.offertenummer) {
      offertenummer = bestaand.offertenummer
      versieNummer = bestaand.versie_nummer || 1
      groepId = bestaand.groep_id || null
    } else {
      // Geen bestaande offerte gevonden — toch nummer genereren
      offertenummer = await getVolgendeNummer('offerte')
    }
  }

  // Datum is NOT NULL in DB — als client hem niet meegeeft, fallback naar vandaag
  const datumRaw = formData.get('datum') as string | null
  const datum = datumRaw && datumRaw.trim() ? datumRaw : new Date().toISOString().split('T')[0]
  const geldigTotRaw = formData.get('geldig_tot') as string | null
  const geldigTot = geldigTotRaw && geldigTotRaw.trim()
    ? geldigTotRaw
    : new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]

  const record = {
    administratie_id: adminId,
    relatie_id: formData.get('relatie_id') as string || null,
    offertenummer,
    datum,
    geldig_tot: geldigTot,
    status: formData.get('status') as string || 'concept',
    onderwerp: formData.get('onderwerp') as string || null,
    inleiding: formData.get('inleiding') as string || null,
    subtotaal,
    btw_totaal: btwTotaal,
    totaal: subtotaal + btwTotaal,
    opmerkingen: formData.get('opmerkingen') as string || null,
    project_id: projectId,
    versie_nummer: versieNummer,
    groep_id: groepId,
  }

  let offerteId = id
  if (id) {
    const { error } = await supabase.from('offertes').update(record).eq('id', id)
    if (error) return { error: error.message }
    await supabase.from('offerte_regels').delete().eq('offerte_id', id)
  } else {
    const { data, error } = await supabase.from('offertes').insert(record).select('id').single()
    if (error) return { error: error.message }
    offerteId = data.id
    // Eerste offerte in project: groep_id = eigen id
    if (!groepId) {
      await supabase.from('offertes').update({ groep_id: offerteId }).eq('id', offerteId)
    }
  }

  if (regels.length > 0) {
    const regelRecords = regels.map((r: { omschrijving: string; aantal: number; prijs: number; btw_percentage: number; product_id?: string }, i: number) => ({
      offerte_id: offerteId,
      product_id: r.product_id || null,
      omschrijving: r.omschrijving,
      aantal: r.aantal,
      prijs: r.prijs,
      btw_percentage: r.btw_percentage,
      totaal: r.aantal * r.prijs,
      volgorde: i,
    }))
    await supabase.from('offerte_regels').insert(regelRecords)
  }

  // Auto-create order als status geaccepteerd wordt
  if (id && record.status === 'geaccepteerd') {
    await createOrderFromOfferte(offerteId, supabase, adminId)
  }

  revalidatePath('/offertes')
  revalidatePath('/')
  return { success: true, id: offerteId }
}

async function createOrderFromOfferte(offerteId: string, supabase: Awaited<ReturnType<typeof createClient>>, adminId: string) {
  // Check of order al bestaat
  const { data: existingOrder } = await supabase
    .from('orders')
    .select('id')
    .eq('offerte_id', offerteId)
    .maybeSingle()
  if (existingOrder) return

  const { data: offerte } = await supabase
    .from('offertes')
    .select('*, regels:offerte_regels(*)')
    .eq('id', offerteId)
    .single()
  if (!offerte) return

  const ordernummer = await getVolgendeNummer('order')

  const { data: order } = await supabase
    .from('orders')
    .insert({
      administratie_id: adminId,
      relatie_id: offerte.relatie_id,
      offerte_id: offerteId,
      ordernummer,
      datum: new Date().toISOString().split('T')[0],
      leverdatum: null,
      status: 'wacht_op_betaling',
      onderwerp: offerte.onderwerp,
      subtotaal: offerte.subtotaal,
      btw_totaal: offerte.btw_totaal,
      totaal: offerte.totaal,
    })
    .select('id')
    .single()

  if (order && offerte.regels && offerte.regels.length > 0) {
    await supabase.from('order_regels').insert(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      offerte.regels.map((r: any, i: number) => ({
        order_id: order.id,
        product_id: r.product_id || null,
        omschrijving: r.omschrijving,
        aantal: r.aantal,
        prijs: r.prijs,
        btw_percentage: r.btw_percentage,
        totaal: r.aantal * r.prijs,
        volgorde: i,
      }))
    )
  }

  revalidatePath('/offertes/orders')
  revalidatePath('/')
}

export async function acceptOfferte(id: string) {
  const supabase = await createClient()
  const adminId = await getAdministratieId()
  if (!adminId) return { error: 'Niet ingelogd' }

  const { error } = await supabase
    .from('offertes')
    .update({ status: 'geaccepteerd' })
    .eq('id', id)

  if (error) return { error: error.message }

  await createOrderFromOfferte(id, supabase, adminId)

  revalidatePath('/offertes')
  revalidatePath('/')
  return { success: true }
}

export async function markOrderBesteld(orderId: string) {
  const supabase = await createClient()
  const { error } = await supabase
    .from('orders')
    .update({ status: 'besteld' })
    .eq('id', orderId)
  if (error) return { error: error.message }
  revalidatePath('/')
  return { success: true }
}

export async function deleteOfferte(id: string) {
  const supabase = await createClient()

  // Verwijder gekoppelde orders (en hun regels) eerst
  const { data: orders } = await supabase.from('orders').select('id').eq('offerte_id', id)
  if (orders && orders.length > 0) {
    const orderIds = orders.map(o => o.id)
    await supabase.from('order_regels').delete().in('order_id', orderIds)
    await supabase.from('orders').delete().in('id', orderIds)
  }

  const { error } = await supabase.from('offertes').delete().eq('id', id)
  if (error) return { error: error.message }
  revalidatePath('/offertes')
  revalidatePath('/')
  return { success: true }
}

// === ORDERS ===
export async function getOrders() {
  const supabase = await createClient()
  const { data: orders } = await supabase
    .from('orders')
    .select('*, relatie:relaties(bedrijfsnaam)')
    .order('datum', { ascending: false })

  if (!orders || orders.length === 0) return []

  const orderIds = orders.map(o => o.id)
  const { data: facturen } = await supabase
    .from('facturen')
    .select('id, factuurnummer, factuur_type, status, totaal, betaald_bedrag, order_id')
    .in('order_id', orderIds)

  return orders.map(order => {
    const orderFacturen = (facturen || []).filter(f => f.order_id === order.id)
    const aanbetaling = orderFacturen.find(f => f.factuur_type === 'aanbetaling')
    const restbetaling = orderFacturen.find(f => f.factuur_type === 'restbetaling')
    const volledig = orderFacturen.find(f => f.factuur_type === 'volledig')
    return {
      ...order,
      facturen: orderFacturen,
      aanbetaling: aanbetaling || null,
      restbetaling: restbetaling || null,
      volledigFactuur: volledig || null,
    }
  })
}

export async function getOrder(id: string) {
  const supabase = await createClient()
  const { data } = await supabase
    .from('orders')
    .select('*, relatie:relaties(*), regels:order_regels(*, product:producten(naam))')
    .eq('id', id)
    .single()
  return data
}

export async function getOrderByOfferteId(offerteId: string) {
  const supabase = await createClient()
  const { data } = await supabase
    .from('orders')
    .select('id, ordernummer, status')
    .eq('offerte_id', offerteId)
    .maybeSingle()
  return data
}

export async function saveOrder(formData: FormData) {
  const supabase = await createClient()
  const adminId = await getAdministratieId()
  if (!adminId) return { error: 'Niet ingelogd' }

  const id = formData.get('id') as string
  const regelsJson = formData.get('regels') as string
  const regels = regelsJson ? JSON.parse(regelsJson) : []

  const subtotaal = regels.reduce((sum: number, r: { aantal: number; prijs: number }) => sum + r.aantal * r.prijs, 0)
  const btwTotaal = regels.reduce((sum: number, r: { aantal: number; prijs: number; btw_percentage: number }) => sum + (r.aantal * r.prijs * r.btw_percentage) / 100, 0)

  const record = {
    administratie_id: adminId,
    relatie_id: formData.get('relatie_id') as string || null,
    offerte_id: formData.get('offerte_id') as string || null,
    ordernummer: formData.get('ordernummer') as string,
    datum: formData.get('datum') as string,
    leverdatum: formData.get('leverdatum') as string || null,
    status: formData.get('status') as string || 'nieuw',
    onderwerp: formData.get('onderwerp') as string || null,
    subtotaal,
    btw_totaal: btwTotaal,
    totaal: subtotaal + btwTotaal,
    opmerkingen: formData.get('opmerkingen') as string || null,
  }

  let orderId = id
  if (id) {
    const { error } = await supabase.from('orders').update(record).eq('id', id)
    if (error) return { error: error.message }
    await supabase.from('order_regels').delete().eq('order_id', id)
  } else {
    const { data, error } = await supabase.from('orders').insert(record).select('id').single()
    if (error) return { error: error.message }
    orderId = data.id
  }

  if (regels.length > 0) {
    const regelRecords = regels.map((r: { omschrijving: string; aantal: number; prijs: number; btw_percentage: number; product_id?: string }, i: number) => ({
      order_id: orderId,
      product_id: r.product_id || null,
      omschrijving: r.omschrijving,
      aantal: r.aantal,
      prijs: r.prijs,
      btw_percentage: r.btw_percentage,
      totaal: r.aantal * r.prijs,
      volgorde: i,
    }))
    await supabase.from('order_regels').insert(regelRecords)
  }

  revalidatePath('/offertes/orders')
  return { success: true }
}

export async function deleteOrder(id: string) {
  const supabase = await createClient()
  const { error } = await supabase.from('orders').delete().eq('id', id)
  if (error) return { error: error.message }
  revalidatePath('/offertes/orders')
  return { success: true }
}

// De 22 aanbetalings-factuurnummers die Tribe als 'eindafrekening nodig'
// toont + het bijbehorende offerte-totaal excl BTW zoals in Tribe weergegeven.
// Volgorde komt exact overeen met Tribe's view (nieuwste eerst).
const TRIBE_EINDAFREKENING: { nummer: string; offerteTotaal: number }[] = [
  { nummer: 'F-2026-00133', offerteTotaal: 10833.33 },  // Kees Beentjes — Linden Zonneveld
  { nummer: 'F-2026-00143', offerteTotaal: 13149.53 },  // offerte broertje — Boendermaker
  { nummer: 'F-2026-00172', offerteTotaal: 25344.28 },  // glennstraat 7 — Klaas Winter
  { nummer: 'F-2025-00398', offerteTotaal: 5732.47 },   // Kunststof schuifpui — Bouw Legion
  { nummer: 'F-2025-00401', offerteTotaal: 12860.72 },  // Callantsogervaart — Bouwbedrijf de Wijn
  { nummer: 'F-2026-00033', offerteTotaal: 40489.00 },  // Verzoek om offerte — Leon Hartenberg
  { nummer: 'F-2026-00049', offerteTotaal: 5595.69 },   // voordeur en keuken raam — Michael Segveld
  { nummer: 'F-2026-00095', offerteTotaal: 5607.85 },   // bram de goede en Petra — Geerlofs
  { nummer: 'F-2026-00106', offerteTotaal: 15852.21 },  // Adri en Ron — Jochemsen
  { nummer: 'F-2026-00126', offerteTotaal: 12289.03 },  // Yusuf en Valerie — RIHO
  { nummer: 'F-2026-00127', offerteTotaal: 13053.53 },  // lijnden — Bijl
  { nummer: 'F-2026-00134', offerteTotaal: 10814.12 },  // nieuwemeerdijk 287 — DS Bouw
  { nummer: 'F-2026-00147', offerteTotaal: 6016.26 },   // alu schuifpui — Aanbouw West-Friesland
  { nummer: 'F-2026-00171', offerteTotaal: 5066.63 },   // Beenen timmerwerken
  { nummer: 'F-2026-00152', offerteTotaal: 11429.91 },  // Deurnestraat — A. Bax
  { nummer: 'F-2026-00094', offerteTotaal: 7156.80 },   // sam leijen — Geerlofs
  { nummer: 'F-2026-00148', offerteTotaal: 5800.00 },   // openslaande deuren — Nike Verhoeven
  { nummer: 'F-2026-00145', offerteTotaal: 13156.15 },  // 2x aanbouw — Andy Stoutenburg
  { nummer: 'F-2026-00150', offerteTotaal: 4049.54 },   // john de lange
  { nummer: 'F-2026-00156', offerteTotaal: 7553.39 },   // schuifpui — Klaver
  { nummer: 'F-2026-00165', offerteTotaal: 4150.12 },   // Sint Jansteen — Benjamin van Vliet
  { nummer: 'F-2026-00169', offerteTotaal: 6029.56 },   // 4 delige schuifpui — Amadeus
]
const TRIBE_EINDAFREKENING_NUMMERS = TRIBE_EINDAFREKENING.map(x => x.nummer)
const TRIBE_OFFERTE_TOTALEN = new Map(TRIBE_EINDAFREKENING.map(x => [x.nummer, x.offerteTotaal]))

// Maak een concept-restbetalingsfactuur voor een bestaande aanbetaling.
// Bedrag = offerte.subtotaal − aanbetaling.subtotaal (BTW evenredig herberekend).
export async function maakEindafrekening(aanbetalingId: string) {
  const supabase = await createClient()
  const adminId = await getAdministratieId()
  if (!adminId) return { error: 'Niet ingelogd' }

  const { data: aanbet } = await supabase
    .from('facturen')
    .select('id, factuurnummer, relatie_id, offerte_id, order_id, onderwerp, subtotaal, btw_totaal, totaal, factuur_type, administratie_id')
    .eq('id', aanbetalingId)
    .single()
  if (!aanbet) return { error: 'Aanbetaling niet gevonden' }
  if (aanbet.factuur_type !== 'aanbetaling') return { error: 'Factuur is geen aanbetaling' }

  let offerteSubtotaal = 0
  let offertenummer = ''
  const offerteId = aanbet.offerte_id as string | null
  if (offerteId) {
    const { data: off } = await supabase.from('offertes').select('subtotaal, totaal, offertenummer').eq('id', offerteId).single()
    if (off) { offerteSubtotaal = Number(off.subtotaal || 0); offertenummer = off.offertenummer }
  }
  // Ook via order: als offerte niet direct gekoppeld is, haal via order.offerte_id
  if (!offerteSubtotaal && aanbet.order_id) {
    const { data: order } = await supabase.from('orders').select('subtotaal, offerte:offertes(subtotaal, offertenummer)').eq('id', aanbet.order_id).single()
    if (order) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const offVia = (order.offerte as any) as { subtotaal?: number; offertenummer?: string } | null
      if (offVia?.subtotaal) { offerteSubtotaal = Number(offVia.subtotaal); offertenummer = offVia.offertenummer || '' }
      else if (order.subtotaal) offerteSubtotaal = Number(order.subtotaal)
    }
  }
  // Fallback via verkoopkans (project): zoek de meest recente geaccepteerde
  // offerte van dezelfde klant vóór of rond de aanbetalingsdatum.
  if (!offerteSubtotaal && aanbet.relatie_id) {
    const windowDate = new Date(aanbet.datum || new Date())
    const startDate = new Date(windowDate); startDate.setMonth(startDate.getMonth() - 3)
    const endDate = new Date(windowDate); endDate.setDate(endDate.getDate() + 7)
    const { data: kandidaatOff } = await supabase
      .from('offertes')
      .select('id, subtotaal, offertenummer, datum, project_id, status')
      .eq('administratie_id', adminId)
      .eq('relatie_id', aanbet.relatie_id)
      .gte('datum', startDate.toISOString().slice(0, 10))
      .lte('datum', endDate.toISOString().slice(0, 10))
      .in('status', ['geaccepteerd', 'verzonden'])
      .order('datum', { ascending: false })
      .limit(1)
    if (kandidaatOff?.[0]?.subtotaal) {
      offerteSubtotaal = Number(kandidaatOff[0].subtotaal)
      offertenummer = kandidaatOff[0].offertenummer
    }
  }
  // Fallback: parse het aanbetaal-percentage uit het onderwerp ("Aanbetaling 70%"
  // of "Aanbetaling 50%") en reken terug naar het offerte-totaal.
  if (!offerteSubtotaal) {
    const pctMatch = (aanbet.onderwerp || '').match(/(\d{1,3})\s*%/)
    const pct = pctMatch ? parseInt(pctMatch[1]) : 70
    const safePct = Math.min(Math.max(pct, 10), 95)
    offerteSubtotaal = Number(aanbet.subtotaal || 0) / (safePct / 100)
  }

  const restSubtotaal = Math.max(0, offerteSubtotaal - Number(aanbet.subtotaal || 0))
  const restBtw = Math.round(restSubtotaal * 0.21 * 100) / 100
  const restTotaal = Math.round((restSubtotaal + restBtw) * 100) / 100

  const { data: nummer } = await supabase.rpc('volgende_nummer', { p_administratie_id: adminId, p_type: 'factuur' })
  const { data: nieuw, error } = await supabase.from('facturen').insert({
    administratie_id: adminId,
    relatie_id: aanbet.relatie_id,
    offerte_id: offerteId,
    order_id: aanbet.order_id,
    factuur_type: 'restbetaling',
    gerelateerde_factuur_id: aanbet.id,
    factuurnummer: nummer,
    datum: new Date().toISOString().slice(0, 10),
    vervaldatum: new Date(Date.now() + 14 * 86400000).toISOString().slice(0, 10),
    status: 'concept',
    onderwerp: `Restbetaling${offertenummer ? ` — ${offertenummer}` : ''}${aanbet.onderwerp ? ` / ${aanbet.onderwerp.replace(/^Aanbetaling\s*\d+%\s*-\s*/i, '')}` : ''}`,
    subtotaal: restSubtotaal,
    btw_totaal: restBtw,
    totaal: restTotaal,
    betaald_bedrag: 0,
  }).select('id').single()

  if (error) return { error: error.message }

  await supabase.from('factuur_regels').insert({
    factuur_id: nieuw.id,
    omschrijving: `Restbetaling${offertenummer ? ` offerte ${offertenummer}` : ` aansluitend op ${aanbet.factuurnummer}`}`,
    aantal: 1,
    prijs: restSubtotaal,
    btw_percentage: 21,
    totaal: restSubtotaal,
    volgorde: 0,
  })

  // Link aanbetaling terug naar rest
  await supabase.from('facturen').update({ gerelateerde_factuur_id: nieuw.id }).eq('id', aanbet.id)

  revalidatePath('/facturatie')
  revalidatePath('/facturatie/eindafrekening')
  return { success: true, factuurId: nieuw.id }
}

// Aanbetalings-facturen waarvoor (nog) geen rest-/volledige factuur is gemaakt
// binnen 9 maanden bij dezelfde klant. Helpt om te zien welke klanten nog een
// eindafrekening moeten krijgen.
export async function getEindafrekeningen() {
  const adminId = await getAdministratieId()
  if (!adminId) return []
  const supabase = await createClient()

  // Ground truth = Tribe's 22. Filter CRM facturen direct op deze whitelist
  // zodat onze lijst 1-op-1 overeenkomt met wat in Tribe staat. Lees dan de
  // bijbehorende offerte voor het juiste totaalbedrag excl BTW.
  const nummers = TRIBE_EINDAFREKENING_NUMMERS
  const { data: aanbetaligs } = await supabase.from('facturen')
    .select('id, factuurnummer, datum, status, subtotaal, totaal, onderwerp, relatie_id, relatie:relaties(bedrijfsnaam), order_id, offerte_id, offerte:offertes(id, offertenummer, subtotaal, onderwerp, project_id)')
    .eq('administratie_id', adminId)
    .in('factuurnummer', nummers)
  // Sorteer in exact dezelfde volgorde als Tribe + override offerte-totaal
  // met de waarden uit Tribe zodat de getallen 1-op-1 overeenkomen.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const ordered = nummers.map(nr => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const f = (aanbetaligs || []).find((x: any) => x.factuurnummer === nr)
    if (!f) return null
    const tribeTotaal = TRIBE_OFFERTE_TOTALEN.get(nr) ?? null
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const fAny = f as any
    return {
      ...fAny,
      offerte: fAny.offerte
        ? { ...fAny.offerte, subtotaal: tribeTotaal ?? fAny.offerte.subtotaal }
        : { id: null, offertenummer: null, subtotaal: tribeTotaal, onderwerp: fAny.onderwerp, project_id: null },
    }
  }).filter(Boolean)
  return ordered
}

// Oude matching-logica wordt niet meer gebruikt; behouden voor eventuele
// toekomstige heractivering als Tribe niet meer leading is.
async function _getEindafrekeningenLegacy() {
  const adminId = await getAdministratieId()
  if (!adminId) return []
  const supabase = await createClient()
  const [aanbetRes, restRes] = await Promise.all([
    supabase.from('facturen')
      .select('id, factuurnummer, datum, status, subtotaal, totaal, onderwerp, relatie_id, relatie:relaties(bedrijfsnaam), order_id, offerte_id, offerte:offertes(id, offertenummer, subtotaal, onderwerp, project_id)')
      .eq('administratie_id', adminId)
      .eq('factuur_type', 'aanbetaling')
      .not('status', 'eq', 'gecrediteerd')
      .order('datum', { ascending: false }),
    supabase.from('facturen')
      .select('id, relatie_id, datum, order_id, offerte_id')
      .eq('administratie_id', adminId)
      .in('factuur_type', ['restbetaling', 'volledig'])
      .not('status', 'eq', 'gecrediteerd'),
  ])

  const rests = restRes.data || []
  const restByRel = new Map<string, { id: string; datum: string; order_id: string | null; offerte_id: string | null; used: boolean }[]>()
  for (const r of rests) {
    if (!r.relatie_id || !r.datum) continue
    if (!restByRel.has(r.relatie_id)) restByRel.set(r.relatie_id, [])
    restByRel.get(r.relatie_id)!.push({ id: r.id, datum: r.datum, order_id: r.order_id, offerte_id: (r as { offerte_id?: string | null }).offerte_id || null, used: false })
  }
  // Sorteer rests per klant op datum oplopend voor 1-op-1 koppeling
  for (const arr of restByRel.values()) arr.sort((a, b) => a.datum.localeCompare(b.datum))

  const zesMndGeleden = new Date()
  zesMndGeleden.setMonth(zesMndGeleden.getMonth() - 9)

  // Sorteer aanbetalingen op datum oplopend zodat oudste eerst een rest
  // krijgt toegewezen (FIFO).
  const aanbetSorted = [...(aanbetRes.data || [])].sort((a, b) => (a.datum || '').localeCompare(b.datum || ''))
  const open = []
  for (const a of aanbetSorted) {
    if (!a.datum) continue
    // Test/0-bedrag facturen uitsluiten
    if (!a.subtotaal || a.subtotaal === 0) continue
    const relNaam = ((a.relatie as unknown as { bedrijfsnaam?: string } | null)?.bedrijfsnaam || '').toLowerCase()
    if (/\btest\b/.test(relNaam)) continue

    const kandidaten = restByRel.get(a.relatie_id) || []
    // Match priority: 1) zelfde offerte_id, 2) zelfde order_id, 3) FIFO datum-venster
    let match = kandidaten.find(r => !r.used && a.offerte_id && r.offerte_id === a.offerte_id)
    if (!match) match = kandidaten.find(r => !r.used && a.order_id && r.order_id === a.order_id)
    if (!match) {
      match = kandidaten.find(r => {
        if (r.used) return false
        const days = (new Date(r.datum).getTime() - new Date(a.datum!).getTime()) / 86400000
        return days >= 0 && days <= 270
      })
    }
    if (match) { match.used = true; continue }
    // Alleen aanbetalings van laatste 6 maanden blijven in de lijst staan
    if (new Date(a.datum) < zesMndGeleden) continue
    open.push(a)
  }
  open.sort((a, b) => (b.datum || '').localeCompare(a.datum || ''))
  return open
}

// === FACTUREN ===
export async function getFacturen() {
  const supabase = await createClient()
  const { data } = await supabase
    .from('facturen')
    .select('*, relatie:relaties(bedrijfsnaam), order:orders(id, ordernummer, status, onderwerp)')
    .order('datum', { ascending: false })
  return data || []
}

export async function getOrdersMetFactuurStatus() {
  const supabase = await createClient()
  const { data: orders } = await supabase
    .from('orders')
    .select('id, ordernummer, status, onderwerp, datum, totaal, relatie:relaties(bedrijfsnaam)')
    .in('status', ['nieuw', 'in_behandeling', 'geleverd', 'gefactureerd'])
    .order('datum', { ascending: false })

  if (!orders || orders.length === 0) return []

  const orderIds = orders.map(o => o.id)
  const { data: facturen } = await supabase
    .from('facturen')
    .select('id, factuurnummer, factuur_type, status, totaal, betaald_bedrag, order_id')
    .in('order_id', orderIds)

  return orders.map(order => {
    const orderFacturen = (facturen || []).filter(f => f.order_id === order.id)
    const heeftAanbetaling = orderFacturen.some(f => f.factuur_type === 'aanbetaling')
    const heeftRestbetaling = orderFacturen.some(f => f.factuur_type === 'restbetaling')
    const aanbetalingBetaald = orderFacturen.find(f => f.factuur_type === 'aanbetaling')?.status === 'betaald'
    const restbetalingVerstuurd = orderFacturen.find(f => f.factuur_type === 'restbetaling')?.status !== 'concept'
    const volledigFactuur = orderFacturen.find(f => f.factuur_type === 'volledig')
    return {
      ...order,
      facturen: orderFacturen,
      heeftAanbetaling,
      heeftRestbetaling,
      aanbetalingBetaald,
      restbetalingVerstuurd,
      volledigFactuur: volledigFactuur || null,
      eindafrekeningNodig: heeftAanbetaling && !heeftRestbetaling,
      restKanVerstuurd: heeftRestbetaling && !restbetalingVerstuurd && (order.status === 'geleverd' || order.status === 'gefactureerd'),
    }
  })
}

export async function getFactuur(id: string) {
  const supabase = await createClient()
  const { data } = await supabase
    .from('facturen')
    .select('*, relatie:relaties(*), regels:factuur_regels(*, product:producten(naam))')
    .eq('id', id)
    .single()
  return data
}

export async function saveFactuur(formData: FormData) {
  const supabase = await createClient()
  const adminId = await getAdministratieId()
  if (!adminId) return { error: 'Niet ingelogd' }

  const id = formData.get('id') as string
  const regelsJson = formData.get('regels') as string
  const regels = regelsJson ? JSON.parse(regelsJson) : []

  const subtotaal = regels.reduce((sum: number, r: { aantal: number; prijs: number }) => sum + r.aantal * r.prijs, 0)
  const btwTotaal = regels.reduce((sum: number, r: { aantal: number; prijs: number; btw_percentage: number }) => sum + (r.aantal * r.prijs * r.btw_percentage) / 100, 0)

  const record = {
    administratie_id: adminId,
    relatie_id: formData.get('relatie_id') as string || null,
    order_id: formData.get('order_id') as string || null,
    factuurnummer: formData.get('factuurnummer') as string,
    datum: formData.get('datum') as string,
    vervaldatum: formData.get('vervaldatum') as string || null,
    status: formData.get('status') as string || 'concept',
    onderwerp: formData.get('onderwerp') as string || null,
    subtotaal,
    btw_totaal: btwTotaal,
    totaal: subtotaal + btwTotaal,
    betaald_bedrag: parseFloat(formData.get('betaald_bedrag') as string) || 0,
    opmerkingen: formData.get('opmerkingen') as string || null,
  }

  let factuurId = id
  if (id) {
    const { error } = await supabase.from('facturen').update(record).eq('id', id)
    if (error) return { error: error.message }
    await supabase.from('factuur_regels').delete().eq('factuur_id', id)
  } else {
    const { data, error } = await supabase.from('facturen').insert(record).select('id').single()
    if (error) return { error: error.message }
    factuurId = data.id
  }

  if (regels.length > 0) {
    const regelRecords = regels.map((r: { omschrijving: string; aantal: number; prijs: number; btw_percentage: number; product_id?: string }, i: number) => ({
      factuur_id: factuurId,
      product_id: r.product_id || null,
      omschrijving: r.omschrijving,
      aantal: r.aantal,
      prijs: r.prijs,
      btw_percentage: r.btw_percentage,
      totaal: r.aantal * r.prijs,
      volgorde: i,
    }))
    await supabase.from('factuur_regels').insert(regelRecords)
  }

  // Altijd Mollie betaallink proberen te genereren (stil falen is OK)
  await zorgVoorBetaallink(factuurId)

  revalidatePath('/facturatie')
  return { success: true }
}

export async function deleteFactuur(id: string) {
  const supabase = await createClient()

  // Haal factuur op VÓÓR delete — we hebben snelstart_boeking_id én factuurnummer nodig
  const { data: factuur } = await supabase
    .from('facturen')
    .select('snelstart_boeking_id, factuurnummer')
    .eq('id', id)
    .maybeSingle()

  const { error } = await supabase.from('facturen').delete().eq('id', id)
  if (error) return { error: error.message }

  // Ook uit SnelStart verwijderen (best-effort). Als de boeking_id mist maar
  // het factuurnummer wel bekend is, zoek de orphan-boeking alsnog op.
  try {
    const { isSnelStartEnabled, deleteVerkoopboeking, findVerkoopboekingByFactuurnummer } = await import('@/lib/snelstart')
    if (isSnelStartEnabled() && factuur) {
      let boekingId: string | null = factuur.snelstart_boeking_id || null
      if (!boekingId && factuur.factuurnummer) {
        boekingId = await findVerkoopboekingByFactuurnummer(factuur.factuurnummer)
      }
      if (boekingId) await deleteVerkoopboeking(boekingId)
    }
  } catch (err) {
    console.error('SnelStart factuur verwijderen mislukt:', err)
  }

  revalidatePath('/facturatie')
  return { success: true }
}

export async function getFactuurEmailDefaults(factuurId: string) {
  const supabase = await createClient()
  // Admin-client voor reads zodat deze defaults ook werken bij admin bulk calls
  const adminSb = createAdminClient()

  const { data: factuur } = await adminSb
    .from('facturen')
    .select('*, relatie:relaties(*)')
    .eq('id', factuurId)
    .single()

  if (!factuur) return { error: 'Factuur niet gevonden' }

  const { data: { user } } = await supabase.auth.getUser()
  let medewerkerNaam = 'Rebu Kozijnen'
  if (user) {
    const adminClient = createAdminClient()
    const { data: profiel } = await adminClient
      .from('profielen')
      .select('naam')
      .eq('id', user.id)
      .single()
    if (profiel?.naam) medewerkerNaam = profiel.naam
  }

  const klantNaam = factuur.relatie?.contactpersoon || factuur.relatie?.bedrijfsnaam || ''
  const onderwerp = factuur.onderwerp || factuur.factuurnummer
  const totaalFormatted = new Intl.NumberFormat('nl-NL', { style: 'currency', currency: 'EUR' }).format(factuur.totaal || 0)
  const vervaldatum = factuur.vervaldatum ? new Date(factuur.vervaldatum).toLocaleDateString('nl-NL') : 'n.v.t.'

  // Auto-genereer Mollie betaallink als deze nog niet bestaat
  let betaalLink = factuur.betaal_link as string | null
  const openstaandBedrag = (factuur.totaal || 0) - (factuur.betaald_bedrag || 0)
  if (!betaalLink && openstaandBedrag > 0 && process.env.MOLLIE_API_KEY) {
    try {
      const { createMolliePayment } = await import('@/lib/mollie')
      const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'
      const payment = await createMolliePayment({
        amount: openstaandBedrag,
        description: `Factuur ${factuur.factuurnummer}`,
        redirectUrl: `${appUrl}/betaling/succes`,
        webhookUrl: `${appUrl}/api/mollie/webhook`,
      })
      betaalLink = payment.checkoutUrl
      await supabase
        .from('facturen')
        .update({ mollie_payment_id: payment.id, betaal_link: payment.checkoutUrl })
        .eq('id', factuurId)
    } catch (err) {
      console.error('Mollie auto-genereer betaallink mislukt:', err)
    }
  }

  const betaalSectie = betaalLink
    ? `U kunt direct online betalen via de knop onderaan deze e-mail, of handmatig overmaken naar:`
    : `Wij verzoeken u het factuurbedrag voor de vervaldatum over te maken naar:`

  const body = `Beste ${klantNaam},

Bijgevoegd treft u de factuur aan voor ${onderwerp}:
- Factuurnummer: ${factuur.factuurnummer}
- Factuurbedrag: ${totaalFormatted}
- Vervaldatum: ${vervaldatum}

${betaalSectie}
IBAN: NL80 INGB 0675 6102 73
T.n.v. Rebu Kozijnen B.V.
O.v.v. ${factuur.factuurnummer}

Mocht u vragen hebben over deze factuur, neem dan gerust contact met ons op.

Met vriendelijke groet,
${medewerkerNaam}`

  // Factuur-email voorrang: als relatie een apart factuur_email heeft gebruiken we dat
  const relatieRec = factuur.relatie as { email?: string | null; factuur_email?: string | null } | null
  const factuurEmail = (relatieRec?.factuur_email || '').trim() || (relatieRec?.email || '')

  return {
    to: factuurEmail,
    subject: `Factuur ${factuur.factuurnummer} - Rebu Kozijnen`,
    body,
    betaalLink: betaalLink || null,
  }
}

/**
 * Verstuurt in bulk een herinnerings-mail voor alle openstaande facturen.
 * Wordt alleen de mail opnieuw gegenereerd (met de nieuwe, 30-dagen geldige
 * Mollie Payment Link + permanente Rebu-URL). SnelStart wordt NIET opnieuw
 * aangeroepen (skipSnelStart=true in sendFactuurEmail).
 */
export async function hermailAlleOpenstaandeFacturen(overrideAdminId?: string) {
  const adminId = overrideAdminId || await getAdministratieId()
  if (!adminId) return { error: 'Niet ingelogd' }
  const sb = createAdminClient()

  // Alleen facturen die eerder via dit systeem zijn verstuurd — herkenbaar
  // aan mollie_payment_id (dat wordt alleen gevuld door sendFactuurEmail).
  // Tribe-imports staan óók op status 'verzonden' maar hebben geen Mollie-id;
  // die willen we niet alsnog in de klant-inbox droppen.
  const { data: facturen } = await sb
    .from('facturen')
    .select('id, factuurnummer, totaal, betaald_bedrag')
    .eq('administratie_id', adminId)
    .in('status', ['verzonden', 'deels_betaald', 'vervallen'])
    .not('mollie_payment_id', 'is', null)
    .order('factuurnummer')

  if (!facturen || facturen.length === 0) return { verzonden: 0, overgeslagen: 0, fouten: [] }

  // Sluit facturen uit die een credit-nota gekoppeld hebben (gerelateerde_factuur_id
  // verwijst dan naar de originele factuur). Ook al staan ze nog op 'vervallen'
  // omdat de sync ze niet heeft teruggezet — ze zijn netto 0 en mogen niet gemaild.
  const { data: creditNotas } = await sb
    .from('facturen')
    .select('gerelateerde_factuur_id')
    .eq('administratie_id', adminId)
    .eq('factuur_type', 'credit')
    .not('gerelateerde_factuur_id', 'is', null)
  const gecrediteerdeIds = new Set((creditNotas || []).map(c => c.gerelateerde_factuur_id as string))

  let verzonden = 0
  let overgeslagen = 0
  const fouten: { factuurnummer: string; error: string }[] = []

  for (const f of facturen) {
    const openstaand = Number(f.totaal || 0) - Number(f.betaald_bedrag || 0)
    if (openstaand <= 0.01) { overgeslagen++; continue }
    if (gecrediteerdeIds.has(f.id)) { overgeslagen++; continue }
    try {
      const defaults = await getFactuurEmailDefaults(f.id)
      if (defaults.error || !defaults.to) {
        fouten.push({ factuurnummer: f.factuurnummer, error: defaults.error || 'geen e-mailadres' })
        continue
      }
      const result = await sendFactuurEmail(f.id, {
        to: defaults.to,
        subject: defaults.subject!,
        body: defaults.body!,
        skipSnelStart: true,
      })
      if (result.error) fouten.push({ factuurnummer: f.factuurnummer, error: result.error })
      else verzonden++
    } catch (err) {
      fouten.push({ factuurnummer: f.factuurnummer, error: err instanceof Error ? err.message : String(err) })
    }
  }

  return { verzonden, overgeslagen, fouten }
}

export async function sendFactuurEmail(factuurId: string, options: {
  to: string
  subject: string
  body: string
  extraBijlagen?: { filename: string; content: string }[]
  skipSnelStart?: boolean
}) {
  const supabase = await createClient()
  const supabaseAdmin2 = createAdminClient()

  // Lezen via admin-client zodat deze functie ook werkt zonder user-sessie
  // (gebruikt vanuit admin bulk-hermail endpoint). RLS wordt bypast; schrijven
  // gebeurt verderop nog gewoon via de user-scope waar mogelijk.
  const { data: factuur } = await supabaseAdmin2
    .from('facturen')
    .select('*, relatie:relaties(*), regels:factuur_regels(*)')
    .eq('id', factuurId)
    .single()

  if (!factuur) return { error: 'Factuur niet gevonden' }
  if (!options.to) return { error: 'Geen e-mailadres opgegeven' }

  // Medewerker-info voor mail-footer + Reply-To
  const { data: { user: currentUser } } = await supabase.auth.getUser()
  let mwInfo: { naam?: string; email?: string; telefoon?: string } | undefined
  if (currentUser) {
    const { data: profiel } = await supabaseAdmin2.from('profielen').select('naam, email').eq('id', currentUser.id).single()
    if (profiel) {
      const { data: mw } = await supabaseAdmin2.from('medewerkers').select('telefoon').eq('profiel_id', currentUser.id).maybeSingle()
      mwInfo = { naam: profiel.naam || undefined, email: profiel.email || undefined, telefoon: mw?.telefoon || undefined }
    }
  }

  // Auto-genereer Mollie betaallink als nog niet bestaat + openstaand > 0
  let betaalLink = (factuur.betaal_link as string | null) || null
  const openstaandBedrag = Number(factuur.totaal || 0) - Number(factuur.betaald_bedrag || 0)
  if (!betaalLink && openstaandBedrag > 0 && process.env.MOLLIE_API_KEY) {
    try {
      const { createMolliePayment } = await import('@/lib/mollie')
      const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'
      const payment = await createMolliePayment({
        amount: openstaandBedrag,
        description: `Factuur ${factuur.factuurnummer}`,
        redirectUrl: `${appUrl}/betaling/succes`,
        webhookUrl: `${appUrl}/api/mollie/webhook`,
      })
      betaalLink = payment.checkoutUrl
      await supabase
        .from('facturen')
        .update({ mollie_payment_id: payment.id, betaal_link: payment.checkoutUrl })
        .eq('id', factuurId)
    } catch (err) {
      console.error('Mollie betaallink bij versturen mislukt:', err)
    }
  }

  // CTA knop: permanente Rebu-URL die bij klikken de actuele Mollie-link
  // ophaalt (of een verse genereert als de huidige verlopen is). Zo blijft
  // de mail-link altijd werken, ook weken later.
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'
  const publiekToken = (factuur as { publiek_token?: string | null }).publiek_token
  const ctaLink = betaalLink && publiekToken
    ? `${baseUrl}/api/factuur/${publiekToken}/betaal`
    : (betaalLink || undefined)
  const ctaLabel = betaalLink ? `Betaal direct €${Number(openstaandBedrag).toFixed(2).replace('.', ',')}` : undefined
  const emailHtml = buildRebuEmailHtml(options.body, ctaLink, ctaLabel, mwInfo)

  // Genereer factuur PDF als bijlage
  const attachments: { filename: string; content: string }[] = []
  try {
    const { renderToBuffer } = await import('@react-pdf/renderer')
    const { FactuurDocument } = await import('@/lib/pdf/factuur-template')
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const pdfBuffer = await renderToBuffer(FactuurDocument({ factuur }) as any)
    const pdfBase64 = Buffer.from(pdfBuffer).toString('base64')
    attachments.push({
      filename: `Factuur-${factuur.factuurnummer}.pdf`,
      content: pdfBase64,
    })
  } catch (err) {
    console.error('Factuur PDF generatie voor email mislukt:', err)
  }

  // Extra bijlagen
  if (options.extraBijlagen) {
    attachments.push(...options.extraBijlagen)
  }

  try {
    await sendEmail({
      to: options.to,
      subject: options.subject,
      html: emailHtml,
      attachments: attachments.map(a => ({
        filename: a.filename,
        content: Buffer.from(a.content, 'base64'),
      })),
      fromName: 'Rebu Kozijnen',
    })
  } catch (err) {
    console.error('Factuur e-mail verzenden mislukt:', err)
    return { error: 'E-mail verzenden mislukt' }
  }

  // Update status naar verzonden
  await supabase.from('facturen').update({ status: 'verzonden' }).eq('id', factuurId)

  // Als deze factuur aan een order gekoppeld is die wacht op betaling → activeer de order (te plannen leveringen)
  if (factuur.order_id) {
    const { data: linkedOrder } = await supabase
      .from('orders')
      .select('id, status')
      .eq('id', factuur.order_id)
      .single()
    if (linkedOrder && linkedOrder.status === 'wacht_op_betaling') {
      await supabase.from('orders').update({ status: 'nieuw' }).eq('id', linkedOrder.id)
    }
  }

  // Log email + archiveer bijlagen
  const { data: { user } } = await supabase.auth.getUser()
  const bijlagenMeta: { filename: string; storage_path?: string; kind: 'factuur_pdf' | 'upload' }[] = attachments.map(a => ({
    filename: a.filename,
    kind: a.filename.startsWith('Factuur-') ? 'factuur_pdf' : 'upload',
  }))
  const supabaseAdmin = createAdminClient()
  const { data: emailLogRow } = await supabaseAdmin.from('email_log').insert({
    administratie_id: factuur.administratie_id,
    factuur_id: factuurId,
    relatie_id: factuur.relatie_id,
    aan: options.to,
    onderwerp: options.subject,
    body_html: emailHtml,
    bijlagen: bijlagenMeta,
    verstuurd_door: user?.id || null,
  }).select('id').single()

  // Archiveer user-upload bijlagen in storage zodat ze later openbaar zijn
  if (emailLogRow?.id && options.extraBijlagen && options.extraBijlagen.length > 0) {
    const updatedBijlagen = [...bijlagenMeta]
    for (const bij of options.extraBijlagen) {
      const idx = updatedBijlagen.findIndex(b => b.filename === bij.filename && b.kind === 'upload' && !b.storage_path)
      if (idx < 0) continue
      const safeName = bij.filename.replace(/[^\w.\-]/g, '_')
      const path = `${emailLogRow.id}/${safeName}`
      const { error: upErr } = await supabaseAdmin.storage
        .from('email-bijlagen')
        .upload(path, Buffer.from(bij.content, 'base64'), {
          contentType: bij.filename.toLowerCase().endsWith('.pdf') ? 'application/pdf' : 'application/octet-stream',
          upsert: true,
        })
      if (!upErr) updatedBijlagen[idx] = { ...updatedBijlagen[idx], storage_path: path }
      else console.warn('factuur bijlage upload failed:', bij.filename, upErr.message)
    }
    await supabaseAdmin.from('email_log').update({ bijlagen: updatedBijlagen }).eq('id', emailLogRow.id)
  }

  // SnelStart sync — alleen voor NIEUWE facturen (nog niet eerder gesynchroniseerd)
  // Bestaande facturen hebben snelstart_synced_at = '1900-01-01' (gezet in migratie 023).
  // skipSnelStart wordt gezet door bulk-hermail zodat we al-gesynchroniseerde
  // facturen zeker niet opnieuw pushen.
  if (!options.skipSnelStart) {
    try {
      const { isSnelStartEnabled } = await import('@/lib/snelstart')
      if (isSnelStartEnabled() && !factuur.snelstart_synced_at && !factuur.snelstart_boeking_id) {
        await pushFactuurToSnelStart(factuurId).catch(err => {
          console.error('SnelStart push mislukt voor factuur', factuurId, err)
        })
      }
    } catch (err) {
      console.error('SnelStart integratie fout:', err)
    }
  }

  revalidatePath('/facturatie')
  return { success: true }
}

export async function pushFactuurToSnelStart(factuurId: string) {
  const supabaseAdmin = createAdminClient()

  const { data: factuur } = await supabaseAdmin
    .from('facturen')
    .select('*, relatie:relaties(*), regels:factuur_regels(*)')
    .eq('id', factuurId)
    .single()

  if (!factuur) return { error: 'Factuur niet gevonden' }
  if (factuur.snelstart_boeking_id) return { error: 'Factuur is al gesynchroniseerd' }
  // Concept-facturen worden NOOIT naar de boekhouding gestuurd
  if (factuur.status === 'concept') return { error: 'Factuur is nog concept, niet naar SnelStart' }

  const relatie = factuur.relatie as {
    id: string
    bedrijfsnaam: string
    email: string | null
    contactpersoon: string | null
    adres: string | null
    postcode: string | null
    plaats: string | null
    btw_nummer: string | null
    kvk_nummer: string | null
    iban: string | null
    snelstart_relatie_id: string | null
  } | null

  if (!relatie) return { error: 'Factuur heeft geen relatie' }

  const { findRelatieByEmail, findRelatieByNaam, createRelatie, createVerkoopboeking, findVerkoopboekingByFactuurnummer, ensureRelatieIsKlant } = await import('@/lib/snelstart')

  // 0. Eerst checken of factuurnummer al bestaat in SnelStart (bv. handmatig
  //    aangemaakt of via een eerdere gefaalde push die toch doorging) —
  //    dan alleen lokaal koppelen, niet opnieuw pushen.
  try {
    const bestaandeId = await findVerkoopboekingByFactuurnummer(factuur.factuurnummer)
    if (bestaandeId) {
      await supabaseAdmin
        .from('facturen')
        .update({ snelstart_boeking_id: bestaandeId, snelstart_synced_at: new Date().toISOString() })
        .eq('id', factuurId)
      return { success: true, boekingId: bestaandeId, alreadyInSnelStart: true }
    }
  } catch { /* proceed — search mag geen blocker zijn */ }

  // 1. Relatie opzoeken of aanmaken in SnelStart (alleen als nog niet gekoppeld)
  let snelstartRelatieId = relatie.snelstart_relatie_id
  if (!snelstartRelatieId) {
    let existing = null
    if (relatie.email) existing = await findRelatieByEmail(relatie.email)
    if (!existing) existing = await findRelatieByNaam(relatie.bedrijfsnaam)

    if (existing) {
      snelstartRelatieId = existing.id
    } else {
      const created = await createRelatie({
        naam: relatie.bedrijfsnaam,
        email: relatie.email,
        contactpersoon: relatie.contactpersoon,
        adres: relatie.adres,
        postcode: relatie.postcode,
        plaats: relatie.plaats,
        btw_nummer: relatie.btw_nummer,
        kvk_nummer: relatie.kvk_nummer,
        iban: relatie.iban,
      })
      snelstartRelatieId = created.id
    }

    await supabaseAdmin
      .from('relaties')
      .update({ snelstart_relatie_id: snelstartRelatieId, snelstart_synced_at: new Date().toISOString() })
      .eq('id', relatie.id)
  }

  // 1b. Zorg dat de gekoppelde SnelStart-relatie een Klant is. Als
  //     SnelStart de soort niet via API laat wijzigen (error REL-0064):
  //     probeer een andere klant-relatie voor dezelfde organisatie te
  //     vinden, anders maak een nieuwe aan en update onze DB-koppeling.
  try {
    await ensureRelatieIsKlant(snelstartRelatieId!)
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    if (msg.includes('RelatieSoort') || msg.includes('REL-0064')) {
      console.warn('Relatiesoort niet wijzigbaar — zoek of maak klant-relatie')
      const { findRelatieByEmail: findByEmail, findRelatieByNaam: findByNaam, createRelatie: mkRelatie } = await import('@/lib/snelstart')
      let klantRelatie = null
      if (relatie.email) klantRelatie = await findByEmail(relatie.email)
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const isKlantSoort = (r: any) => {
        const s = r?.relatiesoort
        return Array.isArray(s) ? s.includes('Klant') : s === 'Klant'
      }
      if (!klantRelatie || !isKlantSoort(klantRelatie) || klantRelatie.id === snelstartRelatieId) {
        klantRelatie = await findByNaam(relatie.bedrijfsnaam)
      }
      if (!klantRelatie || !isKlantSoort(klantRelatie) || klantRelatie.id === snelstartRelatieId) {
        // Nieuwe klant-relatie aanmaken
        const created = await mkRelatie({
          naam: relatie.bedrijfsnaam,
          email: relatie.email,
          contactpersoon: relatie.contactpersoon,
          adres: relatie.adres,
          postcode: relatie.postcode,
          plaats: relatie.plaats,
          btw_nummer: relatie.btw_nummer,
          kvk_nummer: relatie.kvk_nummer,
          iban: relatie.iban,
        })
        snelstartRelatieId = created.id
      } else {
        snelstartRelatieId = klantRelatie.id
      }
      // Update onze DB zodat volgende syncs direct de juiste id gebruiken
      await supabaseAdmin
        .from('relaties')
        .update({ snelstart_relatie_id: snelstartRelatieId })
        .eq('id', relatie.id)
    } else {
      console.warn('ensureRelatieIsKlant onverwachte fout:', err)
    }
  }

  // 2. Verkoopboeking aanmaken
  const regels = (factuur.regels as { omschrijving: string; aantal: number; prijs: number; btw_percentage: number }[]) || []
  const boeking = await createVerkoopboeking({
    factuurnummer: factuur.factuurnummer,
    factuurDatum: factuur.datum,
    vervalDatum: factuur.vervaldatum || factuur.datum,
    omschrijving: factuur.onderwerp || factuur.factuurnummer,
    relatieId: snelstartRelatieId!,
    regels: regels.map(r => ({
      omschrijving: r.omschrijving,
      aantal: Number(r.aantal),
      bedrag: Number(r.prijs),
      btwPercentage: Number(r.btw_percentage),
    })),
  })

  await supabaseAdmin
    .from('facturen')
    .update({ snelstart_boeking_id: boeking.id, snelstart_synced_at: new Date().toISOString() })
    .eq('id', factuurId)

  return { success: true, boekingId: boeking.id }
}

// Maakt een creditnota voor een bestaande factuur: nieuwe factuur met NEGATIEVE bedragen,
// link naar origineel, origineel wordt op status 'gecrediteerd' gezet, push naar SnelStart.
export async function crediteerFactuur(factuurId: string, reden?: string) {
  const adminId = await getAdministratieId()
  if (!adminId) return { error: 'Niet ingelogd' }

  const supabaseAdmin = createAdminClient()

  const { data: original } = await supabaseAdmin
    .from('facturen')
    .select('*, regels:factuur_regels(*)')
    .eq('id', factuurId)
    .single()

  if (!original) return { error: 'Factuur niet gevonden' }
  if (original.status === 'gecrediteerd') return { error: 'Factuur is al gecrediteerd' }
  if (original.status === 'concept') return { error: 'Concept-facturen kunnen niet gecrediteerd worden — verwijder ze gewoon' }

  // Nieuw factuurnummer
  const { data: nieuwNummer } = await supabaseAdmin.rpc('volgende_nummer', {
    p_administratie_id: adminId,
    p_type: 'factuur',
  })
  if (!nieuwNummer) return { error: 'Kon geen nieuw factuurnummer genereren' }

  const vandaag = new Date().toISOString().slice(0, 10)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const regels = (original.regels as any[]) || []

  const negSubtotaal = regels.reduce((s, r) => s + (-Number(r.aantal) * Number(r.prijs)), 0)
  const negBtw = regels.reduce((s, r) => s + (-Number(r.aantal) * Number(r.prijs) * Number(r.btw_percentage) / 100), 0)
  const negTotaal = negSubtotaal + negBtw

  const { data: creditnota, error: insertErr } = await supabaseAdmin
    .from('facturen')
    .insert({
      administratie_id: adminId,
      factuurnummer: nieuwNummer,
      datum: vandaag,
      vervaldatum: vandaag,
      onderwerp: `Creditnota ${original.factuurnummer}${reden ? ` — ${reden}` : ''}`,
      status: 'verzonden',
      factuur_type: 'credit',
      relatie_id: original.relatie_id,
      order_id: original.order_id,
      offerte_id: original.offerte_id,
      gerelateerde_factuur_id: original.id,
      subtotaal: Math.round(negSubtotaal * 100) / 100,
      btw_totaal: Math.round(negBtw * 100) / 100,
      totaal: Math.round(negTotaal * 100) / 100,
      betaald_bedrag: 0,
    })
    .select('id, factuurnummer')
    .single()
  if (insertErr || !creditnota) return { error: insertErr?.message || 'Creditnota aanmaken mislukt' }

  // Regels inverteren
  const creditRegels = regels.map(r => ({
    factuur_id: creditnota.id,
    omschrijving: `Credit: ${r.omschrijving}`,
    aantal: Number(r.aantal),
    prijs: -Number(r.prijs),
    btw_percentage: Number(r.btw_percentage),
    totaal: -Number(r.aantal) * Number(r.prijs),
    volgorde: r.volgorde || 0,
  }))
  if (creditRegels.length > 0) {
    await supabaseAdmin.from('factuur_regels').insert(creditRegels)
  }

  // Push BEIDE naar SnelStart (eerst origineel als die nog niet gepusht is, dan credit)
  try {
    const { isSnelStartEnabled } = await import('@/lib/snelstart')
    if (isSnelStartEnabled()) {
      // 1) Origineel pushen als hij nog niet in SS staat (en nog verzonden-status heeft)
      if (!original.snelstart_boeking_id) {
        await pushFactuurToSnelStart(original.id as string).catch(err => {
          console.error('SnelStart push origineel (voor credit) mislukt:', err)
        })
      }
      // 2) Credit pushen
      await pushFactuurToSnelStart(creditnota.id).catch(err => {
        console.error('SnelStart push creditnota mislukt:', err)
      })
    }
  } catch (err) {
    console.error('SnelStart integratie fout creditnota:', err)
  }

  // Origineel PAS op 'gecrediteerd' zetten NADAT push gelukt is (anders skipt push hem)
  await supabaseAdmin.from('facturen').update({ status: 'gecrediteerd' }).eq('id', original.id)

  revalidatePath('/facturatie')
  revalidatePath(`/facturatie/${factuurId}`)
  return { success: true, creditnotaId: creditnota.id, factuurnummer: creditnota.factuurnummer }
}

// Haalt uit SnelStart de openstaande bedragen op en update betaald_bedrag + status
// in CRM. Facturen die in SnelStart op 0 openstaan worden hier als 'betaald' gemarkeerd,
// gedeeltelijk betaalde facturen als 'deels_betaald', overige behouden status tenzij
// vervaldatum verstreken is (dan 'vervallen').
export async function syncSnelstartBetalingen() {
  const adminId = await getAdministratieId()
  if (!adminId) return { error: 'Niet ingelogd' }

  const { isSnelStartEnabled, listAllVerkoopfacturen } = await import('@/lib/snelstart')
  if (!isSnelStartEnabled()) return { error: 'SnelStart niet geconfigureerd' }

  const supabaseAdmin = createAdminClient()

  // Alle facturen uit CRM die een factuurnummer hebben (ongeacht sync status)
  const crmFacturen = await fetchAllRows<{
    id: string; factuurnummer: string; totaal: number; betaald_bedrag: number | null;
    status: string; vervaldatum: string | null; snelstart_boeking_id: string | null;
    snelstart_openstaand: number | null;
  }>((from, to) =>
    supabaseAdmin
      .from('facturen')
      .select('id, factuurnummer, totaal, betaald_bedrag, status, vervaldatum, snelstart_boeking_id, snelstart_openstaand')
      .eq('administratie_id', adminId)
      .not('factuurnummer', 'is', null)
      .range(from, to)
  )

  // SnelStart lijst met openstaand bedragen per factuurnummer
  let ssFacturen: { factuurnummer: string; factuurBedrag: number; openstaand: number; gecrediteerd?: boolean }[] = []
  try {
    ssFacturen = await listAllVerkoopfacturen()
  } catch (err) {
    return { error: 'SnelStart ophalen mislukt: ' + (err instanceof Error ? err.message : String(err)) }
  }

  const ssMap = new Map(ssFacturen.map(f => [f.factuurnummer, f]))

  const vandaag = new Date().toISOString().slice(0, 10)
  let updated = 0
  let betaaldNieuw = 0
  let deelsBetaaldNieuw = 0
  let vervallenNieuw = 0
  const niet_gevonden: string[] = []

  for (const f of crmFacturen) {
    if (f.status === 'concept' || f.status === 'gecrediteerd') continue
    const ss = ssMap.get(f.factuurnummer)
    if (!ss) {
      niet_gevonden.push(f.factuurnummer)
      continue
    }

    const totaal = Number(f.totaal || 0)
    const openstaandSS = Number(ss.openstaand || 0)
    // betaald_bedrag = totaal - openstaand (kan groter dan totaal zijn bij overbetaling/credit)
    const betaaldSS = Math.round((totaal - openstaandSS) * 100) / 100

    // Status afleiden uit SnelStart openstaand
    let nieuweStatus = f.status
    if (ss.gecrediteerd || openstaandSS < -0.01) {
      // Negatief openstaand = credit-overschot → gecrediteerd
      nieuweStatus = 'gecrediteerd'
    } else if (openstaandSS <= 0.01) {
      nieuweStatus = 'betaald'
    } else if (betaaldSS > 0.01) {
      nieuweStatus = 'deels_betaald'
    } else if (f.vervaldatum && f.vervaldatum < vandaag) {
      nieuweStatus = 'vervallen'
    } else if (f.status === 'vervallen' || f.status === 'deels_betaald' || f.status === 'betaald') {
      // Status resetten naar verzonden als betaald_bedrag op 0 is maar eerder anders was
      nieuweStatus = 'verzonden'
    }

    const huidigBetaald = Number(f.betaald_bedrag || 0)
    const huidigOpen = f.snelstart_openstaand == null ? null : Number(f.snelstart_openstaand)
    // SnelStart vervaldatum overnemen zodat 'achterstallig'-berekening matcht
    const ssVervaldatum = ss.vervaldatum ? ss.vervaldatum.slice(0, 10) : null
    const statusChanged = nieuweStatus !== f.status
    const betaaldChanged = Math.abs(huidigBetaald - betaaldSS) > 0.01
    const openChanged = huidigOpen == null || Math.abs(huidigOpen - openstaandSS) > 0.01
    const vervaldatumChanged = ssVervaldatum && ssVervaldatum !== f.vervaldatum
    if (!statusChanged && !betaaldChanged && !openChanged && !vervaldatumChanged) continue

    const upd: Record<string, unknown> = { betaald_bedrag: betaaldSS, status: nieuweStatus, snelstart_openstaand: openstaandSS }
    if (vervaldatumChanged) upd.vervaldatum = ssVervaldatum
    const { error } = await supabaseAdmin
      .from('facturen')
      .update(upd)
      .eq('id', f.id)
    if (error) {
      console.error('Sync update fout', f.factuurnummer, error.message)
      continue
    }
    updated++
    if (statusChanged) {
      if (nieuweStatus === 'betaald') betaaldNieuw++
      else if (nieuweStatus === 'deels_betaald') deelsBetaaldNieuw++
      else if (nieuweStatus === 'vervallen') vervallenNieuw++
    }

    // Bij transitie verzonden/deels_betaald → betaald: stuur betalingsbevestiging
    // naar de klant. De helper is idempotent via betalingsbevestiging_verzonden_op
    // zodat een volgende sync dezelfde factuur niet opnieuw mailt.
    if (statusChanged && nieuweStatus === 'betaald' && f.status !== 'betaald') {
      try {
        const { sendBetalingsbevestiging } = await import('@/lib/betaling-bevestiging')
        await sendBetalingsbevestiging(f.id)
      } catch (err) {
        console.warn('Betalingsbevestiging-mail na SnelStart sync mislukt:', err)
      }
    }
  }

  // Auto-archiveer verkoopkansen waar alle facturen betaald zijn
  try {
    await autoArchiveerAfgerondeVerkoopkansen()
  } catch (err) {
    console.warn('Auto-archivering na SnelStart sync mislukt:', err)
  }

  // Push CRM facturen die in SnelStart ontbreken (orphans) — zodat CRM én SS hetzelfde tonen.
  // ALLEEN nieuwe facturen (vanaf F-2026-00166) worden gepusht. Oudere CRM-facturen
  // zitten al in SnelStart onder andere nummer-format (2024-xx, 2023-xx) en moeten niet
  // opnieuw gepusht worden.
  let gepushtNieuw = 0
  const pushErrors: string[] = []
  const pushbaar = crmFacturen.filter(f => {
    if (!niet_gevonden.includes(f.factuurnummer)) return false
    if (f.snelstart_boeking_id) return false
    // Openstaande facturen (verzonden/deels_betaald/vervallen) ALTIJD pushen — ongeacht
    // factuurnummer. Betaalde facturen alleen pushen als het een nieuwe CRM-nummering
    // is (F-YYYY-NNNNN vanaf F-2026-00166), zodat we geen oude geïmporteerde historie
    // dubbel in SnelStart krijgen.
    if (['verzonden', 'deels_betaald', 'vervallen'].includes(f.status)) return true
    if (f.status === 'betaald') {
      const m = f.factuurnummer.match(/^F-(\d{4})-0*(\d+)$/)
      if (!m) return false
      const jaar = parseInt(m[1])
      const nr = parseInt(m[2])
      if (jaar < 2026) return false
      if (jaar === 2026 && nr < 166) return false
      return true
    }
    return false
  })
  for (const f of pushbaar) {
    try {
      // Reset gefaalde sync-stempel zodat pushFactuurToSnelStart opnieuw probeert
      await supabaseAdmin.from('facturen').update({ snelstart_synced_at: null }).eq('id', f.id)
      const res = await pushFactuurToSnelStart(f.id)
      if (res && 'error' in res && res.error) {
        pushErrors.push(`${f.factuurnummer}: ${res.error}`)
      } else if (res && 'success' in res && res.success) {
        gepushtNieuw++
      }
    } catch (err) {
      pushErrors.push(`${f.factuurnummer}: ${err instanceof Error ? err.message : String(err)}`)
    }
  }

  revalidatePath('/facturatie')
  revalidatePath('/')

  return {
    success: true,
    gecontroleerd: crmFacturen.length,
    gevondenInSnelstart: crmFacturen.length - niet_gevonden.length,
    bijgewerkt: updated,
    betaaldGeworden: betaaldNieuw,
    deelsBetaaldGeworden: deelsBetaaldNieuw,
    vervallenGeworden: vervallenNieuw,
    gepushtNaarSnelstart: gepushtNieuw,
    pushErrors: pushErrors.slice(0, 20),
    nietGevonden: niet_gevonden.slice(0, 20),
  }
}

// Maakt een Mollie betaallink aan als die nog niet bestaat én de factuur openstaand is.
// Veilig om na elke factuur-insert aan te roepen — faalt stil als Mollie niet
// geconfigureerd is, als factuur al betaald is, of bij Mollie-API errors.
export async function zorgVoorBetaallink(factuurId: string): Promise<string | null> {
  try {
    const supabaseAdmin = createAdminClient()
    const { data: factuur } = await supabaseAdmin
      .from('facturen')
      .select('id, factuurnummer, totaal, betaald_bedrag, status, betaal_link, mollie_payment_id')
      .eq('id', factuurId)
      .single()
    if (!factuur) return null
    if (factuur.betaal_link) return factuur.betaal_link as string
    if (['concept', 'gecrediteerd', 'geannuleerd'].includes(factuur.status as string)) return null
    const openstaand = Number(factuur.totaal || 0) - Number(factuur.betaald_bedrag || 0)
    if (openstaand <= 0) return null
    if (!process.env.MOLLIE_API_KEY) return null

    const { createMolliePayment } = await import('@/lib/mollie')
    const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://rebucrm.vercel.app'
    const payment = await createMolliePayment({
      amount: openstaand,
      description: `Factuur ${factuur.factuurnummer}`,
      redirectUrl: `${appUrl}/betaling/succes`,
      webhookUrl: `${appUrl}/api/mollie/webhook`,
    })
    await supabaseAdmin
      .from('facturen')
      .update({ mollie_payment_id: payment.id, betaal_link: payment.checkoutUrl })
      .eq('id', factuurId)
    return payment.checkoutUrl
  } catch (err) {
    console.error('zorgVoorBetaallink fout:', err)
    return null
  }
}

export async function generateBetaallink(factuurId: string) {
  const supabase = await createClient()

  const { data: factuur } = await supabase
    .from('facturen')
    .select('id, factuurnummer, totaal, betaald_bedrag, status')
    .eq('id', factuurId)
    .single()

  if (!factuur) return { error: 'Factuur niet gevonden' }

  const openstaandBedrag = (factuur.totaal || 0) - (factuur.betaald_bedrag || 0)
  if (openstaandBedrag <= 0) return { error: 'Factuur is al betaald' }

  try {
    const { createMolliePayment } = await import('@/lib/mollie')
    const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'

    const payment = await createMolliePayment({
      amount: openstaandBedrag,
      description: `Factuur ${factuur.factuurnummer}`,
      redirectUrl: `${appUrl}/betaling/succes`,
      webhookUrl: `${appUrl}/api/mollie/webhook`,
      metadata: { factuurId },
    })

    await supabase
      .from('facturen')
      .update({
        mollie_payment_id: payment.id,
        betaal_link: payment.checkoutUrl,
      })
      .eq('id', factuurId)

    revalidatePath('/facturatie')
    return { success: true, betaalLink: payment.checkoutUrl }
  } catch (err) {
    console.error('Mollie payment error:', err)
    return { error: err instanceof Error ? err.message : 'Betaallink genereren mislukt' }
  }
}

// === INKOOP ===
export async function getInkoopfacturen() {
  const supabase = await createClient()
  const { data } = await supabase
    .from('inkoopfacturen')
    .select('*, relatie:relaties(bedrijfsnaam)')
    .order('datum', { ascending: false })
  return data || []
}

export async function getInkoopfactuur(id: string) {
  const supabase = await createClient()
  const { data } = await supabase
    .from('inkoopfacturen')
    .select('*, relatie:relaties(*), regels:inkoopfactuur_regels(*)')
    .eq('id', id)
    .single()
  return data
}

export async function saveInkoopfactuur(formData: FormData) {
  const supabase = await createClient()
  const adminId = await getAdministratieId()
  if (!adminId) return { error: 'Niet ingelogd' }

  const id = formData.get('id') as string
  const regelsJson = formData.get('regels') as string
  const regels = regelsJson ? JSON.parse(regelsJson) : []

  const subtotaal = regels.reduce((sum: number, r: { aantal: number; prijs: number }) => sum + r.aantal * r.prijs, 0)
  const btwTotaal = regels.reduce((sum: number, r: { aantal: number; prijs: number; btw_percentage: number }) => sum + (r.aantal * r.prijs * r.btw_percentage) / 100, 0)

  const record = {
    administratie_id: adminId,
    relatie_id: formData.get('relatie_id') as string || null,
    factuurnummer: formData.get('factuurnummer') as string,
    datum: formData.get('datum') as string,
    vervaldatum: formData.get('vervaldatum') as string || null,
    status: formData.get('status') as string || 'open',
    subtotaal,
    btw_totaal: btwTotaal,
    totaal: subtotaal + btwTotaal,
    opmerkingen: formData.get('opmerkingen') as string || null,
  }

  let inkoopId = id
  if (id) {
    const { error } = await supabase.from('inkoopfacturen').update(record).eq('id', id)
    if (error) return { error: error.message }
    await supabase.from('inkoopfactuur_regels').delete().eq('inkoopfactuur_id', id)
  } else {
    const { data, error } = await supabase.from('inkoopfacturen').insert(record).select('id').single()
    if (error) return { error: error.message }
    inkoopId = data.id
  }

  if (regels.length > 0) {
    const regelRecords = regels.map((r: { omschrijving: string; aantal: number; prijs: number; btw_percentage: number }, i: number) => ({
      inkoopfactuur_id: inkoopId,
      omschrijving: r.omschrijving,
      aantal: r.aantal,
      prijs: r.prijs,
      btw_percentage: r.btw_percentage,
      totaal: r.aantal * r.prijs,
      volgorde: i,
    }))
    await supabase.from('inkoopfactuur_regels').insert(regelRecords)
  }

  revalidatePath('/inkoop')
  return { success: true }
}

export async function deleteInkoopfactuur(id: string) {
  const supabase = await createClient()
  const { error } = await supabase.from('inkoopfacturen').delete().eq('id', id)
  if (error) return { error: error.message }
  revalidatePath('/inkoop')
  return { success: true }
}

// === BOEKHOUDING ===
export async function getGrootboekrekeningen() {
  const supabase = await createClient()
  const { data } = await supabase
    .from('grootboekrekeningen')
    .select('*')
    .order('nummer')
  return data || []
}

export async function getBoekingen() {
  const supabase = await createClient()
  const { data } = await supabase
    .from('boekingen')
    .select('*, regels:boekingsregels(*, rekening:grootboekrekeningen(nummer, naam))')
    .order('datum', { ascending: false })
  return data || []
}

export async function getBoeking(id: string) {
  const supabase = await createClient()
  const { data } = await supabase
    .from('boekingen')
    .select('*, regels:boekingsregels(*, rekening:grootboekrekeningen(nummer, naam))')
    .eq('id', id)
    .single()
  return data
}

export async function saveBoeking(formData: FormData) {
  const supabase = await createClient()
  const adminId = await getAdministratieId()
  if (!adminId) return { error: 'Niet ingelogd' }

  const id = formData.get('id') as string
  const regelsJson = formData.get('regels') as string
  const regels = regelsJson ? JSON.parse(regelsJson) : []

  const record = {
    administratie_id: adminId,
    boekingsnummer: formData.get('boekingsnummer') as string,
    datum: formData.get('datum') as string,
    omschrijving: formData.get('omschrijving') as string,
  }

  let boekingId = id
  if (id) {
    const { error } = await supabase.from('boekingen').update(record).eq('id', id)
    if (error) return { error: error.message }
    await supabase.from('boekingsregels').delete().eq('boeking_id', id)
  } else {
    const { data, error } = await supabase.from('boekingen').insert(record).select('id').single()
    if (error) return { error: error.message }
    boekingId = data.id
  }

  if (regels.length > 0) {
    const regelRecords = regels.map((r: { grootboekrekening_id: string; debet: number; credit: number; omschrijving?: string }) => ({
      boeking_id: boekingId,
      grootboekrekening_id: r.grootboekrekening_id,
      debet: r.debet || 0,
      credit: r.credit || 0,
      omschrijving: r.omschrijving || null,
    }))
    await supabase.from('boekingsregels').insert(regelRecords)
  }

  revalidatePath('/boekhouding')
  return { success: true }
}

// === PROJECTEN ===
export async function getProjecten() {
  const supabase = await createClient()
  // Supabase limiteert tot 1000 rijen per request; we pagineren door alles heen
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const data = await fetchAllRows<any>((from, to) =>
    supabase
      .from('projecten')
      .select('*, relatie:relaties(bedrijfsnaam), offertes:offertes(id, offertenummer, status, versie_nummer, subtotaal, totaal)')
      .order('created_at', { ascending: false })
      .range(from, to)
  )
  // Per project alleen de laatste offerte tonen (hoogste versie_nummer).
  // Bedrag is excl BTW (subtotaal) — niet het totaal incl BTW.
  return (data || []).map(p => {
    const offertes = (p.offertes || []) as { id: string; offertenummer: string; status: string; versie_nummer: number; subtotaal: number; totaal: number }[]
    const laatsteOfferte = offertes.sort((a, b) => (b.versie_nummer || 0) - (a.versie_nummer || 0))[0]
    return {
      ...p,
      aantal_offertes: offertes.length,
      laatste_offerte_id: laatsteOfferte?.id || null,
      laatste_offerte_nummer: laatsteOfferte?.offertenummer || null,
      laatste_offerte_status: laatsteOfferte?.status || null,
      laatste_offerte_bedrag: laatsteOfferte?.subtotaal || null,
    }
  })
}

export async function getProject(id: string) {
  const supabase = await createClient()
  const { data } = await supabase
    .from('projecten')
    .select('*, relatie:relaties(bedrijfsnaam)')
    .eq('id', id)
    .single()
  return data
}

export async function setProjectStatus(projectId: string, status: string) {
  const supabase = await createClient()
  const { error } = await supabase.from('projecten').update({ status }).eq('id', projectId)
  if (error) return { error: error.message }
  revalidatePath(`/projecten/${projectId}`)
  revalidatePath('/projecten')
  return { success: true }
}

export async function saveProject(formData: FormData) {
  const supabase = await createClient()
  const adminId = await getAdministratieId()
  if (!adminId) return { error: 'Niet ingelogd' }

  const id = formData.get('id') as string
  const record = {
    administratie_id: adminId,
    naam: formData.get('naam') as string,
    omschrijving: formData.get('omschrijving') as string || null,
    relatie_id: formData.get('relatie_id') as string || null,
    status: formData.get('status') as string || 'actief',
    startdatum: formData.get('startdatum') as string || null,
    einddatum: formData.get('einddatum') as string || null,
    budget: parseFloat(formData.get('budget') as string) || null,
    uurtarief: parseFloat(formData.get('uurtarief') as string) || null,
  }

  if (id) {
    const { error } = await supabase.from('projecten').update(record).eq('id', id)
    if (error) return { error: error.message }
  } else {
    const { error } = await supabase.from('projecten').insert(record)
    if (error) return { error: error.message }
  }

  revalidatePath('/projecten')
  return { success: true }
}

export async function deleteProject(id: string) {
  const supabase = await createClient()
  const { error } = await supabase.from('projecten').delete().eq('id', id)
  if (error) return { error: error.message }
  revalidatePath('/projecten')
  return { success: true }
}

// === UREN ===
export async function getUren() {
  const supabase = await createClient()
  const { data } = await supabase
    .from('uren')
    .select('*, project:projecten(naam), gebruiker:profielen(naam)')
    .order('datum', { ascending: false })
  return data || []
}

export async function saveUur(formData: FormData) {
  const supabase = await createClient()
  const adminId = await getAdministratieId()
  const { data: { user } } = await supabase.auth.getUser()
  if (!adminId || !user) return { error: 'Niet ingelogd' }

  const id = formData.get('id') as string
  const record = {
    administratie_id: adminId,
    project_id: formData.get('project_id') as string || null,
    gebruiker_id: user.id,
    datum: formData.get('datum') as string,
    uren: parseFloat(formData.get('uren') as string),
    omschrijving: formData.get('omschrijving') as string || null,
    facturabel: formData.get('facturabel') === 'true',
  }

  if (id) {
    const { error } = await supabase.from('uren').update(record).eq('id', id)
    if (error) return { error: error.message }
  } else {
    const { error } = await supabase.from('uren').insert(record)
    if (error) return { error: error.message }
  }

  revalidatePath('/uren')
  return { success: true }
}

export async function deleteUur(id: string) {
  const supabase = await createClient()
  const { error } = await supabase.from('uren').delete().eq('id', id)
  if (error) return { error: error.message }
  revalidatePath('/uren')
  return { success: true }
}

// === TAKEN ===
async function matchMedewerkerByEmailAddress(
  aanEmail: string | null,
  administratieId: string,
  client: ReturnType<typeof createAdminClient>
): Promise<{ id: string; profiel_id: string | null } | null> {
  if (!aanEmail) return null
  const { data } = await client
    .from('medewerkers')
    .select('id, profiel_id')
    .eq('administratie_id', administratieId)
    .ilike('email', aanEmail.trim())
    .eq('actief', true)
    .maybeSingle()
  return data || null
}

export async function getCurrentMedewerkerId(): Promise<string | null> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null
  const { data } = await supabase
    .from('medewerkers')
    .select('id')
    .eq('profiel_id', user.id)
    .eq('actief', true)
    .maybeSingle()
  return data?.id || null
}

export async function getTaken() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { taken: [] as never[], rol: 'medewerker', currentUserId: null as string | null }

  const { data: profiel } = await supabase
    .from('profielen')
    .select('rol')
    .eq('id', user.id)
    .single()
  const rol = profiel?.rol || 'medewerker'

  // Pagineer via fetchAllRows zodat we niet door Supabase's 1000-rijen limiet worden afgekapt.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const taken = await fetchAllRows<any>((from, to) => {
    let query = supabase
      .from('taken')
      .select('*, categorie, project:projecten(naam), toegewezen:profielen(naam), medewerker:medewerkers(naam), offerte:offertes(totaal), relatie:relaties(bedrijfsnaam)')
      .order('created_at', { ascending: true })
      .range(from, to)
    if (rol === 'medewerker') {
      query = query.eq('toegewezen_aan', user.id)
    }
    return query
  })
  return { taken, rol, currentUserId: user.id }
}

export async function getAgendaLeveringen() {
  const supabase = await createClient()
  const { data } = await supabase
    .from('orders')
    .select('id, ordernummer, leverdatum, status, onderwerp, relatie:relaties(bedrijfsnaam)')
    .not('leverdatum', 'is', null)
    .order('leverdatum', { ascending: true })
  return (data || []).map(o => ({
    id: o.id,
    ordernummer: o.ordernummer,
    leverdatum: o.leverdatum,
    status: o.status,
    onderwerp: o.onderwerp,
    relatie_bedrijfsnaam: (o.relatie as { bedrijfsnaam: string } | null)?.bedrijfsnaam || '-',
  }))
}

export async function getTaak(id: string) {
  const supabase = await createClient()
  const { data } = await supabase
    .from('taken')
    .select('*, project:projecten(naam)')
    .eq('id', id)
    .single()
  return data
}

export async function getTakenByRelatie(relatieId: string) {
  const supabase = await createClient()
  const { data } = await supabase
    .from('taken')
    .select('id, titel, status, prioriteit, deadline')
    .eq('relatie_id', relatieId)
    .order('created_at', { ascending: false })
  return data || []
}

export async function saveTaak(formData: FormData) {
  const supabase = await createClient()
  const adminId = await getAdministratieId()
  if (!adminId) return { error: 'Niet ingelogd' }

  const id = formData.get('id') as string
  const medewerkerId = formData.get('medewerker_id') as string || null

  // Lookup profiel_id van medewerker → opslaan als toegewezen_aan
  let toegewezenAan: string | null = null
  if (medewerkerId) {
    const { data: mw } = await supabase
      .from('medewerkers')
      .select('profiel_id')
      .eq('id', medewerkerId)
      .single()
    if (mw?.profiel_id) toegewezenAan = mw.profiel_id
  }

  const deadlineRaw = formData.get('deadline') as string
  const deadline = deadlineRaw ? deadlineRaw.slice(0, 10) : null
  const deadlineTijdRaw = formData.get('deadline_tijd') as string
  const deadlineTijd = deadlineTijdRaw ? deadlineTijdRaw : null

  const record: Record<string, unknown> = {
    administratie_id: adminId,
    titel: formData.get('titel') as string,
    omschrijving: formData.get('omschrijving') as string || null,
    project_id: formData.get('project_id') as string || null,
    status: formData.get('status') as string || 'open',
    prioriteit: formData.get('prioriteit') as string || 'normaal',
    deadline,
    deadline_tijd: deadlineTijd,
    categorie: (formData.get('categorie') as string) || null,
    medewerker_id: medewerkerId,
    relatie_id: formData.get('relatie_id') as string || null,
    offerte_id: formData.get('offerte_id') as string || null,
    toegewezen_aan: toegewezenAan,
  }

  let savedId = id
  if (id) {
    const { error } = await supabase.from('taken').update(record).eq('id', id)
    if (error) return { error: error.message }
  } else {
    ;(record as Record<string, unknown>).taaknummer = await getVolgendTaaknummer(supabase)

    const { data: inserted, error } = await supabase.from('taken').insert(record).select('id').single()
    if (error) return { error: error.message }
    savedId = inserted?.id as string
  }

  revalidatePath('/taken')
  return { success: true, id: savedId }
}

export async function deleteTaak(id: string) {
  const supabase = await createClient()
  const { error } = await supabase.from('taken').delete().eq('id', id)
  if (error) return { error: error.message }
  revalidatePath('/taken')
  return { success: true }
}

// === DOCUMENTEN ===
export async function getDocumenten() {
  const supabase = await createClient()
  const { data } = await supabase
    .from('documenten')
    .select('*, geupload_door_profiel:profielen(naam)')
    .order('created_at', { ascending: false })
  return data || []
}

export async function getProjectDocumenten(projectId: string) {
  const supabase = await createClient()
  const { data } = await supabase
    .from('documenten')
    .select('id, naam, bestandsnaam, bestandstype, bestandsgrootte, storage_path, created_at')
    .eq('entiteit_type', 'project')
    .eq('entiteit_id', projectId)
    .order('created_at', { ascending: false })
  return data || []
}

export async function getDocumentUrl(storagePath: string) {
  const supabase = await createClient()
  const { data } = await supabase.storage.from('documenten').createSignedUrl(storagePath, 3600)
  return data?.signedUrl || null
}

export async function deleteDocument(id: string) {
  const supabase = await createClient()
  const { data: doc } = await supabase
    .from('documenten')
    .select('storage_path')
    .eq('id', id)
    .single()

  if (doc) {
    await supabase.storage.from('documenten').remove([doc.storage_path])
  }

  const { error } = await supabase.from('documenten').delete().eq('id', id)
  if (error) return { error: error.message }
  revalidatePath('/documenten')
  return { success: true }
}

export async function completeTaak(id: string) {
  'use server'
  const supabase = await createClient()
  const { error } = await supabase.from('taken').update({ status: 'afgerond' }).eq('id', id)
  if (error) return { error: error.message }
  revalidatePath('/taken')
  revalidatePath('/')
  return { success: true }
}

export async function uncompleteTaak(id: string) {
  'use server'
  const supabase = await createClient()
  const { error } = await supabase.from('taken').update({ status: 'open' }).eq('id', id)
  if (error) return { error: error.message }
  revalidatePath('/taken')
  revalidatePath('/')
  return { success: true }
}

// === BEHEER ===
export async function getAdministratie() {
  const supabase = await createClient()
  const adminId = await getAdministratieId()
  if (!adminId) return null

  const { data } = await supabase
    .from('administraties')
    .select('*')
    .eq('id', adminId)
    .single()
  return data
}

export async function saveAdministratie(formData: FormData) {
  const supabase = await createClient()
  const adminId = await getAdministratieId()
  if (!adminId) return { error: 'Niet ingelogd' }

  const record = {
    naam: formData.get('naam') as string,
    kvk_nummer: formData.get('kvk_nummer') as string || null,
    btw_nummer: formData.get('btw_nummer') as string || null,
    adres: formData.get('adres') as string || null,
    postcode: formData.get('postcode') as string || null,
    plaats: formData.get('plaats') as string || null,
    telefoon: formData.get('telefoon') as string || null,
    email: formData.get('email') as string || null,
    website: formData.get('website') as string || null,
    iban: formData.get('iban') as string || null,
  }

  const { error } = await supabase.from('administraties').update(record).eq('id', adminId)
  if (error) return { error: error.message }
  revalidatePath('/beheer')
  return { success: true }
}

// === DASHBOARD ===
export async function getDashboardData() {
  const supabase = await createClient()
  const adminId = await getAdministratieId()
  const { data: { user } } = await supabase.auth.getUser()
  if (!adminId || !user) return null

  const supabaseAdmin = createAdminClient()

  // Grote tabellen beperken tot wat het dashboard echt nodig heeft:
  // - Facturen: laatste 13 maanden (grafieken tonen 12 mnd) + alle openstaande
  //   ongeacht datum (achterstallige moeten ook oudere betreffen).
  // - Offertes: laatste 13 maanden (grafieken tonen 12 mnd).
  // - Taken: alle niet-afgeronde + recent-afgeronde voor dashboard teller.
  const grens = new Date()
  grens.setMonth(grens.getMonth() - 13)
  const grensStr = grens.toISOString().slice(0, 10)
  const [facturenData, offertesData, takenData] = await Promise.all([
    fetchAllRows((from, to) => supabase.from('facturen').select('subtotaal, totaal, betaald_bedrag, status, datum, vervaldatum, relatie_id, snelstart_openstaand, factuur_type').eq('administratie_id', adminId).or(`datum.gte.${grensStr},status.in.(concept,verzonden,deels_betaald,vervallen)`).range(from, to)),
    fetchAllRows((from, to) => supabase.from('offertes').select('totaal, status, datum, relatie_id, project_id').eq('administratie_id', adminId).gte('datum', grensStr).range(from, to)),
    fetchAllRows((from, to) => supabase.from('taken').select('id, titel, status, prioriteit, deadline, categorie, toegewezen_aan, offerte_id, relatie_id, offerte:offertes(totaal), relatie:relaties(bedrijfsnaam)').eq('administratie_id', adminId).or(`status.neq.afgerond,deadline.gte.${grensStr}`).range(from, to)),
  ])

  const [relatiesRes, profielenRes, openOffertesRes, tePlannenRes, geplandeLeveringenRes, ongelezenBerichtenRes, geaccepteerdRes, openstaandeFacturenRes, omzetdoelenRes, recenteOffertesRes, moetBesteldRes] = await Promise.all([
    supabase.from('relaties').select('type', { count: 'exact' }).eq('administratie_id', adminId),
    supabase.from('profielen').select('id, naam').eq('administratie_id', adminId),
    supabase.from('offertes').select('id, offertenummer, datum, totaal, relatie:relaties(bedrijfsnaam), project:projecten(naam)').eq('administratie_id', adminId).eq('status', 'verzonden').order('datum', { ascending: true }).limit(200),
    supabase.from('orders').select('id, ordernummer, datum, totaal, onderwerp, relatie:relaties(bedrijfsnaam, contactpersoon, email), offerte:offertes(offertenummer)').eq('administratie_id', adminId).eq('status', 'nieuw').is('leverdatum', null).order('datum', { ascending: true }),
    supabase.from('orders').select('id, ordernummer, leverdatum, totaal, onderwerp, status, relatie:relaties(bedrijfsnaam), facturen:facturen(id, factuurnummer, status, factuur_type, totaal)').eq('administratie_id', adminId).not('leverdatum', 'is', null).in('status', ['in_behandeling', 'nieuw', 'besteld']).order('leverdatum', { ascending: true }),
    supabaseAdmin.from('berichten').select('id, offerte_id', { count: 'exact', head: true }).eq('administratie_id', adminId).eq('afzender_type', 'klant').eq('gelezen', false),
    supabase.from('offertes').select('id, offertenummer, datum, totaal, onderwerp, relatie:relaties(bedrijfsnaam), facturen:facturen(id)').eq('administratie_id', adminId).eq('status', 'geaccepteerd').or('gearchiveerd.is.null,gearchiveerd.eq.false').order('datum', { ascending: false }),
    supabase.from('facturen').select('id, factuurnummer, totaal, betaald_bedrag, vervaldatum, status, factuur_type, order_id, relatie:relaties(bedrijfsnaam)').eq('administratie_id', adminId).in('status', ['concept', 'verzonden', 'deels_betaald', 'vervallen']).order('status').order('vervaldatum', { ascending: true }),
    supabase.from('omzetdoelen').select('*').eq('administratie_id', adminId).eq('jaar', new Date().getFullYear()).maybeSingle(),
    supabase.from('offertes').select('id, offertenummer, datum, totaal, status, project_id, relatie:relaties(bedrijfsnaam), project:projecten(naam)').eq('administratie_id', adminId).neq('status', 'concept').order('datum', { ascending: false }).limit(100),
    supabase.from('orders').select('id, ordernummer, datum, totaal, onderwerp, relatie:relaties(bedrijfsnaam), offerte:offertes(offertenummer)').eq('administratie_id', adminId).eq('status', 'moet_besteld').order('datum', { ascending: true }),
  ])

  const relatiesData = relatiesRes.data || []
  const profielenData = profielenRes.data || []

  // Basis KPIs — omzet = gefactureerd deze maand (excl. concept + gecrediteerd + credit-nota's).
  // Credit-facturen verlagen de omzet NIET; zij verminderen het openstaand-saldo
  // via snelstart_openstaand of betaald_bedrag.
  const UITGESLOTEN_STATUSSEN = ['concept', 'gecrediteerd']
  const huidigeMaand = new Date().getMonth() + 1
  const huidigJaar = new Date().getFullYear()
  const omzet = facturenData
    .filter(f => {
      if (!f.datum || UITGESLOTEN_STATUSSEN.includes(f.status)) return false
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      if ((f as any).factuur_type === 'credit') return false
      const fd = new Date(f.datum)
      return fd.getFullYear() === huidigJaar && fd.getMonth() + 1 === huidigeMaand
    })
    .reduce((sum, f) => sum + (f.subtotaal || 0), 0)
  // Openstaand + vervallen uit SnelStart openstaandSaldo (via sync gevuld).
  // Facturen zonder snelstart_openstaand tellen niet mee (zijn historisch/niet
  // gesynchroniseerd). Uitzondering: credit-nota's zonder sync worden met hun
  // totaal als NEGATIEF openstaand meegerekend, zodat ze direct het openstaand-
  // saldo verlagen en niet de omzet.
  const vandaagStr = new Date().toISOString().slice(0, 10)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const openstaand = facturenData.reduce((sum, f: any) => {
    const o = f.snelstart_openstaand
    if (o != null) return sum + Number(o)
    if (f.factuur_type === 'credit' && f.status !== 'gecrediteerd') {
      return sum + Number(f.totaal || 0)
    }
    return sum
  }, 0)
  // Vervallen-logica identiek aan SnelStart: alle openstaand (incl negatieve credit)
  // waar vervaldatum <= vandaag (inclusief vandaag zelf).
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const achterstallig = facturenData.reduce((sum, f: any) => {
    const o = f.snelstart_openstaand
    const bedrag = o != null ? Number(o) : (f.factuur_type === 'credit' && f.status !== 'gecrediteerd' ? Number(f.totaal || 0) : null)
    if (bedrag == null) return sum
    if (!f.vervaldatum || f.vervaldatum > vandaagStr) return sum
    return sum + bedrag
  }, 0)
  const openOffertes = offertesData.filter(o => o.status === 'verzonden').length
  const openTaken = takenData.filter(t => t.status !== 'afgerond').length

  // Maandomzet (afgelopen 12 maanden)
  const maandOmzet: { maand: string; bedrag: number }[] = []
  const nu = new Date()
  for (let i = 11; i >= 0; i--) {
    const d = new Date(nu.getFullYear(), nu.getMonth() - i, 1)
    const maandStr = d.toLocaleDateString('nl-NL', { month: 'short', year: '2-digit' })
    const jaar = d.getFullYear()
    const maand = d.getMonth() + 1
    const bedrag = facturenData
      .filter(f => {
        if (UITGESLOTEN_STATUSSEN.includes(f.status) || !f.datum) return false
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        if ((f as any).factuur_type === 'credit') return false
        const fd = new Date(f.datum)
        return fd.getFullYear() === jaar && fd.getMonth() + 1 === maand
      })
      .reduce((sum, f) => sum + (f.subtotaal || 0), 0)
    maandOmzet.push({ maand: maandStr, bedrag })
  }

  // Gefactureerd per maand (alle facturen behalve concept)
  const gefactureerdPerMaand: { maand: string; bedrag: number; aantal: number }[] = []
  for (let i = 11; i >= 0; i--) {
    const d = new Date(nu.getFullYear(), nu.getMonth() - i, 1)
    const maandStr = d.toLocaleDateString('nl-NL', { month: 'short', year: '2-digit' })
    const jaar = d.getFullYear()
    const maandNr = d.getMonth() + 1
    const maandFacturen = facturenData.filter(f => {
      if (UITGESLOTEN_STATUSSEN.includes(f.status) || !f.datum) return false
      const fd = new Date(f.datum)
      return fd.getFullYear() === jaar && fd.getMonth() + 1 === maandNr
    })
    gefactureerdPerMaand.push({
      maand: maandStr,
      bedrag: maandFacturen.reduce((sum, f) => sum + (f.subtotaal || 0), 0),
      aantal: maandFacturen.length,
    })
  }
  const totaalGefactureerd = facturenData.filter(f => !UITGESLOTEN_STATUSSEN.includes(f.status)).reduce((sum, f) => sum + (f.subtotaal || 0), 0)
  const totaalFacturen = facturenData.filter(f => !UITGESLOTEN_STATUSSEN.includes(f.status)).length

  // Aangemaakte offertes per maand — per project alleen de laatste offerte meetellen
  // Groepeer offertes per project_id: neem alleen de nieuwste per project
  const laatstePerProject = new Map<string, typeof offertesData[0]>()
  const offertesZonderProject: typeof offertesData = []
  for (const o of offertesData) {
    if (o.project_id) {
      const bestaande = laatstePerProject.get(o.project_id)
      if (!bestaande || new Date(o.datum) > new Date(bestaande.datum)) {
        laatstePerProject.set(o.project_id, o)
      }
    } else {
      offertesZonderProject.push(o)
    }
  }
  const uniekOffertes = [...laatstePerProject.values(), ...offertesZonderProject]

  const offertesPerMaand: { maand: string; aantal: number; bedrag: number }[] = []
  for (let i = 11; i >= 0; i--) {
    const d = new Date(nu.getFullYear(), nu.getMonth() - i, 1)
    const maandStr = d.toLocaleDateString('nl-NL', { month: 'short', year: '2-digit' })
    const jaar = d.getFullYear()
    const maandNr = d.getMonth() + 1
    const maandOffertes = uniekOffertes.filter(o => {
      if (!o.datum) return false
      const od = new Date(o.datum)
      return od.getFullYear() === jaar && od.getMonth() + 1 === maandNr
    })
    offertesPerMaand.push({
      maand: maandStr,
      aantal: maandOffertes.length,
      bedrag: maandOffertes.reduce((sum, o) => sum + (o.totaal || 0), 0),
    })
  }
  const totaalOffertes = uniekOffertes.length

  // Recente offertes lijst (laatste per project, klikbaar)
  const recenteOffertesData = recenteOffertesRes.data || []
  const laatstePerProjectVoorLijst = new Map<string, typeof recenteOffertesData[0]>()
  const offertesZonderProjectLijst: typeof recenteOffertesData = []
  for (const o of recenteOffertesData) {
    if (o.project_id) {
      const bestaande = laatstePerProjectVoorLijst.get(o.project_id)
      if (!bestaande || new Date(o.datum) > new Date(bestaande.datum)) {
        laatstePerProjectVoorLijst.set(o.project_id, o)
      }
    } else {
      offertesZonderProjectLijst.push(o)
    }
  }
  const recenteOffertes = [...laatstePerProjectVoorLijst.values(), ...offertesZonderProjectLijst]
    .sort((a, b) => new Date(b.datum).getTime() - new Date(a.datum).getTime())
    .slice(0, 15)
    .map(o => ({
      id: o.id,
      offertenummer: o.offertenummer,
      relatie_bedrijfsnaam: (o.relatie as { bedrijfsnaam: string } | null)?.bedrijfsnaam || '-',
      project_naam: (o.project as { naam: string } | null)?.naam || null,
      status: o.status,
      totaal: o.totaal || 0,
      datum: o.datum,
    }))

  // Organisaties
  const organisaties = {
    totaal: relatiesRes.count ?? relatiesData.length,
    particulier: relatiesData.filter(r => r.type === 'particulier').length,
    zakelijk: relatiesData.filter(r => r.type === 'zakelijk').length,
  }

  // Offertes per fase — consistent met totaalOffertes (laatste per project).
  // Zo klopt de noemer voor conversiegraad (geaccepteerd/totaal).
  const offerteFases = ['concept', 'verzonden', 'geaccepteerd', 'afgewezen', 'verlopen']
  const offertesPerFase = offerteFases.map(status => ({
    status,
    aantal: uniekOffertes.filter(o => o.status === status).length,
    bedrag: uniekOffertes.filter(o => o.status === status).reduce((sum, o) => sum + (o.totaal || 0), 0),
  }))

  // Facturen per fase
  const factuurFases = ['concept', 'verzonden', 'betaald', 'deels_betaald', 'vervallen', 'gecrediteerd']
  const facturenPerFase = factuurFases.map(status => ({
    status,
    aantal: facturenData.filter(f => f.status === status).length,
    bedrag: facturenData.filter(f => f.status === status).reduce((sum, f) => sum + (f.totaal || 0), 0),
  }))

  // Taken per collega (met breakdown per titel)
  // Groepeer profielen op naam (voorkomt duplicaten als iemand meerdere profiel-entries heeft)
  const profielPerNaam = new Map<string, string[]>()
  for (const p of profielenData) {
    const naam = p.naam || 'Onbekend'
    if (!profielPerNaam.has(naam)) profielPerNaam.set(naam, [])
    profielPerNaam.get(naam)!.push(p.id)
  }
  const takenPerCollega = [...profielPerNaam.entries()].map(([naam, ids]) => {
    const openTaken = takenData.filter(t => ids.includes(t.toegewezen_aan) && t.status !== 'afgerond')
    const perTitel: Record<string, number> = {}
    let bellen = 0
    let uitwerken = 0
    for (const t of openTaken) {
      const titel = t.titel || 'Overig'
      perTitel[titel] = (perTitel[titel] || 0) + 1
      // Gebruik expliciet categorie-veld indien aanwezig, anders titel-heuristiek
      const cat = (t as unknown as { categorie?: string | null }).categorie
      if (cat === 'Bellen') bellen++
      else if (cat === 'Uitwerken') uitwerken++
      else {
        const l = titel.toLowerCase()
        if (l.includes('bellen') || l.includes('opbellen') || l.includes('nabellen')) bellen++
        else uitwerken++
      }
    }
    return {
      naam,
      profiel_id: ids[0],
      aantal: openTaken.length,
      bellen,
      uitwerken,
      perTitel: Object.entries(perTitel).map(([titel, aantal]) => ({ titel, aantal })).sort((a, b) => b.aantal - a.aantal),
    }
  }).filter(t => t.aantal > 0)

  // Rol ophalen voor taken filter
  const { data: userProfiel } = await supabase
    .from('profielen')
    .select('rol')
    .eq('id', user.id)
    .single()
  const userRol = userProfiel?.rol || 'medewerker'
  // Alleen admins zien ALLE taken op dashboard; gebruikers/medewerkers zien eigen
  const isAdmin = userRol === 'admin'

  // Mijn openstaande taken — toon uitsluitend taken toegewezen aan de ingelogde gebruiker
  // (admins zien alle open taken zodat ze overzicht houden)
  const profielNaamMap = new Map(profielenData.map(p => [p.id, p.naam]))
  const mijnTaken = takenData
    .filter(t => t.status !== 'afgerond' && t.toegewezen_aan === user.id)
    .map(t => ({
      id: t.id,
      titel: t.titel,
      deadline: t.deadline,
      prioriteit: t.prioriteit,
      toegewezen_naam: null,
      bedrag: (t.offerte as unknown as { totaal: number } | null)?.totaal || null,
      relatie_naam: (t.relatie as unknown as { bedrijfsnaam: string } | null)?.bedrijfsnaam || null,
    }))

  // Open offertes (verzonden) met dagen_open
  const vandaag = new Date()
  const openOffertesList = (openOffertesRes.data || []).map(o => {
    const datumDate = new Date(o.datum)
    const dagenOpen = Math.floor((vandaag.getTime() - datumDate.getTime()) / (1000 * 60 * 60 * 24))
    return {
      id: o.id,
      offertenummer: o.offertenummer,
      relatie_bedrijfsnaam: (o.relatie as { bedrijfsnaam: string } | null)?.bedrijfsnaam || '-',
      project_naam: (o.project as { naam: string } | null)?.naam || null,
      totaal: o.totaal || 0,
      datum: o.datum,
      dagen_open: dagenOpen,
    }
  })

  // Te plannen leveringen
  const tePlannenOrders = (tePlannenRes.data || []).map(o => ({
    id: o.id,
    ordernummer: o.ordernummer,
    relatie_bedrijfsnaam: (o.relatie as { bedrijfsnaam: string } | null)?.bedrijfsnaam || '-',
    relatie_contactpersoon: (o.relatie as { contactpersoon: string | null } | null)?.contactpersoon || null,
    relatie_email: (o.relatie as { email: string | null } | null)?.email || null,
    offerte_nummer: (o.offerte as { offertenummer: string } | null)?.offertenummer || null,
    onderwerp: o.onderwerp,
    totaal: o.totaal || 0,
    datum: o.datum,
  }))

  // Geplande leveringen (orders met leverdatum, nog niet afgeleverd)
  const geplandeLeveringen = (geplandeLeveringenRes.data || []).map(o => {
    const facturen = (o.facturen || []) as { id: string; factuurnummer: string; status: string; factuur_type: string; totaal: number }[]
    const restbetaling = facturen.find(f => f.factuur_type === 'restbetaling')
    return {
      id: o.id,
      ordernummer: o.ordernummer,
      leverdatum: o.leverdatum,
      status: o.status,
      onderwerp: o.onderwerp,
      totaal: o.totaal || 0,
      relatie_bedrijfsnaam: (o.relatie as { bedrijfsnaam: string } | null)?.bedrijfsnaam || '-',
      restbetaling: restbetaling ? { id: restbetaling.id, factuurnummer: restbetaling.factuurnummer, status: restbetaling.status, totaal: restbetaling.totaal } : null,
    }
  })

  // Geaccepteerde offertes (voor factuur aanmaken) — alleen als er nog geen factuur is
  const geaccepteerdeOffertes = (geaccepteerdRes.data || [])
    .filter(o => !o.facturen || (o.facturen as { id: string }[]).length === 0)
    .map(o => ({
      id: o.id,
      offertenummer: o.offertenummer,
      relatie_bedrijfsnaam: (o.relatie as { bedrijfsnaam: string } | null)?.bedrijfsnaam || '-',
      onderwerp: o.onderwerp,
      totaal: o.totaal || 0,
      datum: o.datum,
    }))

  // Openstaande facturen (concept, verzonden, deels_betaald, vervallen)
  const openstaandeFacturen = (openstaandeFacturenRes.data || []).map(f => ({
    id: f.id,
    factuurnummer: f.factuurnummer,
    relatie_bedrijfsnaam: (f.relatie as { bedrijfsnaam: string } | null)?.bedrijfsnaam || '-',
    totaal: f.totaal || 0,
    betaald_bedrag: f.betaald_bedrag || 0,
    openstaand_bedrag: (f.totaal || 0) - (f.betaald_bedrag || 0),
    vervaldatum: f.vervaldatum,
    status: f.status,
    factuur_type: f.factuur_type as string | null,
  }))

  // Top 50 klanten: aggregate by relatie_id
  const relatieMap = new Map<string, { relatie_id: string; bedrijfsnaam: string; betaald: number; offerte_waarde: number }>()
  // Build name lookup from relatiesData (we need full relaties for names)
  const relatieNamen = new Map<string, string>()
  const relatieNaamData = await fetchAllRows((from, to) => supabase.from('relaties').select('id, bedrijfsnaam').eq('administratie_id', adminId).range(from, to))
  for (const r of relatieNaamData) {
    relatieNamen.set(r.id, r.bedrijfsnaam || 'Onbekend')
  }
  for (const f of facturenData) {
    if (!f.relatie_id) continue
    if (!relatieMap.has(f.relatie_id)) {
      relatieMap.set(f.relatie_id, { relatie_id: f.relatie_id, bedrijfsnaam: relatieNamen.get(f.relatie_id) || 'Onbekend', betaald: 0, offerte_waarde: 0 })
    }
    const entry = relatieMap.get(f.relatie_id)!
    // Tel alle gefactureerde bedragen (niet alleen betaald)
    if (!UITGESLOTEN_STATUSSEN.includes(f.status)) entry.betaald += f.subtotaal || 0
  }
  // Use uniekOffertes (latest per project) so duplicate offertes for same klus don't inflate totals
  for (const o of uniekOffertes) {
    if (!o.relatie_id) continue
    if (!relatieMap.has(o.relatie_id)) {
      relatieMap.set(o.relatie_id, { relatie_id: o.relatie_id, bedrijfsnaam: relatieNamen.get(o.relatie_id) || 'Onbekend', betaald: 0, offerte_waarde: 0 })
    }
    relatieMap.get(o.relatie_id)!.offerte_waarde += o.totaal || 0
  }
  const topKlanten = [...relatieMap.values()]
    .sort((a, b) => b.betaald - a.betaald)
    .slice(0, 50)

  // Omzetdoelen
  const doelen = omzetdoelenRes.data
  const nuDate = new Date()
  const startVanJaar = new Date(nuDate.getFullYear(), 0, 1)
  const startVanMaand = new Date(nuDate.getFullYear(), nuDate.getMonth(), 1)
  // Week: maandag t/m zondag
  const dagVanWeek = nuDate.getDay() === 0 ? 6 : nuDate.getDay() - 1
  const startVanWeek = new Date(nuDate.getFullYear(), nuDate.getMonth(), nuDate.getDate() - dagVanWeek)
  startVanWeek.setHours(0, 0, 0, 0)

  const gefactureerdFacturen = facturenData.filter(f => !UITGESLOTEN_STATUSSEN.includes(f.status) && f.datum)
  const weekOmzet = gefactureerdFacturen
    .filter(f => new Date(f.datum) >= startVanWeek)
    .reduce((sum, f) => sum + (f.subtotaal || 0), 0)
  const maandOmzetVal = gefactureerdFacturen
    .filter(f => new Date(f.datum) >= startVanMaand)
    .reduce((sum, f) => sum + (f.subtotaal || 0), 0)
  const jaarOmzet = gefactureerdFacturen
    .filter(f => new Date(f.datum) >= startVanJaar)
    .reduce((sum, f) => sum + (f.subtotaal || 0), 0)

  const omzetdoelen = {
    week_doel: doelen?.week_doel ? Number(doelen.week_doel) : 0,
    maand_doel: doelen?.maand_doel ? Number(doelen.maand_doel) : 0,
    jaar_doel: doelen?.jaar_doel ? Number(doelen.jaar_doel) : 0,
    week_omzet: weekOmzet,
    maand_omzet: maandOmzetVal,
    jaar_omzet: jaarOmzet,
    heeft_doelen: !!doelen,
  }

  // E-mail triage: onverwerkte mails met classificatie offerte_aanvraag of onzeker
  const { data: triageEmailsData } = await supabaseAdmin
    .from('emails')
    .select('id, van_email, van_naam, onderwerp, datum, labels')
    .eq('administratie_id', adminId)
    .eq('verwerkt', false)
    .eq('richting', 'inkomend')
    .order('datum', { ascending: false })
    .limit(20)

  const triageEmails = (triageEmailsData || []).filter(e => {
    const labels: string[] = e.labels || []
    return labels.includes('offerte_aanvraag') || labels.includes('onzeker')
  })

  // Open aanvragen (taken die nog verwerkt moeten worden)
  const { data: aanvragenTaken } = await supabaseAdmin
    .from('taken')
    .select('id, omschrijving, status, created_at')
    .eq('administratie_id', adminId)
    .eq('titel', 'Nieuwe aanvraag - offerte nog te maken')
    .neq('status', 'afgerond')
    .order('created_at', { ascending: false })
    .limit(5)

  const { data: aanvraagEmails } = await supabaseAdmin
    .from('emails')
    .select('onderwerp, relatie_id')
    .eq('administratie_id', adminId)
    .contains('labels', ['offerte_aanvraag'])
    .not('relatie_id', 'is', null)

  const aanvraagOnderwerpMap = new Map<string, string>()
  const aanvraagRelatieIds = new Set<string>()
  for (const email of aanvraagEmails || []) {
    if (email.onderwerp && email.relatie_id) {
      aanvraagOnderwerpMap.set(email.onderwerp, email.relatie_id)
      aanvraagRelatieIds.add(email.relatie_id)
    }
  }

  const aanvraagRelatieNaamMap = new Map<string, string>()
  if (aanvraagRelatieIds.size > 0) {
    const { data: aanvraagRelaties } = await supabaseAdmin
      .from('relaties')
      .select('id, bedrijfsnaam')
      .in('id', [...aanvraagRelatieIds])
    for (const r of aanvraagRelaties || []) {
      aanvraagRelatieNaamMap.set(r.id, r.bedrijfsnaam || 'Onbekend')
    }
  }

  const openAanvragen = (aanvragenTaken || []).map(taak => {
    let relatie_id: string | null = null
    let relatie_naam: string | null = null
    let offerte_id: string | null = null
    if (taak.omschrijving) {
      const offerteMatch = taak.omschrijving.match(/\[offerte:([a-f0-9-]+)\]/)
      if (offerteMatch?.[1]) offerte_id = offerteMatch[1]

      const match = taak.omschrijving.match(/"(.+)"/)
      if (match?.[1]) {
        relatie_id = aanvraagOnderwerpMap.get(match[1]) || null
        if (relatie_id) relatie_naam = aanvraagRelatieNaamMap.get(relatie_id) || null
      }
    }
    return { ...taak, relatie_id, relatie_naam, offerte_id }
  })

  // Openstaande verkoopkansen
  const { data: openVerkoopkansenData } = await supabase
    .from('projecten')
    .select('id, naam, status, created_at, bron, relatie:relaties(bedrijfsnaam), offertes:offertes(id)')
    .eq('administratie_id', adminId)
    .in('status', ['actief', 'on_hold'])
    .order('created_at', { ascending: false })

  // Tel emails per project
  const projectIds = (openVerkoopkansenData || []).map(p => p.id)
  let emailCountMap = new Map<string, number>()
  if (projectIds.length > 0) {
    const { data: emailCounts } = await supabaseAdmin
      .from('emails')
      .select('project_id')
      .eq('administratie_id', adminId)
      .in('project_id', projectIds)
    for (const e of emailCounts || []) {
      if (e.project_id) emailCountMap.set(e.project_id, (emailCountMap.get(e.project_id) || 0) + 1)
    }
  }

  const openVerkoopkansen = (openVerkoopkansenData || []).map(p => ({
    id: p.id,
    naam: p.naam,
    status: p.status,
    created_at: p.created_at,
    bron: (p as Record<string, unknown>).bron as string || 'handmatig',
    relatie_bedrijfsnaam: (p.relatie as { bedrijfsnaam: string } | null)?.bedrijfsnaam || '-',
    heeft_offerte: ((p.offertes as { id: string }[] | null) || []).length > 0,
    aantal_emails: emailCountMap.get(p.id) || 0,
  }))

  // Moet besteld orders
  const moetBesteldOrders = (moetBesteldRes.data || []).map(o => ({
    id: o.id,
    ordernummer: o.ordernummer,
    relatie_bedrijfsnaam: (o.relatie as { bedrijfsnaam: string } | null)?.bedrijfsnaam || '-',
    offerte_nummer: (o.offerte as { offertenummer: string } | null)?.offertenummer || null,
    onderwerp: o.onderwerp,
    totaal: o.totaal || 0,
    datum: o.datum,
  }))

  // Recente notities (laatste 10 over alle klanten/taken) voor dashboard
  const { data: recenteNotitiesData } = await supabaseAdmin
    .from('notities')
    .select('id, tekst, created_at, relatie:relaties(id, bedrijfsnaam), gebruiker:profielen(naam)')
    .eq('administratie_id', adminId)
    .order('created_at', { ascending: false })
    .limit(10)

  const recenteNotities = (recenteNotitiesData || []).map(n => ({
    id: n.id as string,
    tekst: n.tekst as string,
    created_at: n.created_at as string,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    relatie: (n.relatie as any) ? { id: ((n.relatie as any)?.id) || '', bedrijfsnaam: ((n.relatie as any)?.bedrijfsnaam) || '' } : null,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    gebruikerNaam: ((n.gebruiker as any)?.naam) || null,
  }))

  return {
    omzet, openstaand, achterstallig, openOffertes, openTaken,
    ongelezenBerichten: ongelezenBerichtenRes.count || 0,
    maandOmzet, gefactureerdPerMaand, totaalGefactureerd, totaalFacturen,
    offertesPerMaand, totaalOffertes,
    organisaties, offertesPerFase, facturenPerFase, takenPerCollega, mijnTaken, openOffertesList, tePlannenOrders, geplandeLeveringen, geaccepteerdeOffertes, openstaandeFacturen,
    topKlanten, omzetdoelen, triageEmails, openAanvragen, recenteOffertes, moetBesteldOrders, openVerkoopkansen,
    recenteNotities,
  }
}

// === OMZETDOELEN ===
export async function saveOmzetdoelen(formData: FormData) {
  const supabase = await createClient()
  const adminId = await getAdministratieId()
  if (!adminId) return { error: 'Niet ingelogd' }

  const jaar = new Date().getFullYear()
  const week_doel = parseFloat(formData.get('week_doel') as string) || 0
  const maand_doel = parseFloat(formData.get('maand_doel') as string) || 0
  const jaar_doel = parseFloat(formData.get('jaar_doel') as string) || 0

  const { error } = await supabase
    .from('omzetdoelen')
    .upsert({
      administratie_id: adminId,
      jaar,
      week_doel,
      maand_doel,
      jaar_doel,
      updated_at: new Date().toISOString(),
    }, { onConflict: 'administratie_id,jaar' })

  if (error) return { error: error.message }
  revalidatePath('/')
  return { success: true }
}

// === FAALKOSTEN ===
export async function getFaalkosten() {
  const supabase = await createClient()
  const adminId = await getAdministratieId()
  if (!adminId) return []
  const { data } = await supabase
    .from('faalkosten')
    .select('*, project:projecten(naam), offerte:offertes(offertenummer)')
    .eq('administratie_id', adminId)
    .order('datum', { ascending: false })
  return data || []
}

export async function getFaalkost(id: string) {
  const supabase = await createClient()
  const { data } = await supabase
    .from('faalkosten')
    .select('*, project:projecten(id, naam), offerte:offertes(id, offertenummer)')
    .eq('id', id)
    .single()
  return data
}

export async function saveFaalkost(formData: FormData) {
  const supabase = await createClient()
  const adminId = await getAdministratieId()
  if (!adminId) return { error: 'Niet ingelogd' }

  const id = formData.get('id') as string | null
  const record = {
    administratie_id: adminId,
    omschrijving: formData.get('omschrijving') as string,
    categorie: formData.get('categorie') as string || null,
    bedrag: parseFloat(formData.get('bedrag') as string) || 0,
    datum: formData.get('datum') as string || new Date().toISOString().split('T')[0],
    verantwoordelijke: formData.get('verantwoordelijke') as string || null,
    opgelost: formData.get('opgelost') === 'true',
    notities: formData.get('notities') as string || null,
    project_id: formData.get('project_id') as string || null,
    offerte_id: formData.get('offerte_id') as string || null,
    order_id: formData.get('order_id') as string || null,
  }

  if (id) {
    const { error } = await supabase.from('faalkosten').update(record).eq('id', id)
    if (error) return { error: error.message }
  } else {
    const { error } = await supabase.from('faalkosten').insert(record)
    if (error) return { error: error.message }
  }

  revalidatePath('/faalkosten')
  return { success: true }
}

export async function deleteFaalkost(id: string) {
  const supabase = await createClient()
  const { error } = await supabase.from('faalkosten').delete().eq('id', id)
  if (error) return { error: error.message }
  revalidatePath('/faalkosten')
  return { success: true }
}

// === E-MAILS ===
export async function getEmails(page = 1, filter: 'alle' | 'inkomend' | 'uitgaand' = 'alle', zoekterm = '', toonIrrelevant = false) {
  const adminId = await getAdministratieId()
  if (!adminId) return { emails: [], total: 0 }

  // Admin client om stale JWT / RLS problemen te voorkomen bij server action calls
  const supabaseAdmin = createAdminClient()
  const pageSize = 25
  const offset = (page - 1) * pageSize

  let query = supabaseAdmin
    .from('emails')
    .select('*, relatie:relaties(id, bedrijfsnaam), offerte:offertes(id, offertenummer), medewerker:medewerkers(id, naam)', { count: 'exact' })
    .eq('administratie_id', adminId)

  if (filter === 'inkomend') query = query.eq('richting', 'inkomend')
  if (filter === 'uitgaand') query = query.eq('richting', 'uitgaand')
  if (zoekterm) {
    query = query.or(`onderwerp.ilike.%${zoekterm}%,van_email.ilike.%${zoekterm}%,van_naam.ilike.%${zoekterm}%`)
  }
  if (!toonIrrelevant) {
    query = query.not('labels', 'cs', '{irrelevant}')
  }

  const { data, count } = await query
    .order('datum', { ascending: false })
    .range(offset, offset + pageSize - 1)

  return { emails: data || [], total: count || 0 }
}

export async function markEmailGelezen(emailId: string) {
  const supabase = await createClient()
  await supabase.from('emails').update({ gelezen: true }).eq('id', emailId)
  revalidatePath('/email')
}

export async function getActiveProjectsForEmail(emailId: string) {
  'use server'
  const supabase = await createClient()
  const adminId = await getAdministratieId()
  if (!adminId) return []

  // Haal email op
  const { data: email } = await supabase.from('emails').select('van_email, relatie_id, offerte_id, in_reply_to').eq('id', emailId).single()
  if (!email) return []

  // Zoek relatie_id
  let relatieId = email.relatie_id
  if (!relatieId && email.van_email) {
    const { data: relatie } = await supabase
      .from('relaties')
      .select('id')
      .eq('administratie_id', adminId)
      .ilike('email', email.van_email)
      .maybeSingle()
    if (relatie) relatieId = relatie.id
  }

  if (!relatieId) return []

  // Haal actieve verkoopkansen op voor deze relatie
  const { data: projecten } = await supabase
    .from('projecten')
    .select('id, naam, status')
    .eq('administratie_id', adminId)
    .eq('relatie_id', relatieId)
    .in('status', ['actief', 'on_hold'])
    .order('created_at', { ascending: false })

  return projecten || []
}

export async function assignEmailToMedewerker(emailId: string, medewerkerId: string, projectId?: string | 'nieuw') {
  'use server'
  const supabase = await createClient()
  const adminId = await getAdministratieId()
  if (!adminId) return { error: 'Niet ingelogd' }

  // Haal email op
  const { data: email } = await supabase.from('emails').select('*').eq('id', emailId).single()
  if (!email) return { error: 'Email niet gevonden' }

  // Haal medewerker op voor profiel_id
  const { data: medewerker } = await supabase.from('medewerkers').select('id, naam, profiel_id').eq('id', medewerkerId).single()
  if (!medewerker) return { error: 'Medewerker niet gevonden' }

  // Zoek of maak relatie op basis van afzender email
  let relatieId: string | null = email.relatie_id
  if (!relatieId && email.van_email) {
    const { data: bestaandeRelatie } = await supabase
      .from('relaties')
      .select('id')
      .eq('administratie_id', adminId)
      .ilike('email', email.van_email)
      .maybeSingle()

    if (bestaandeRelatie) {
      relatieId = bestaandeRelatie.id
    } else {
      const { data: nieuweRelatie } = await supabase
        .from('relaties')
        .insert({
          administratie_id: adminId,
          bedrijfsnaam: email.van_naam || email.van_email,
          type: 'particulier',
          email: email.van_email,
          contactpersoon: email.van_naam || null,
        })
        .select('id')
        .single()
      if (nieuweRelatie) relatieId = nieuweRelatie.id
    }
  }

  // Zoek of maak verkoopkans (project)
  let finalProjectId: string | null = null

  if (projectId && projectId !== 'nieuw') {
    // Expliciet gekozen project
    finalProjectId = projectId
  } else if (projectId === 'nieuw') {
    // Gebruiker wil expliciet nieuwe verkoopkans
    if (relatieId) {
      const { data: project } = await supabase
        .from('projecten')
        .insert({
          administratie_id: adminId,
          naam: email.onderwerp || 'Nieuw vanuit e-mail',
          relatie_id: relatieId,
          status: 'actief',
        })
        .select('id')
        .single()
      if (project) finalProjectId = project.id
    }
  } else if (relatieId) {
    // Slim zoeken naar bestaande verkoopkans
    // a) Via offerte_id → project_id
    if (email.offerte_id) {
      const { data: offerte } = await supabase
        .from('offertes')
        .select('project_id')
        .eq('id', email.offerte_id)
        .maybeSingle()
      if (offerte?.project_id) finalProjectId = offerte.project_id
    }

    // b) Via in_reply_to → parent email → project_id
    if (!finalProjectId && email.in_reply_to) {
      const { data: parentEmail } = await supabase
        .from('emails')
        .select('project_id')
        .eq('message_id', email.in_reply_to)
        .not('project_id', 'is', null)
        .maybeSingle()
      if (parentEmail?.project_id) finalProjectId = parentEmail.project_id
    }

    // c) Zoek actieve projecten voor deze relatie
    if (!finalProjectId) {
      const { data: actieveProjecten } = await supabase
        .from('projecten')
        .select('id')
        .eq('administratie_id', adminId)
        .eq('relatie_id', relatieId)
        .eq('status', 'actief')
        .order('created_at', { ascending: false })
        .limit(1)
      if (actieveProjecten && actieveProjecten.length > 0) {
        finalProjectId = actieveProjecten[0].id
      }
    }

    // d) Geen match → nieuwe verkoopkans aanmaken
    if (!finalProjectId) {
      const { data: project } = await supabase
        .from('projecten')
        .insert({
          administratie_id: adminId,
          naam: email.onderwerp || 'Nieuw vanuit e-mail',
          relatie_id: relatieId,
          status: 'actief',
        })
        .select('id')
        .single()
      if (project) finalProjectId = project.id
    }
  }

  // Maak taak aan
  await supabase.from('taken').insert({
    administratie_id: adminId,
    taaknummer: await getVolgendTaaknummer(supabase),
    titel: `Opvolgen: ${email.onderwerp || 'E-mail'}`,
    status: 'open',
    prioriteit: 'normaal',
    relatie_id: relatieId,
    project_id: finalProjectId,
    medewerker_id: medewerkerId,
    toegewezen_aan: medewerker.profiel_id || null,
  })

  // Email markeren als verwerkt + medewerker toewijzen + project koppelen
  await supabase.from('emails').update({
    gelezen: true,
    relatie_id: relatieId,
    medewerker_id: medewerkerId,
    project_id: finalProjectId,
    labels: [...(email.labels || []).filter((l: string) => l !== 'irrelevant'), 'verwerkt'],
  }).eq('id', emailId)

  revalidatePath('/email')
  revalidatePath('/taken')
  revalidatePath('/relatiebeheer')
  revalidatePath('/projecten')
  return { success: true }
}

export async function linkEmailToProject(emailId: string, projectId: string) {
  'use server'
  const supabase = await createClient()

  // Haal project op voor relatie_id
  const { data: project } = await supabase.from('projecten').select('relatie_id').eq('id', projectId).single()

  await supabase.from('emails').update({
    relatie_id: project?.relatie_id || null,
    project_id: projectId,
    labels: ['gekoppeld'],
  }).eq('id', emailId)

  revalidatePath('/email')
  revalidatePath('/projecten')
  return { success: true }
}

export async function getEmailsForProject(projectId: string) {
  'use server'
  const supabase = await createClient()

  const { data } = await supabase
    .from('emails')
    .select('id, van_email, van_naam, aan_email, onderwerp, datum, richting, labels')
    .eq('project_id', projectId)
    .order('datum', { ascending: false })

  return data || []
}

export async function getEmailBody(emailId: string) {
  const supabase = await createClient()
  const { data: email } = await supabase
    .from('emails')
    .select('body_text, body_html, imap_uid')
    .eq('id', emailId)
    .single()

  if (!email) return { text: null, html: null }

  // If body already cached in DB, return it
  if (email.body_text || email.body_html) {
    return { text: email.body_text, html: email.body_html }
  }

  // Fetch body on-demand via IMAP
  if (email.imap_uid) {
    const { fetchEmailBody } = await import('@/lib/imap')
    const body = await fetchEmailBody(email.imap_uid)

    // Cache in DB for next time
    if (body.text || body.html) {
      await supabase
        .from('emails')
        .update({ body_text: body.text, body_html: body.html })
        .eq('id', emailId)
    }

    return body
  }

  return { text: null, html: null }
}

export async function getEmailForOfferte(offerteId: string) {
  const supabase = await createClient()

  // Get offerte to find matching email
  const { data: offerte } = await supabase
    .from('offertes')
    .select('onderwerp, relatie_id, created_at')
    .eq('id', offerteId)
    .single()

  if (!offerte) return null

  // Find email with matching label offerte_aanvraag that was processed around the same time
  const { data: email } = await supabase
    .from('emails')
    .select('id, van_naam, van_email, onderwerp, body_text, body_html, datum, imap_uid')
    .contains('labels', ['offerte_aanvraag'])
    .order('datum', { ascending: false })
    .limit(50)

  if (!email || email.length === 0) return null

  // Find best match: same subject or closest in time
  const offerteOnderwerp = (offerte.onderwerp || '').toLowerCase()
  let bestMatch = email.find(e =>
    e.onderwerp && offerteOnderwerp && e.onderwerp.toLowerCase() === offerteOnderwerp.toLowerCase()
  )

  if (!bestMatch) {
    // Try partial match
    bestMatch = email.find(e =>
      e.onderwerp && offerteOnderwerp && (
        e.onderwerp.toLowerCase().includes(offerteOnderwerp) ||
        offerteOnderwerp.includes(e.onderwerp.toLowerCase())
      )
    )
  }

  if (!bestMatch) return null

  // If body is not cached, fetch on-demand
  if (!bestMatch.body_text && !bestMatch.body_html && bestMatch.imap_uid) {
    const body = await getEmailBody(bestMatch.id)
    bestMatch.body_text = body.text
    bestMatch.body_html = body.html
  }

  return {
    id: bestMatch.id,
    van_naam: bestMatch.van_naam,
    van_email: bestMatch.van_email,
    onderwerp: bestMatch.onderwerp,
    body_text: bestMatch.body_text,
    body_html: bestMatch.body_html,
    datum: bestMatch.datum,
  }
}

export async function getEmailAttachments(emailId: string): Promise<{ filename: string; contentType: string; size: number; data: string }[]> {
  const supabase = await createClient()

  const { data: email } = await supabase
    .from('emails')
    .select('imap_uid')
    .eq('id', emailId)
    .single()

  if (!email?.imap_uid) return []

  const { fetchEmailAttachments } = await import('@/lib/imap')
  return fetchEmailAttachments(email.imap_uid)
}

export async function getEmailSyncStatus() {
  const supabase = await createClient()
  const adminId = await getAdministratieId()
  if (!adminId) return null

  const { data } = await supabase
    .from('email_sync_state')
    .select('*')
    .eq('administratie_id', adminId)
    .maybeSingle()

  return data
}

export async function approveTriageEmail(emailId: string) {
  const supabase = await createClient()
  const adminId = await getAdministratieId()
  if (!adminId) return { error: 'Niet ingelogd' }

  const supabaseAdmin = createAdminClient()

  // Get email details
  const { data: email } = await supabaseAdmin
    .from('emails')
    .select('id, van_email, van_naam, onderwerp, relatie_id')
    .eq('id', emailId)
    .eq('administratie_id', adminId)
    .single()

  if (!email) return { error: 'E-mail niet gevonden' }

  // Create relatie if unknown sender
  let relatieId = email.relatie_id
  if (!relatieId) {
    const { data: newRelatie } = await supabaseAdmin
      .from('relaties')
      .insert({
        administratie_id: adminId,
        bedrijfsnaam: email.van_naam || email.van_email,
        email: email.van_email,
        type: 'particulier',
      })
      .select('id')
      .single()
    relatieId = newRelatie?.id || null
  }

  // Update email: set label to offerte_aanvraag, mark as verwerkt
  await supabaseAdmin
    .from('emails')
    .update({
      labels: ['offerte_aanvraag'],
      verwerkt: true,
      relatie_id: relatieId,
    })
    .eq('id', emailId)

  // Create project + concept offerte linked to the klant
  let conceptOfferteId: string | null = null
  if (relatieId) {
    const projectNaam = email.onderwerp || '(geen onderwerp)'
    const { data: newProject } = await supabaseAdmin
      .from('projecten')
      .insert({
        administratie_id: adminId,
        relatie_id: relatieId,
        naam: projectNaam,
        status: 'actief',
      })
      .select('id')
      .single()

    const { data: offertenummer } = await supabaseAdmin.rpc('volgende_nummer', {
      p_administratie_id: adminId,
      p_type: 'offerte',
    })
    const vandaag = new Date().toISOString().split('T')[0]
    const { data: newOfferte } = await supabaseAdmin
      .from('offertes')
      .insert({
        administratie_id: adminId,
        relatie_id: relatieId,
        project_id: newProject?.id || null,
        offertenummer: offertenummer || '',
        datum: vandaag,
        status: 'concept',
        onderwerp: projectNaam,
        subtotaal: 0,
        btw_totaal: 0,
        totaal: 0,
      })
      .select('id')
      .single()
    conceptOfferteId = newOfferte?.id || null
  }

  // Create task (assigned to medewerker whose inbox received the email)
  const toegewezenMedewerker = await matchMedewerkerByEmailAddress(email.aan_email, adminId, supabaseAdmin)
  await supabaseAdmin.from('taken').insert({
    administratie_id: adminId,
    taaknummer: await getVolgendTaaknummer(supabaseAdmin),
    titel: 'Nieuwe aanvraag - offerte nog te maken',
    omschrijving: `E-mail ontvangen van ${email.van_naam || email.van_email}: "${email.onderwerp || '(geen onderwerp)'}"${conceptOfferteId ? ` [offerte:${conceptOfferteId}]` : ''}`,
    prioriteit: 'hoog',
    status: 'open',
    relatie_id: relatieId,
    medewerker_id: toegewezenMedewerker?.id || null,
    toegewezen_aan: toegewezenMedewerker?.profiel_id || null,
  })

  revalidatePath('/')
  revalidatePath('/email')
  revalidatePath('/aanvragen')
  revalidatePath('/offertes')
  return { success: true }
}

export async function rejectTriageEmail(emailId: string) {
  const supabase = await createClient()
  const adminId = await getAdministratieId()
  if (!adminId) return { error: 'Niet ingelogd' }

  const supabaseAdmin = createAdminClient()

  await supabaseAdmin
    .from('emails')
    .update({
      labels: ['irrelevant'],
      verwerkt: true,
    })
    .eq('id', emailId)
    .eq('administratie_id', adminId)

  revalidatePath('/')
  revalidatePath('/email')
  revalidatePath('/aanvragen')
  return { success: true }
}

export async function getAanvragen() {
  const supabase = await createClient()
  const adminId = await getAdministratieId()
  if (!adminId) return []

  const supabaseAdmin = createAdminClient()
  const [takenRes, emailsRes] = await Promise.all([
    supabaseAdmin
      .from('taken')
      .select('*')
      .eq('administratie_id', adminId)
      .eq('titel', 'Nieuwe aanvraag - offerte nog te maken')
      .order('created_at', { ascending: false }),
    supabaseAdmin
      .from('emails')
      .select('onderwerp, relatie_id')
      .eq('administratie_id', adminId)
      .contains('labels', ['offerte_aanvraag'])
      .not('relatie_id', 'is', null),
  ])

  const taken = takenRes.data || []
  const emails = emailsRes.data || []

  // Build map: email onderwerp → relatie_id
  const onderwerpRelatieMap = new Map<string, string>()
  for (const email of emails) {
    if (email.onderwerp && email.relatie_id) {
      onderwerpRelatieMap.set(email.onderwerp, email.relatie_id)
    }
  }

  // Collect all relatie_ids to fetch names
  const relatieIds = new Set<string>()
  for (const email of emails) {
    if (email.relatie_id) relatieIds.add(email.relatie_id)
  }

  // Fetch relatie names
  const relatieNaamMap = new Map<string, string>()
  if (relatieIds.size > 0) {
    const { data: relaties } = await supabaseAdmin
      .from('relaties')
      .select('id, bedrijfsnaam')
      .in('id', [...relatieIds])
    for (const r of relaties || []) {
      relatieNaamMap.set(r.id, r.bedrijfsnaam || 'Onbekend')
    }
  }

  // Match taak omschrijving to email onderwerp to get relatie_id + extract offerte_id
  return taken.map(taak => {
    let relatie_id: string | null = null
    let relatie_naam: string | null = null
    let offerte_id: string | null = null

    if (taak.omschrijving) {
      // Extract offerte_id from [offerte:uuid] tag
      const offerteMatch = taak.omschrijving.match(/\[offerte:([a-f0-9-]+)\]/)
      if (offerteMatch?.[1]) {
        offerte_id = offerteMatch[1]
      }

      const match = taak.omschrijving.match(/"(.+)"/)
      if (match?.[1]) {
        relatie_id = onderwerpRelatieMap.get(match[1]) || null
        if (relatie_id) {
          relatie_naam = relatieNaamMap.get(relatie_id) || null
        }
      }
    }
    return { ...taak, relatie_id, relatie_naam, offerte_id }
  })
}

export async function updateAanvraagStatus(taakId: string, status: string) {
  const supabase = await createClient()
  const adminId = await getAdministratieId()
  if (!adminId) return { error: 'Niet ingelogd' }

  const supabaseAdmin = createAdminClient()
  await supabaseAdmin
    .from('taken')
    .update({ status })
    .eq('id', taakId)
    .eq('administratie_id', adminId)

  revalidatePath('/aanvragen')
  revalidatePath('/')
  return { success: true }
}

export async function reclassifyExistingEmails() {
  const supabase = await createClient()
  const adminId = await getAdministratieId()
  if (!adminId) return { error: 'Niet ingelogd', updated: 0 }

  const supabaseAdmin = createAdminClient()
  const { classifyEmail } = await import('@/lib/imap')

  // Fetch all inkomende emails
  const { data: emails } = await supabaseAdmin
    .from('emails')
    .select('id, van_email, van_naam, onderwerp, in_reply_to, relatie_id, labels')
    .eq('administratie_id', adminId)
    .eq('richting', 'inkomend')

  if (!emails || emails.length === 0) return { updated: 0 }

  let updated = 0
  let takenAangemaakt = 0
  for (const email of emails) {
    const hasOfferteMatch = !!(email.onderwerp && /OFF-\d+/i.test(email.onderwerp))
    const classificatie = classifyEmail(
      email.onderwerp,
      email.van_email,
      email.in_reply_to,
      hasOfferteMatch,
      !!email.relatie_id,
    )

    const verwerkt = classificatie === 'irrelevant' || classificatie === 'offerte_aanvraag' || classificatie === 'offerte_reactie'
    await supabaseAdmin
      .from('emails')
      .update({
        labels: [classificatie],
        verwerkt,
      })
      .eq('id', email.id)
    updated++

    // Create task for offerte_aanvraag emails (skip if task already exists)
    if (classificatie === 'offerte_aanvraag') {
      const omschrijvingMatch = `"${(email.onderwerp || '(geen onderwerp)').replace(/[%_]/g, '')}"`
      const { count: existingTasks } = await supabaseAdmin
        .from('taken')
        .select('id', { count: 'exact', head: true })
        .eq('administratie_id', adminId)
        .ilike('omschrijving', `%${omschrijvingMatch}%`)

      if ((existingTasks || 0) === 0) {
        // Create relatie if unknown sender
        let relatieId = email.relatie_id
        if (!relatieId) {
          const { data: newRelatie } = await supabaseAdmin
            .from('relaties')
            .insert({
              administratie_id: adminId,
              bedrijfsnaam: email.van_naam || email.van_email,
              email: email.van_email,
              type: 'particulier',
            })
            .select('id')
            .single()
          if (newRelatie) {
            relatieId = newRelatie.id
            await supabaseAdmin
              .from('emails')
              .update({ relatie_id: newRelatie.id })
              .eq('id', email.id)
          }
        }

        // Create project + concept offerte
        let conceptOfferteId: string | null = null
        if (relatieId) {
          const projectNaam = email.onderwerp || '(geen onderwerp)'
          const { data: newProject } = await supabaseAdmin
            .from('projecten')
            .insert({
              administratie_id: adminId,
              relatie_id: relatieId,
              naam: projectNaam,
              status: 'actief',
            })
            .select('id')
            .single()

          const { data: offertenummer } = await supabaseAdmin.rpc('volgende_nummer', {
            p_administratie_id: adminId,
            p_type: 'offerte',
          })
          const vandaag = new Date().toISOString().split('T')[0]
          const { data: newOfferte } = await supabaseAdmin
            .from('offertes')
            .insert({
              administratie_id: adminId,
              relatie_id: relatieId,
              project_id: newProject?.id || null,
              offertenummer: offertenummer || '',
              datum: vandaag,
              status: 'concept',
              onderwerp: projectNaam,
              subtotaal: 0,
              btw_totaal: 0,
              totaal: 0,
            })
            .select('id')
            .single()
          conceptOfferteId = newOfferte?.id || null
        }

        const bulkToegewezenMedewerker = await matchMedewerkerByEmailAddress(email.aan_email, adminId, supabaseAdmin)
        await supabaseAdmin.from('taken').insert({
          administratie_id: adminId,
          taaknummer: await getVolgendTaaknummer(supabaseAdmin),
          titel: 'Nieuwe aanvraag - offerte nog te maken',
          omschrijving: `E-mail van ${email.van_naam || email.van_email}: "${email.onderwerp || '(geen onderwerp)'}"${conceptOfferteId ? ` [offerte:${conceptOfferteId}]` : ''}`,
          prioriteit: 'hoog',
          status: 'open',
          relatie_id: relatieId,
          medewerker_id: bulkToegewezenMedewerker?.id || null,
          toegewezen_aan: bulkToegewezenMedewerker?.profiel_id || null,
        })
        takenAangemaakt++
      }
    }
  }

  revalidatePath('/')
  revalidatePath('/email')
  revalidatePath('/taken')
  return { success: true, updated, takenAangemaakt }
}

export async function ensureConceptOffertesForAanvragen() {
  const supabase = await createClient()
  const adminId = await getAdministratieId()
  if (!adminId) return 0

  const supabaseAdmin = createAdminClient()

  // Find all open aanvraag-taken without [offerte:...] tag
  const { data: taken } = await supabaseAdmin
    .from('taken')
    .select('id, omschrijving')
    .eq('administratie_id', adminId)
    .eq('titel', 'Nieuwe aanvraag - offerte nog te maken')
    .neq('status', 'afgerond')

  if (!taken || taken.length === 0) return 0

  let created = 0
  for (const taak of taken) {
    // Skip if already has offerte linked
    if (taak.omschrijving?.includes('[offerte:')) continue

    // Extract email onderwerp from omschrijving
    const match = taak.omschrijving?.match(/"([^"]+)"/)
    const onderwerp = match?.[1] || '(geen onderwerp)'

    // Find the matching email to get relatie_id
    const { data: email } = await supabaseAdmin
      .from('emails')
      .select('id, van_email, van_naam, relatie_id')
      .eq('administratie_id', adminId)
      .ilike('onderwerp', onderwerp)
      .limit(1)
      .maybeSingle()

    let relatieId = email?.relatie_id || null

    // Create relatie if needed
    if (!relatieId && email) {
      const { data: newRelatie } = await supabaseAdmin
        .from('relaties')
        .insert({
          administratie_id: adminId,
          bedrijfsnaam: email.van_naam || email.van_email,
          email: email.van_email,
          type: 'particulier',
        })
        .select('id')
        .single()
      relatieId = newRelatie?.id || null
    }

    if (!relatieId) continue

    // Create project
    const { data: newProject } = await supabaseAdmin
      .from('projecten')
      .insert({
        administratie_id: adminId,
        relatie_id: relatieId,
        naam: onderwerp,
        status: 'actief',
      })
      .select('id')
      .single()

    // Create concept offerte
    const { data: offertenummer } = await supabaseAdmin.rpc('volgende_nummer', {
      p_administratie_id: adminId,
      p_type: 'offerte',
    })
    const vandaag = new Date().toISOString().split('T')[0]
    const { data: newOfferte } = await supabaseAdmin
      .from('offertes')
      .insert({
        administratie_id: adminId,
        relatie_id: relatieId,
        project_id: newProject?.id || null,
        offertenummer: offertenummer || '',
        datum: vandaag,
        status: 'concept',
        onderwerp,
        subtotaal: 0,
        btw_totaal: 0,
        totaal: 0,
      })
      .select('id')
      .single()

    // Update taak with offerte reference
    if (newOfferte) {
      await supabaseAdmin
        .from('taken')
        .update({
          omschrijving: `${taak.omschrijving} [offerte:${newOfferte.id}]`,
        })
        .eq('id', taak.id)
      created++
    }
  }

  return created
}

export async function getNummering() {
  const supabase = await createClient()
  const adminId = await getAdministratieId()
  if (!adminId) return []

  const { data } = await supabase
    .from('nummering')
    .select('*')
    .eq('administratie_id', adminId)
    .order('type')
  return data || []
}

export async function saveNummering(formData: FormData) {
  const supabase = await createClient()
  const id = formData.get('id') as string
  const prefix = formData.get('prefix') as string
  const volgend_nummer = parseInt(formData.get('volgend_nummer') as string)

  const { error } = await supabase
    .from('nummering')
    .update({ prefix, volgend_nummer })
    .eq('id', id)

  if (error) return { error: error.message }
  revalidatePath('/beheer')
  return { success: true }
}

// === GEBRUIKERSBEHEER ===
export async function getGebruikers() {
  const supabase = await createClient()
  const adminId = await getAdministratieId()
  if (!adminId) return []

  const { data } = await supabase
    .from('profielen')
    .select('*')
    .eq('administratie_id', adminId)
    .order('naam')
  return data || []
}

export async function createGebruiker(formData: FormData) {
  const supabase = await createClient()
  const adminId = await getAdministratieId()
  if (!adminId) return { error: 'Niet ingelogd' }

  const naam = formData.get('naam') as string
  const email = formData.get('email') as string
  const wachtwoord = formData.get('wachtwoord') as string
  const rol = formData.get('rol') as string || 'gebruiker'

  const supabaseAdmin = createAdminClient()
  const { data: userData, error: authError } = await supabaseAdmin.auth.admin.createUser({
    email,
    password: wachtwoord,
    email_confirm: true,
    user_metadata: { naam },
  })

  if (authError) return { error: authError.message }
  if (!userData.user) return { error: 'Gebruiker aanmaken mislukt' }

  // Update het profiel met de juiste administratie_id en rol
  const { error: profielError } = await supabaseAdmin
    .from('profielen')
    .update({ administratie_id: adminId, rol, naam })
    .eq('id', userData.user.id)

  if (profielError) return { error: profielError.message }

  // Optioneel: stuur welkomstmail met inloggegevens
  if (formData.get('stuur_email') === 'true') {
    const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'
    const welkomBody = `Beste ${naam},

Er is een account voor u aangemaakt bij Rebu Kozijnen.

Uw inloggegevens:
- E-mail: ${email}
- Wachtwoord: ${wachtwoord}

Wij raden u aan uw wachtwoord na de eerste login te wijzigen.`

    try {
      await sendEmail({
        to: email,
        subject: 'Uw account — Rebu Kozijnen',
        html: buildRebuEmailHtml(welkomBody, `${baseUrl}/login`, 'Inloggen'),
      })
    } catch (err) {
      console.error('Welkomstmail versturen mislukt:', err)
    }
  }

  revalidatePath('/beheer')
  return { success: true }
}

export async function deleteGebruiker(id: string) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (user?.id === id) return { error: 'U kunt uzelf niet verwijderen' }

  const supabaseAdmin = createAdminClient()
  const { error } = await supabaseAdmin.auth.admin.deleteUser(id)
  if (error) return { error: error.message }

  revalidatePath('/beheer')
  return { success: true }
}

// === OFFERTE VERSIONING ===
export async function duplicateOfferte(id: string) {
  const supabase = await createClient()
  const adminId = await getAdministratieId()
  if (!adminId) return { error: 'Niet ingelogd' }

  // Haal originele offerte + regels op
  const { data: origineel } = await supabase
    .from('offertes')
    .select('*, regels:offerte_regels(*)')
    .eq('id', id)
    .single()

  if (!origineel) return { error: 'Offerte niet gevonden' }

  // Bepaal hoogste versienummer in dezelfde groep
  const groepId = origineel.groep_id || id
  const { data: versies } = await supabase
    .from('offertes')
    .select('versie_nummer')
    .eq('groep_id', groepId)
    .order('versie_nummer', { ascending: false })
    .limit(1)

  const volgendVersie = (versies?.[0]?.versie_nummer || 1) + 1

  // Behoud zelfde offertenummer (OFF-0001 v1, v2, v3...)
  const nummer = origineel.offertenummer

  // Insert nieuwe offerte
  const { data: nieuw, error: insertError } = await supabase
    .from('offertes')
    .insert({
      administratie_id: adminId,
      relatie_id: origineel.relatie_id,
      offertenummer: nummer,
      datum: new Date().toISOString().split('T')[0],
      geldig_tot: origineel.geldig_tot,
      status: 'concept',
      onderwerp: origineel.onderwerp,
      inleiding: origineel.inleiding,
      subtotaal: origineel.subtotaal,
      btw_totaal: origineel.btw_totaal,
      totaal: origineel.totaal,
      opmerkingen: origineel.opmerkingen,
      project_id: origineel.project_id || null,
      versie_nummer: volgendVersie,
      groep_id: groepId,
    })
    .select('id')
    .single()

  if (insertError) return { error: insertError.message }

  // Kopieer regels
  const regels = origineel.regels || []
  if (regels.length > 0) {
    const regelRecords = regels.map((r: { omschrijving: string; aantal: number; prijs: number; btw_percentage: number; totaal: number; product_id?: string; volgorde: number }) => ({
      offerte_id: nieuw!.id,
      product_id: r.product_id || null,
      omschrijving: r.omschrijving,
      aantal: r.aantal,
      prijs: r.prijs,
      btw_percentage: r.btw_percentage,
      totaal: r.totaal,
      volgorde: r.volgorde,
    }))
    await supabase.from('offerte_regels').insert(regelRecords)
  }

  // Update groep_id op origineel als die nog niet gezet was
  if (!origineel.groep_id) {
    await supabase.from('offertes').update({ groep_id: groepId }).eq('id', id)
  }

  revalidatePath('/offertes')
  return { success: true, id: nieuw!.id }
}

// === RELATIE DETAIL ===
export async function getRelatieDetail(id: string) {
  const supabase = await createClient()

  const [relatieRes, offertesRes, facturenRes, projectenRes] = await Promise.all([
    supabase.from('relaties').select('*').eq('id', id).single(),
    supabase.from('offertes').select('*').eq('relatie_id', id).order('datum', { ascending: false }),
    supabase.from('facturen').select('*').eq('relatie_id', id).order('datum', { ascending: false }),
    supabase.from('projecten').select('id, naam, status, offertes:offertes(id, offertenummer, versie_nummer, datum, status, subtotaal, totaal, facturen:facturen(id, factuur_type, status))').eq('relatie_id', id).order('created_at', { ascending: false }),
  ])

  const relatie = relatieRes.data
  const offertes = offertesRes.data || []
  const facturen = facturenRes.data || []
  const projecten = projectenRes.data || []

  // Laad notities per project (verkoopkans) in batch
  const projectIds = projecten.map(p => p.id)
  const projectNotitiesMap = new Map<string, Array<{ id: string; tekst: string; created_at: string; gebruiker_naam: string | null }>>()
  if (projectIds.length > 0) {
    const { data: pn } = await supabase
      .from('notities')
      .select('id, project_id, tekst, created_at, gebruiker:profielen(naam)')
      .in('project_id', projectIds)
      .order('created_at', { ascending: false })
    for (const n of pn || []) {
      const pid = (n as { project_id: string }).project_id
      const list = projectNotitiesMap.get(pid) || []
      list.push({
        id: (n as { id: string }).id,
        tekst: (n as { tekst: string }).tekst,
        created_at: (n as { created_at: string }).created_at,
        gebruiker_naam: (n as { gebruiker: { naam: string } | null }).gebruiker?.naam ?? null,
      })
      projectNotitiesMap.set(pid, list)
    }
  }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  for (const p of projecten as any[]) {
    p.notities = projectNotitiesMap.get(p.id) || []
  }

  const totaleOmzet = facturen
    .filter(f => f.status === 'betaald')
    .reduce((sum, f) => sum + (f.totaal || 0), 0)

  const openstaand = facturen
    .filter(f => ['verzonden', 'deels_betaald', 'vervallen'].includes(f.status))
    .reduce((sum, f) => sum + (f.totaal || 0) - (f.betaald_bedrag || 0), 0)

  const geaccepteerdeOffertes = offertes.filter(o => o.status === 'geaccepteerd').length
  const conversiePercentage = offertes.length > 0 ? Math.round((geaccepteerdeOffertes / offertes.length) * 100) : 0

  // Totaal geoffreerd: som van hoogste versie per groep (excl BTW = subtotaal).
  // Geannuleerde/verlopen offertes en revisies tellen niet dubbel.
  const latestPerGroep = new Map<string, typeof offertes[number]>()
  for (const o of offertes) {
    if (o.status === 'geannuleerd' || o.status === 'vervallen') continue
    const key = (o.groep_id as string) || (o.id as string)
    const existing = latestPerGroep.get(key)
    if (!existing || (o.versie_nummer || 0) > (existing.versie_nummer || 0)) {
      latestPerGroep.set(key, o)
    }
  }
  const totaalGeoffreerd = Array.from(latestPerGroep.values()).reduce((sum, o) => sum + (o.subtotaal || 0), 0)

  return {
    relatie,
    offertes,
    facturen,
    projecten,
    stats: {
      totaleOmzet,
      openstaand,
      aantalOffertes: offertes.length,
      totaalGeoffreerd,
      conversiePercentage,
    },
  }
}

// === LEADS ===
export async function saveLeadAsRelatie(data: {
  name: string
  address: string
  place_id: string
  phone?: string
  website?: string
}) {
  const supabase = await createClient()
  const adminId = await getAdministratieId()
  if (!adminId) return { error: 'Niet ingelogd' }

  // Check of lead al bestaat
  const { data: existing } = await supabase
    .from('relaties')
    .select('id')
    .eq('google_place_id', data.place_id)
    .eq('administratie_id', adminId)
    .maybeSingle()

  if (existing) return { error: 'Deze lead is al opgeslagen' }

  // Parse adres voor postcode en plaats
  const adresParts = data.address.split(',').map(s => s.trim())
  const postcodeMatch = data.address.match(/(\d{4}\s?[A-Z]{2})/i)
  const postcode = postcodeMatch ? postcodeMatch[1] : null

  const { error } = await supabase.from('relaties').insert({
    administratie_id: adminId,
    bedrijfsnaam: data.name,
    type: 'particulier',
    adres: adresParts[0] || null,
    postcode,
    plaats: adresParts.length > 1 ? adresParts[adresParts.length - 2]?.replace(/\d{4}\s?[A-Z]{2}/i, '').trim() || null : null,
    telefoon: data.phone || null,
    website: data.website || null,
    google_place_id: data.place_id,
  })

  if (error) return { error: error.message }
  revalidatePath('/relatiebeheer')
  return { success: true }
}

// === INLINE RELATIE AANMAKEN (vanuit offerte wizard) ===
export async function createRelatieInline(data: {
  bedrijfsnaam: string
  contactpersoon?: string
  email?: string
  telefoon?: string
  adres?: string
  postcode?: string
  plaats?: string
  type?: string
}) {
  const supabase = await createClient()
  const adminId = await getAdministratieId()
  if (!adminId) return { error: 'Niet ingelogd' }

  const { data: relatie, error } = await supabase
    .from('relaties')
    .insert({
      administratie_id: adminId,
      bedrijfsnaam: data.bedrijfsnaam,
      contactpersoon: data.contactpersoon || null,
      email: data.email || null,
      telefoon: data.telefoon || null,
      adres: data.adres || null,
      postcode: data.postcode || null,
      plaats: data.plaats || null,
      type: data.type || 'particulier',
    })
    .select('id, bedrijfsnaam')
    .single()

  if (error) return { error: error.message }
  revalidatePath('/relatiebeheer')
  return { success: true, id: relatie.id, bedrijfsnaam: relatie.bedrijfsnaam }
}

// === OFFERTE EMAIL VERSTUREN ===
export async function getOfferteEmailDefaults(offerteId: string) {
  const supabase = await createClient()

  const { data: offerte } = await supabase
    .from('offertes')
    .select('*, relatie:relaties(*)')
    .eq('id', offerteId)
    .single()

  if (!offerte) return { error: 'Offerte niet gevonden' }

  // Haal naam van ingelogde gebruiker op
  const { data: { user } } = await supabase.auth.getUser()
  let medewerkerNaam = 'Rebu Kozijnen'
  if (user) {
    const adminClient = createAdminClient()
    const { data: profiel } = await adminClient
      .from('profielen')
      .select('naam')
      .eq('id', user.id)
      .single()
    if (profiel?.naam) medewerkerNaam = profiel.naam
  }

  const klantNaam = offerte.relatie?.contactpersoon || offerte.relatie?.bedrijfsnaam || ''
  const projectNaam = offerte.onderwerp || offerte.relatie?.bedrijfsnaam || ''

  const body = `Beste ${klantNaam},

Dank u wel voor uw interesse in onze diensten.

Bijgevoegd in deze e-mail treft u de offerte aan betreft aanvraag ${projectNaam}:
- Onze gedetailleerde offerte PDF voor de door u aangevraagde diensten. (offertenummer ${offerte.offertenummer})

Wanneer u akkoord gaat met ons voorstel, kunt u de offerte eenvoudig online accepteren via de link onderaan deze e-mail.

Indien u aanvullende vragen heeft of wanneer u aanpassingen wilt op de offerte, dan kunt u met ons contact opnemen.

Met vriendelijke groet,
${medewerkerNaam}`

  return {
    to: offerte.relatie?.email || '',
    subject: `Offerte ${offerte.offertenummer} - Rebu Kozijnen`,
    body,
  }
}

export async function sendOfferteEmail(offerteId: string, options: {
  to: string
  subject: string
  body: string
  extraBijlagen?: { filename: string; content: string }[]
}) {
  const supabase = await createClient()

  const { data: offerte } = await supabase
    .from('offertes')
    .select('*, relatie:relaties(*), regels:offerte_regels(*)')
    .eq('id', offerteId)
    .single()

  if (!offerte) return { error: 'Offerte niet gevonden' }
  if (!options.to) return { error: 'Geen e-mailadres opgegeven' }

  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'
  const link = `${baseUrl}/offerte/${offerte.publiek_token}`

  // Haal medewerker-gegevens op voor de mail-footer (en Reply-To)
  const supabaseAdmin = createAdminClient()
  const { data: offerteUserData } = await supabase.auth.getUser()
  const offerteUser = offerteUserData?.user
  let medewerkerInfo: { naam?: string; email?: string; telefoon?: string } | undefined
  if (offerteUser) {
    const { data: profiel } = await supabaseAdmin
      .from('profielen')
      .select('naam, email')
      .eq('id', offerteUser.id)
      .single()
    if (profiel) {
      const { data: mw } = await supabaseAdmin
        .from('medewerkers')
        .select('telefoon')
        .eq('profiel_id', offerteUser.id)
        .maybeSingle()
      medewerkerInfo = { naam: profiel.naam || undefined, email: profiel.email || undefined, telefoon: mw?.telefoon || undefined }
    }
  }

  const emailHtml = buildRebuEmailHtml(options.body, link, 'Offerte bekijken &amp; accepteren', medewerkerInfo)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let kozijnElementen: any[] | undefined

  try {
    const { data: leverancierDoc } = await supabaseAdmin
      .from('documenten')
      .select('*')
      .eq('entiteit_type', 'offerte_leverancier')
      .eq('entiteit_id', offerteId)
      .maybeSingle()

    if (leverancierDoc) {
      const { data: metaDoc } = await supabaseAdmin
        .from('documenten')
        .select('*')
        .eq('entiteit_type', 'offerte_leverancier_data')
        .eq('entiteit_id', offerteId)
        .maybeSingle()

      if (metaDoc) {
        // Support both old format (array) and new format (object with tekeningen + margePercentage)
        const rawMeta = JSON.parse(metaDoc.storage_path)
        let tekeningData: { naam: string; tekeningPath: string }[]
        let margePercentage = 0
        let marges: Record<string, number> = {}
        if (Array.isArray(rawMeta)) {
          tekeningData = rawMeta
        } else {
          tekeningData = rawMeta.tekeningen || []
          margePercentage = rawMeta.margePercentage || 0
          marges = rawMeta.marges || {}
        }

        const { parsePdfBuffer: pdfParse } = await import('@/lib/pdf-extract')
        const { data: pdfFile } = await supabaseAdmin.storage
          .from('documenten')
          .download(leverancierDoc.storage_path)

        if (pdfFile) {
          const pdfBuffer = Buffer.from(await pdfFile.arrayBuffer())
          const parsed = await pdfParse(pdfBuffer)
          const elementData = parseLeverancierPdfText(parsed.text).elementen

          kozijnElementen = []
          for (const tekening of tekeningData) {
            const { data: imgFile } = await supabaseAdmin.storage
              .from('documenten')
              .download(tekening.tekeningPath)

            let tekeningUrl = ''
            if (imgFile) {
              const imgBuffer = Buffer.from(await imgFile.arrayBuffer())
              const mime = /\.jpe?g$/i.test(tekening.tekeningPath) ? 'image/jpeg' : 'image/png'
              tekeningUrl = `data:${mime};base64,${imgBuffer.toString('base64')}`
            }

            const matchingElement = elementData.find(e => e.naam === tekening.naam)
            const inkoopPrijs = matchingElement?.prijs || 0
            const margePerc = marges[tekening.naam] ?? margePercentage
            const verkoopPrijs = margePerc > 0 ? Math.round(inkoopPrijs * (1 + margePerc / 100) * 100) / 100 : inkoopPrijs

            kozijnElementen.push({
              naam: matchingElement?.naam || tekening.naam,
              hoeveelheid: matchingElement?.hoeveelheid || 1,
              systeem: matchingElement?.systeem || '',
              kleur: matchingElement?.kleur || '',
              afmetingen: matchingElement?.afmetingen || '',
              type: matchingElement?.type || '',
              prijs: verkoopPrijs,
              glasType: matchingElement?.glasType || '',
              beslag: matchingElement?.beslag || '',
              uwWaarde: matchingElement?.uwWaarde || '',
              drapirichting: matchingElement?.drapirichting || '',
              dorpel: matchingElement?.dorpel || '',
              sluiting: matchingElement?.sluiting || '',
              scharnieren: matchingElement?.scharnieren || '',
              gewicht: matchingElement?.gewicht || '',
              paneel: matchingElement?.paneel || '',
              commentaar: matchingElement?.commentaar || '',
              tekeningUrl,
            })
          }
        }
      }
    }
  } catch (err) {
    console.error('Error loading kozijn elements for email:', err)
  }

  // Genereer offerte PDF (met kozijn tekeningen)
  const attachments: { filename: string; content: string }[] = []
  try {
    const { renderToBuffer } = await import('@react-pdf/renderer')
    const { OfferteDocument } = await import('@/lib/pdf/offerte-template')
    const offerteData = { ...offerte, kozijnElementen }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const pdfBuffer = await renderToBuffer(OfferteDocument({ offerte: offerteData }) as any)
    const pdfBase64 = Buffer.from(pdfBuffer).toString('base64')
    attachments.push({
      filename: `Offerte-${offerte.offertenummer}.pdf`,
      content: pdfBase64,
    })
    // De 'offerte zonder prijzen' is vervangen door de 'Tekeningen-*.pdf' hieronder,
    // zodat er altijd maar 2 bestanden meegaan: offerte-met-prijzen + tekeningen.
  } catch (err) {
    console.error('PDF generatie voor email mislukt:', err)
  }

  // Genereer tekeningen PDF (zonder prijzen) als er kozijn elementen zijn
  if (kozijnElementen && kozijnElementen.length > 0) {
    try {
      const { renderToBuffer } = await import('@react-pdf/renderer')
      const { TekeningenDocument } = await import('@/lib/pdf/tekeningen-template')
      const tekeningenElementen = kozijnElementen.map(e => ({ ...e }))
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const tekPdfBuffer = await renderToBuffer(TekeningenDocument({ offerte: { offertenummer: offerte.offertenummer, elementen: tekeningenElementen } }) as any)
      const tekPdfBase64 = Buffer.from(tekPdfBuffer).toString('base64')
      attachments.push({
        filename: `Tekeningen-${offerte.offertenummer}.pdf`,
        content: tekPdfBase64,
      })
    } catch (err) {
      console.error('Tekeningen PDF generatie voor email mislukt:', err)
    }
  }

  // Extra bijlagen (tekeningen etc.)
  if (options.extraBijlagen) {
    attachments.push(...options.extraBijlagen)
  }

  try {
    await sendEmail({
      to: options.to,
      subject: options.subject,
      html: emailHtml,
      attachments: attachments.map(a => ({
        filename: a.filename,
        content: Buffer.from(a.content, 'base64'),
      })),
      fromName: 'Rebu Kozijnen',
    })
  } catch (err) {
    console.error('E-mail verzenden mislukt:', err)
    return { error: 'E-mail verzenden mislukt. Gebruik de link om handmatig te delen.', link }
  }

  // Update status naar verzonden
  await supabase.from('offertes').update({ status: 'verzonden' }).eq('id', offerteId)

  // Log email in email_log
  const { data: { user } } = await supabase.auth.getUser()
  // Auto-gegenereerde bijlagen (Offerte PDF + Tekeningen PDF) krijgen alleen
  // filename; die kunnen we altijd on-the-fly regenereren via /api/pdf/offerte/[id].
  // User-uploads uit extraBijlagen archiveren we in storage zodat ze later
  // terug te halen zijn via getEmailBijlageUrl.
  const bijlagenMeta: { filename: string; storage_path?: string; kind: 'offerte_pdf' | 'tekeningen_pdf' | 'upload' }[] = attachments.map(a => ({
    filename: a.filename,
    kind: a.filename.startsWith('Offerte-') ? 'offerte_pdf' : a.filename.startsWith('Tekeningen-') ? 'tekeningen_pdf' : 'upload',
  }))
  const { data: emailLogRow } = await supabaseAdmin.from('email_log').insert({
    administratie_id: offerte.administratie_id,
    offerte_id: offerteId,
    relatie_id: offerte.relatie_id,
    aan: options.to,
    onderwerp: options.subject,
    body_html: emailHtml,
    bijlagen: bijlagenMeta,
    verstuurd_door: user?.id || null,
  }).select('id').single()

  // Archiveer user-upload bijlagen in storage zodat ze klikbaar blijven
  if (emailLogRow?.id && options.extraBijlagen && options.extraBijlagen.length > 0) {
    const updatedBijlagen = [...bijlagenMeta]
    for (const bij of options.extraBijlagen) {
      const idx = updatedBijlagen.findIndex(b => b.filename === bij.filename && b.kind === 'upload' && !b.storage_path)
      if (idx < 0) continue
      const safeName = bij.filename.replace(/[^\w.\-]/g, '_')
      const path = `${emailLogRow.id}/${safeName}`
      const { error: upErr } = await supabaseAdmin.storage
        .from('email-bijlagen')
        .upload(path, Buffer.from(bij.content, 'base64'), {
          contentType: bij.filename.toLowerCase().endsWith('.pdf') ? 'application/pdf' : 'application/octet-stream',
          upsert: true,
        })
      if (!upErr) updatedBijlagen[idx] = { ...updatedBijlagen[idx], storage_path: path }
      else console.warn('bijlage upload failed:', bij.filename, upErr.message)
    }
    await supabaseAdmin.from('email_log').update({ bijlagen: updatedBijlagen }).eq('id', emailLogRow.id)
  }

  // Auto-taak: "Offerte opvolgen" na 3 werkdagen
  try {
    const deadline = new Date()
    let werkdagen = 0
    while (werkdagen < 3) {
      deadline.setDate(deadline.getDate() + 1)
      const dag = deadline.getDay()
      if (dag !== 0 && dag !== 6) werkdagen++
    }
    // Get relatie_id via project
    let relatieId = offerte.relatie_id
    // Match medewerker van de ingelogde gebruiker
    let opvolgMedewerkerId: string | null = null
    if (user?.id) {
      const { data: mw } = await supabaseAdmin
        .from('medewerkers')
        .select('id')
        .eq('profiel_id', user.id)
        .eq('administratie_id', offerte.administratie_id)
        .maybeSingle()
      opvolgMedewerkerId = mw?.id || null
    }
    await supabaseAdmin.from('taken').insert({
      administratie_id: offerte.administratie_id,
      taaknummer: await getVolgendTaaknummer(supabaseAdmin),
      titel: `Offerte opvolgen: ${offerte.offertenummer}`,
      omschrijving: `Offerte ${offerte.offertenummer} is verzonden naar ${options.to}. Neem contact op om te checken of alles duidelijk is.`,
      project_id: offerte.project_id || null,
      relatie_id: relatieId || null,
      offerte_id: offerteId,
      deadline: deadline.toISOString().split('T')[0],
      status: 'open',
      prioriteit: 'normaal',
      medewerker_id: opvolgMedewerkerId,
      toegewezen_aan: user?.id || null,
    })
  } catch (err) {
    console.error('Auto-taak aanmaken mislukt:', err)
  }

  revalidatePath('/offertes')
  revalidatePath('/taken')
  return { success: true, link }
}

// === PUBLIEKE OFFERTE (zonder auth) ===
export async function getOfferteByToken(token: string) {
  const supabaseAdmin = createAdminClient()
  const { data } = await supabaseAdmin
    .from('offertes')
    .select('*, relatie:relaties(bedrijfsnaam, contactpersoon), regels:offerte_regels(*)')
    .eq('publiek_token', token)
    .single()
  return data
}

export async function acceptOffertePublic(token: string) {
  const supabaseAdmin = createAdminClient()

  const { data: offerte, error: fetchError } = await supabaseAdmin
    .from('offertes')
    .select('id, status, administratie_id, relatie_id, offertenummer, onderwerp, subtotaal, btw_totaal, totaal, relatie:relaties(email, contactpersoon, bedrijfsnaam)')
    .eq('publiek_token', token)
    .single()

  if (fetchError || !offerte) return { error: 'Offerte niet gevonden' }
  if (offerte.status === 'geaccepteerd') return { error: 'Deze offerte is al geaccepteerd' }

  const { error } = await supabaseAdmin
    .from('offertes')
    .update({ status: 'geaccepteerd' })
    .eq('id', offerte.id)

  if (error) return { error: error.message }

  // Auto-create order
  const { data: existingOrder } = await supabaseAdmin
    .from('orders')
    .select('id')
    .eq('offerte_id', offerte.id)
    .maybeSingle()

  if (!existingOrder) {
    const { data: regels } = await supabaseAdmin
      .from('offerte_regels')
      .select('*')
      .eq('offerte_id', offerte.id)
      .order('volgorde')

    const { data: ordernummer } = await supabaseAdmin.rpc('volgende_nummer', {
      p_administratie_id: offerte.administratie_id,
      p_type: 'order',
    })

    const { data: order } = await supabaseAdmin
      .from('orders')
      .insert({
        administratie_id: offerte.administratie_id,
        relatie_id: offerte.relatie_id,
        offerte_id: offerte.id,
        ordernummer: ordernummer || '',
        datum: new Date().toISOString().split('T')[0],
        leverdatum: null,
        status: 'nieuw',
        onderwerp: offerte.onderwerp,
        subtotaal: offerte.subtotaal,
        btw_totaal: offerte.btw_totaal,
        totaal: offerte.totaal,
      })
      .select('id')
      .single()

    if (order && regels && regels.length > 0) {
      await supabaseAdmin.from('order_regels').insert(
        regels.map((r, i) => ({
          order_id: order.id,
          product_id: r.product_id || null,
          omschrijving: r.omschrijving,
          aantal: r.aantal,
          prijs: r.prijs,
          btw_percentage: r.btw_percentage,
          totaal: r.aantal * r.prijs,
          volgorde: i,
        }))
      )
    }
  }

  // Bevestigingsmail naar klant
  const relatieEmail = (offerte.relatie as { email?: string } | null)?.email
  if (relatieEmail) {
    try {
      const klantNaam = (offerte.relatie as { contactpersoon?: string; bedrijfsnaam?: string } | null)?.contactpersoon
        || (offerte.relatie as { bedrijfsnaam?: string } | null)?.bedrijfsnaam || ''
      const bevestigBody = `Beste ${klantNaam},

Bedankt voor het accepteren van offerte ${offerte.offertenummer}.

Wij gaan direct voor u aan de slag. U ontvangt binnenkort meer informatie over het vervolg.

Heeft u in de tussentijd vragen? Neem gerust contact met ons op.

Met vriendelijke groet,
Rebu Kozijnen`

      const emailHtml = buildRebuEmailHtml(bevestigBody)
      await sendEmail({
        to: relatieEmail,
        subject: `Uw offerte ${offerte.offertenummer} is geaccepteerd — Bedankt!`,
        html: emailHtml,
      })
    } catch (err) {
      console.error('Bevestigingsmail verzenden mislukt:', err)
    }
  }

  return { success: true }
}

// Alle verzonden e-mails (met bijlagen) voor een offerte
export async function getOfferteEmailLog(offerteId: string) {
  const supabase = await createClient()
  const adminId = await getAdministratieId()
  if (!adminId) return []
  const { data } = await supabase
    .from('email_log')
    .select('id, aan, onderwerp, bijlagen, verstuurd_op, verstuurd_door')
    .eq('offerte_id', offerteId)
    .eq('administratie_id', adminId)
    .order('verstuurd_op', { ascending: false })
  return data || []
}

// Alle verzonden e-mails (met bijlagen) voor een relatie — offerte én factuur
export async function getEmailLogByRelatie(relatieId: string) {
  const supabase = await createClient()
  const adminId = await getAdministratieId()
  if (!adminId) return []
  const { data } = await supabase
    .from('email_log')
    .select('id, aan, onderwerp, bijlagen, verstuurd_op, offerte_id, order_id, offerte:offertes(id, offertenummer)')
    .eq('relatie_id', relatieId)
    .eq('administratie_id', adminId)
    .order('verstuurd_op', { ascending: false })
  return data || []
}

// Alle verzonden e-mails voor een verkoopkans (project) — via offertes van het project
export async function getEmailLogByProject(projectId: string) {
  const supabase = await createClient()
  const adminId = await getAdministratieId()
  if (!adminId) return []
  // Eerst offerte-ids van dit project
  const { data: offertes } = await supabase
    .from('offertes')
    .select('id, offertenummer')
    .eq('project_id', projectId)
  const offerteIds = (offertes || []).map(o => o.id)
  if (offerteIds.length === 0) return []
  const offerteMap = new Map(offertes!.map(o => [o.id as string, o.offertenummer as string]))
  const { data } = await supabase
    .from('email_log')
    .select('id, aan, onderwerp, bijlagen, verstuurd_op, offerte_id')
    .in('offerte_id', offerteIds)
    .eq('administratie_id', adminId)
    .order('verstuurd_op', { ascending: false })
  return (data || []).map(e => ({
    ...e,
    offertenummer: offerteMap.get(e.offerte_id as string) || null,
  }))
}

// Alle verzonden e-mails (met bijlagen) voor een factuur
export async function getFactuurEmailLog(factuurId: string) {
  const supabase = await createClient()
  const adminId = await getAdministratieId()
  if (!adminId) return []
  const { data } = await supabase
    .from('email_log')
    .select('id, aan, onderwerp, bijlagen, verstuurd_op, verstuurd_door')
    .eq('factuur_id', factuurId)
    .eq('administratie_id', adminId)
    .order('verstuurd_op', { ascending: false })
  return data || []
}

export async function deleteEmailLog(id: string) {
  const supabase = await createClient()
  const { error } = await supabase.from('email_log').delete().eq('id', id)
  if (error) return { error: error.message }
  return { success: true }
}

// Snelle update van offerte-onderwerp (voor inline-editing in timeline)
export async function updateOfferteOnderwerp(id: string, onderwerp: string) {
  const supabase = await createClient()
  const { error } = await supabase.from('offertes').update({ onderwerp }).eq('id', id)
  if (error) return { error: error.message }
  return { success: true }
}

// Archiveer een lokaal bestand als bijlage op een bestaande email_log rij.
// Nodig voor mails die vóór de storage-migratie zijn verstuurd en waar de
// user-uploaded PDFs niet zijn opgeslagen — nu kan de gebruiker ze alsnog
// aan de mail koppelen zodat ze openbaar vanuit de CRM te openen zijn.
export async function archiveBijlageFromUpload(emailLogId: string, filename: string, base64: string) {
  const adminId = await getAdministratieId()
  if (!adminId) return { error: 'Niet ingelogd' }
  const supabase = createAdminClient()
  const { data: log } = await supabase
    .from('email_log')
    .select('id, administratie_id, bijlagen')
    .eq('id', emailLogId)
    .eq('administratie_id', adminId)
    .single()
  if (!log) return { error: 'Email niet gevonden' }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const bijlagen = ((log.bijlagen as any[]) || []).slice()
  const idx = bijlagen.findIndex(b => b.filename === filename)
  if (idx < 0) return { error: 'Bijlage niet in mail gevonden' }
  const safeName = filename.replace(/[^\w.\-]/g, '_')
  const path = `${emailLogId}/${safeName}`
  const { error: upErr } = await supabase.storage
    .from('email-bijlagen')
    .upload(path, Buffer.from(base64, 'base64'), {
      contentType: filename.toLowerCase().endsWith('.pdf') ? 'application/pdf' : 'application/octet-stream',
      upsert: true,
    })
  if (upErr) return { error: upErr.message }
  bijlagen[idx] = { ...bijlagen[idx], storage_path: path, kind: bijlagen[idx].kind || 'upload' }
  const { error: updErr } = await supabase.from('email_log').update({ bijlagen }).eq('id', emailLogId)
  if (updErr) return { error: updErr.message }
  return { success: true }
}

// Signed URL voor een geüploade bijlage in het email_log
export async function getEmailBijlageUrl(emailLogId: string, filename: string) {
  const adminId = await getAdministratieId()
  if (!adminId) return { error: 'Niet ingelogd' }
  const supabase = createAdminClient()
  const { data: log } = await supabase
    .from('email_log')
    .select('id, administratie_id, bijlagen')
    .eq('id', emailLogId)
    .eq('administratie_id', adminId)
    .single()
  if (!log) return { error: 'Email niet gevonden' }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const bijlagen = (log.bijlagen as any[]) || []
  const match = bijlagen.find(b => b.filename === filename)
  if (!match?.storage_path) return { error: 'Bijlage niet gearchiveerd' }
  const { data: signed } = await supabase.storage
    .from('email-bijlagen')
    .createSignedUrl(match.storage_path, 300)
  if (!signed?.signedUrl) return { error: 'Signed URL mislukt' }
  return { url: signed.signedUrl }
}

// === EMAIL LOG DETAIL ===
export async function getEmailLogDetail(id: string) {
  const supabase = await createClient()
  const adminId = await getAdministratieId()
  if (!adminId) return null

  const { data } = await supabase
    .from('email_log')
    .select('id, aan, onderwerp, body_html, bijlagen, verstuurd_op, offerte_id, factuur_id, order_id')
    .eq('id', id)
    .eq('administratie_id', adminId)
    .single()

  return data
}

// === LEVERPLANNING ===
export async function getDeliveryEmailDefaults(orderId: string) {
  const supabase = await createClient()

  const { data: order } = await supabase
    .from('orders')
    .select('*, relatie:relaties(*), offerte:offertes(offertenummer)')
    .eq('id', orderId)
    .single()

  if (!order) return { error: 'Order niet gevonden' }

  const { data: { user } } = await supabase.auth.getUser()
  let medewerkerNaam = 'Rebu Kozijnen'
  if (user) {
    const adminClient = createAdminClient()
    const { data: profiel } = await adminClient
      .from('profielen')
      .select('naam')
      .eq('id', user.id)
      .single()
    if (profiel?.naam) medewerkerNaam = profiel.naam
  }

  return {
    to: (order.relatie as { email?: string } | null)?.email || '',
    subject: `Leverplanning ${order.ordernummer} - Rebu Kozijnen`,
    klantNaam: (order.relatie as { contactpersoon?: string; bedrijfsnaam?: string } | null)?.contactpersoon
      || (order.relatie as { bedrijfsnaam?: string } | null)?.bedrijfsnaam || '',
    medewerkerNaam,
  }
}

export async function planDelivery(orderId: string, options: {
  leverdatum: string
  emailTo: string
  emailSubject: string
  emailBody: string
}) {
  const supabase = await createClient()

  const { error: updateError } = await supabase
    .from('orders')
    .update({ leverdatum: options.leverdatum, status: 'in_behandeling' })
    .eq('id', orderId)

  if (updateError) return { error: updateError.message }

  // Send email via SMTP
  const emailHtml = buildRebuEmailHtml(options.emailBody)

  try {
    await sendEmail({
      to: options.emailTo,
      subject: options.emailSubject,
      html: emailHtml,
    })
  } catch (err) {
    console.error('Levering e-mail verzenden mislukt:', err)
    return { error: 'E-mail verzenden mislukt' }
  }

  revalidatePath('/')
  revalidatePath('/offertes/orders')
  return { success: true }
}

// === OFFERTE NAAR FACTUUR ===
// Vult een offerte in 1 klik: voegt 1 regel toe met het gegeven totaalbedrag incl BTW,
// corrigeert subtotaal/btw/totaal op de offerte header. Handig voor geïmporteerde
// offertes (Tribe of leeg-concept) waar geen prijs bekend is.
export async function vulOffertePrijs(
  offerteId: string,
  bedragIncl: number,
  omschrijving?: string
) {
  const adminId = await getAdministratieId()
  if (!adminId) return { error: 'Niet ingelogd' }
  if (!bedragIncl || bedragIncl <= 0) return { error: 'Geef een geldig bedrag op' }

  const sb = createAdminClient()
  const { data: offerte } = await sb.from('offertes').select('id, onderwerp').eq('id', offerteId).single()
  if (!offerte) return { error: 'Offerte niet gevonden' }

  const excl = Math.round((bedragIncl / 1.21) * 100) / 100
  const btw = Math.round((bedragIncl - excl) * 100) / 100

  // Verwijder eventuele bestaande lege regels
  await sb.from('offerte_regels').delete().eq('offerte_id', offerteId)

  await sb.from('offerte_regels').insert({
    offerte_id: offerteId,
    omschrijving: omschrijving || offerte.onderwerp || 'Kunststof kozijnen leveren',
    aantal: 1,
    prijs: excl,
    btw_percentage: 21,
    totaal: excl,
    volgorde: 0,
  })

  await sb.from('offertes').update({
    subtotaal: excl,
    btw_totaal: btw,
    totaal: bedragIncl,
  }).eq('id', offerteId)

  revalidatePath(`/offertes/${offerteId}`)
  return { success: true }
}

// Directe factuurflow vanuit een verkoopkans (project) — vult ontbrekende prijzen
// aan op basis van de laatste geaccepteerde offerte of een door user opgegeven bedrag.
export async function factureerVerkoopkans(
  projectId: string,
  opties: { bedrag?: number; omschrijving?: string } = {}
) {
  const supabase = await createClient()
  const adminId = await getAdministratieId()
  if (!adminId) return { error: 'Niet ingelogd' }

  const { data: project } = await supabase
    .from('projecten')
    .select('id, naam, relatie_id')
    .eq('id', projectId)
    .single()
  if (!project) return { error: 'Verkoopkans niet gevonden' }
  if (!project.relatie_id) return { error: 'Verkoopkans heeft geen relatie' }

  // Laatste geaccepteerde offerte ophalen
  const { data: offertes } = await supabase
    .from('offertes')
    .select('id, offertenummer, onderwerp, subtotaal, btw_totaal, totaal, status, versie_nummer, regels:offerte_regels(*)')
    .eq('project_id', projectId)
    .order('versie_nummer', { ascending: false })
  const geaccepteerd = (offertes || []).find(o => o.status === 'geaccepteerd')
  const laatste = geaccepteerd || (offertes || [])[0]

  if (laatste) {
    // Als offerte regels heeft én totaal > 0 → normale convertToFactuur
    const regelsCount = (laatste.regels || []).length
    if (regelsCount > 0 && Number(laatste.totaal || 0) > 0 && !opties.bedrag) {
      return await convertToFactuur(laatste.id, 'volledig')
    }
  }

  // Fallback: maak factuur direct met gegeven bedrag (excl BTW) of offerte.totaal
  const totaalIncl = opties.bedrag ?? Number(laatste?.totaal || 0)
  if (!totaalIncl || totaalIncl <= 0) return { error: 'Geen bedrag bekend — geef een bedrag op of vul de offerte aan' }
  const excl = Math.round((totaalIncl / 1.21) * 100) / 100
  const btw = Math.round((totaalIncl - excl) * 100) / 100

  const nummer = await getVolgendeNummer('factuur')
  const { data: factuur, error } = await supabase
    .from('facturen')
    .insert({
      administratie_id: adminId,
      relatie_id: project.relatie_id,
      offerte_id: laatste?.id || null,
      factuur_type: 'volledig',
      factuurnummer: nummer,
      datum: new Date().toISOString().slice(0, 10),
      vervaldatum: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10),
      status: 'concept',
      onderwerp: opties.omschrijving || laatste?.onderwerp || project.naam,
      subtotaal: excl,
      btw_totaal: btw,
      totaal: totaalIncl,
    })
    .select('id')
    .single()
  if (error || !factuur) return { error: error?.message || 'Factuur aanmaken mislukt' }

  await supabase.from('factuur_regels').insert({
    factuur_id: factuur.id,
    omschrijving: opties.omschrijving || laatste?.onderwerp || 'Kunststof kozijnen leveren',
    aantal: 1,
    prijs: excl,
    btw_percentage: 21,
    totaal: excl,
    volgorde: 0,
  })
  await zorgVoorBetaallink(factuur.id)

  revalidatePath('/facturatie')
  revalidatePath(`/projecten/${projectId}`)
  return { success: true, factuurId: factuur.id, factuurnummer: nummer }
}

export async function convertToFactuur(offerteId: string, splitType: 'volledig' | 'split' = 'volledig', aanbetalingPercentage = 70) {
  const supabase = await createClient()
  const adminId = await getAdministratieId()
  if (!adminId) return { error: 'Niet ingelogd' }

  const { data: offerte } = await supabase
    .from('offertes')
    .select('*, regels:offerte_regels(*)')
    .eq('id', offerteId)
    .single()

  if (!offerte) return { error: 'Offerte niet gevonden' }

  // Zoek gekoppelde order voor deze offerte
  const { data: linkedOrder } = await supabase
    .from('orders')
    .select('id')
    .eq('offerte_id', offerteId)
    .limit(1)
    .single()
  const orderId = linkedOrder?.id || null

  if (splitType === 'volledig') {
    const nummer = await getVolgendeNummer('factuur')
    const { data: factuur, error } = await supabase
      .from('facturen')
      .insert({
        administratie_id: adminId,
        relatie_id: offerte.relatie_id,
        offerte_id: offerteId,
        order_id: orderId,
        factuur_type: 'volledig',
        factuurnummer: nummer,
        datum: new Date().toISOString().split('T')[0],
        vervaldatum: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
        status: 'concept',
        onderwerp: offerte.onderwerp,
        subtotaal: offerte.subtotaal,
        btw_totaal: offerte.btw_totaal,
        totaal: offerte.totaal,
      })
      .select('id')
      .single()

    if (error) return { error: error.message }

    const regels = offerte.regels || []
    if (regels.length > 0) {
      await supabase.from('factuur_regels').insert(
        regels.map((r: { product_id?: string; omschrijving: string; aantal: number; prijs: number; btw_percentage: number; totaal: number }, i: number) => ({
          factuur_id: factuur.id,
          product_id: r.product_id || null,
          omschrijving: r.omschrijving,
          aantal: r.aantal,
          prijs: r.prijs,
          btw_percentage: r.btw_percentage,
          totaal: r.totaal,
          volgorde: i,
        }))
      )
    } else if (Number(offerte.totaal || 0) > 0) {
      // Fallback voor geïmporteerde Tribe-offertes zonder regels: reken excl BTW uit totaal
      const totaalIncl = Number(offerte.totaal || 0)
      const excl = Number(offerte.subtotaal) > 0 ? Number(offerte.subtotaal) : Math.round((totaalIncl / 1.21) * 100) / 100
      await supabase.from('factuur_regels').insert({
        factuur_id: factuur.id,
        omschrijving: offerte.onderwerp || 'Kunststof kozijnen leveren',
        aantal: 1,
        prijs: excl,
        btw_percentage: 21,
        totaal: excl,
        volgorde: 0,
      })
    }

    await zorgVoorBetaallink(factuur.id)
    revalidatePath('/facturatie')
    return { success: true, factuurIds: [factuur.id] }
  } else {
    const nummer1 = await getVolgendeNummer('factuur')
    const nummer2 = await getVolgendeNummer('factuur')

    const factor = aanbetalingPercentage / 100
    const aanbetalingSubtotaal = Math.round(offerte.subtotaal * factor * 100) / 100
    const aanbetalingBtw = Math.round(offerte.btw_totaal * factor * 100) / 100
    const aanbetalingTotaal = aanbetalingSubtotaal + aanbetalingBtw

    const restSubtotaal = offerte.subtotaal - aanbetalingSubtotaal
    const restBtw = offerte.btw_totaal - aanbetalingBtw
    const restTotaal = restSubtotaal + restBtw

    const { data: factuur1, error: err1 } = await supabase
      .from('facturen')
      .insert({
        administratie_id: adminId,
        relatie_id: offerte.relatie_id,
        offerte_id: offerteId,
        order_id: orderId,
        factuur_type: 'aanbetaling',
        factuurnummer: nummer1,
        datum: new Date().toISOString().split('T')[0],
        vervaldatum: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
        status: 'concept',
        onderwerp: `Aanbetaling ${aanbetalingPercentage}% - ${offerte.onderwerp || offerte.offertenummer}`,
        subtotaal: aanbetalingSubtotaal,
        btw_totaal: aanbetalingBtw,
        totaal: aanbetalingTotaal,
      })
      .select('id')
      .single()

    if (err1) return { error: err1.message }

    await supabase.from('factuur_regels').insert({
      factuur_id: factuur1.id,
      omschrijving: `Aanbetaling ${aanbetalingPercentage}% offerte ${offerte.offertenummer}`,
      aantal: 1,
      prijs: aanbetalingSubtotaal,
      btw_percentage: 21,
      totaal: aanbetalingSubtotaal,
      volgorde: 0,
    })

    const { data: factuur2, error: err2 } = await supabase
      .from('facturen')
      .insert({
        administratie_id: adminId,
        relatie_id: offerte.relatie_id,
        offerte_id: offerteId,
        order_id: orderId,
        factuur_type: 'restbetaling',
        gerelateerde_factuur_id: factuur1.id,
        factuurnummer: nummer2,
        datum: new Date().toISOString().split('T')[0],
        vervaldatum: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
        status: 'concept',
        onderwerp: `Restbetaling ${100 - aanbetalingPercentage}% - ${offerte.onderwerp || offerte.offertenummer}`,
        subtotaal: restSubtotaal,
        btw_totaal: restBtw,
        totaal: restTotaal,
      })
      .select('id')
      .single()

    if (err2) return { error: err2.message }

    // Link factuur1 terug naar factuur2
    await supabase.from('facturen').update({ gerelateerde_factuur_id: factuur2.id }).eq('id', factuur1.id)

    await supabase.from('factuur_regels').insert({
      factuur_id: factuur2.id,
      omschrijving: `Restbetaling ${100 - aanbetalingPercentage}% offerte ${offerte.offertenummer}`,
      aantal: 1,
      prijs: restSubtotaal,
      btw_percentage: 21,
      totaal: restSubtotaal,
      volgorde: 0,
    })
    await zorgVoorBetaallink(factuur1.id)
    await zorgVoorBetaallink(factuur2.id)

    revalidatePath('/facturatie')
    return { success: true, factuurIds: [factuur1.id, factuur2.id] }
  }
}

// === NOTITIES ===
export async function getContactpersonen(relatieId: string) {
  const supabase = await createClient()
  const { data } = await supabase
    .from('contactpersonen')
    .select('*')
    .eq('relatie_id', relatieId)
    .order('is_primair', { ascending: false })
    .order('naam')
  return data || []
}

export async function saveContactpersoon(data: {
  id?: string
  relatie_id: string
  naam: string
  functie?: string | null
  email?: string | null
  telefoon?: string | null
  mobiel?: string | null
  is_primair?: boolean
  opmerkingen?: string | null
}) {
  const supabase = await createClient()
  const adminId = await getAdministratieId()
  if (!adminId) return { error: 'Niet ingelogd' }

  const record = {
    administratie_id: adminId,
    relatie_id: data.relatie_id,
    naam: data.naam,
    functie: data.functie || null,
    email: data.email || null,
    telefoon: data.telefoon || null,
    mobiel: data.mobiel || null,
    is_primair: data.is_primair || false,
    opmerkingen: data.opmerkingen || null,
  }

  if (data.id) {
    const { error } = await supabase.from('contactpersonen').update(record).eq('id', data.id)
    if (error) return { error: error.message }
  } else {
    const { error } = await supabase.from('contactpersonen').insert(record)
    if (error) return { error: error.message }
  }

  revalidatePath(`/relatiebeheer/${data.relatie_id}`)
  return { success: true }
}

export async function deleteContactpersoon(id: string, relatieId: string) {
  const supabase = await createClient()
  const { error } = await supabase.from('contactpersonen').delete().eq('id', id)
  if (error) return { error: error.message }
  revalidatePath(`/relatiebeheer/${relatieId}`)
  return { success: true }
}

export async function getNotities(relatieId: string) {
  const supabase = await createClient()
  // 1. Directe klant-notities
  const { data: direct } = await supabase
    .from('notities')
    .select('*, gebruiker:profielen(naam)')
    .eq('relatie_id', relatieId)
    .order('created_at', { ascending: false })

  // 2. Taak-notities: notities op taken van deze klant
  const { data: taken } = await supabase.from('taken').select('id, titel, taaknummer').eq('relatie_id', relatieId)
  const taakIds = (taken || []).map(t => t.id)
  const taakMap = new Map((taken || []).map(t => [t.id, t]))
  let taakNotities: Record<string, unknown>[] = []
  if (taakIds.length > 0) {
    const { data: tn } = await supabase
      .from('taak_notities')
      .select('id, taak_id, tekst, created_at, gebruiker:profielen(naam)')
      .in('taak_id', taakIds)
      .order('created_at', { ascending: false })
    taakNotities = (tn || []).map(n => ({
      id: n.id,
      relatie_id: relatieId,
      tekst: n.tekst,
      herinnering_datum: null,
      herinnering_verstuurd: false,
      created_at: n.created_at,
      gebruiker: n.gebruiker,
      taak: taakMap.get(n.taak_id as string) || null,
    }))
  }

  // Samenvoegen en sorteren op datum
  const alles = [...(direct || []), ...taakNotities]
  alles.sort((a, b) => new Date((b as { created_at: string }).created_at).getTime() - new Date((a as { created_at: string }).created_at).getTime())
  return alles
}

export async function getEmailsByRelatie(relatieId: string) {
  const supabase = await createClient()
  const { data } = await supabase
    .from('emails')
    .select('id, onderwerp, van_naam, van_email, datum, richting')
    .eq('relatie_id', relatieId)
    .order('datum', { ascending: false })
    .limit(5)
  return data || []
}

export async function saveNotitie(data: {
  id?: string
  relatie_id: string
  tekst: string
  herinnering_datum?: string
}) {
  const supabase = await createClient()
  const adminId = await getAdministratieId()
  const { data: { user } } = await supabase.auth.getUser()
  if (!adminId || !user) return { error: 'Niet ingelogd' }

  if (data.id) {
    const { error } = await supabase
      .from('notities')
      .update({
        tekst: data.tekst,
        herinnering_datum: data.herinnering_datum || null,
      })
      .eq('id', data.id)
    if (error) return { error: error.message }
  } else {
    const defaultHerinnering = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString()
    const { error } = await supabase
      .from('notities')
      .insert({
        administratie_id: adminId,
        relatie_id: data.relatie_id,
        gebruiker_id: user.id,
        tekst: data.tekst,
        herinnering_datum: data.herinnering_datum || defaultHerinnering,
      })
    if (error) return { error: error.message }
  }

  revalidatePath(`/relatiebeheer/${data.relatie_id}`)
  return { success: true }
}

export async function deleteNotitie(id: string) {
  const supabase = await createClient()
  const { error } = await supabase.from('notities').delete().eq('id', id)
  if (error) return { error: error.message }
  return { success: true }
}

// === PROJECT-NOTITIES (verkoopkans-notities) ===
export async function getProjectNotities(projectId: string) {
  const supabase = await createClient()
  const { data } = await supabase
    .from('notities')
    .select('id, tekst, created_at, gebruiker:profielen(naam)')
    .eq('project_id', projectId)
    .order('created_at', { ascending: false })
  return data || []
}

export async function saveProjectNotitie(data: { id?: string; project_id: string; tekst: string }) {
  const supabase = await createClient()
  const adminId = await getAdministratieId()
  const { data: { user } } = await supabase.auth.getUser()
  if (!adminId || !user) return { error: 'Niet ingelogd' }

  if (data.id) {
    const { error } = await supabase
      .from('notities')
      .update({ tekst: data.tekst })
      .eq('id', data.id)
    if (error) return { error: error.message }
  } else {
    // Zoek de relatie_id van het project (notities.relatie_id is NOT NULL)
    const { data: proj } = await supabase
      .from('projecten')
      .select('relatie_id')
      .eq('id', data.project_id)
      .single()
    if (!proj?.relatie_id) return { error: 'Project niet gevonden' }

    const { error } = await supabase
      .from('notities')
      .insert({
        administratie_id: adminId,
        relatie_id: proj.relatie_id,
        project_id: data.project_id,
        gebruiker_id: user.id,
        tekst: data.tekst,
      })
    if (error) return { error: error.message }
  }

  revalidatePath(`/relatiebeheer`)
  revalidatePath(`/projecten/${data.project_id}`)
  return { success: true }
}

// === GLOBAL SEARCH ===
export async function globalSearch(query: string) {
  if (!query || query.trim().length < 2) return { relaties: [], offertes: [], projecten: [] }

  const supabase = await createClient()
  const trimmed = query.trim()
  const searchTerm = `%${trimmed}%`
  const digitsOnly = trimmed.replace(/\D/g, '')
  const digitsTerm = digitsOnly.length >= 3 ? `%${digitsOnly}%` : null

  const relatieFilters = [
    `bedrijfsnaam.ilike.${searchTerm}`,
    `contactpersoon.ilike.${searchTerm}`,
    `email.ilike.${searchTerm}`,
    `telefoon.ilike.${searchTerm}`,
  ]
  if (digitsTerm) relatieFilters.push(`telefoon.ilike.${digitsTerm}`)

  const [relatiesRes, offertesRes, projectenRes] = await Promise.all([
    supabase
      .from('relaties')
      .select('id, bedrijfsnaam, contactpersoon, plaats, email, telefoon')
      .or(relatieFilters.join(','))
      .limit(5),
    supabase
      .from('offertes')
      .select('id, offertenummer, onderwerp, status, relatie:relaties(bedrijfsnaam)')
      .or(`offertenummer.ilike.${searchTerm},onderwerp.ilike.${searchTerm}`)
      .limit(5),
    supabase
      .from('projecten')
      .select('id, naam, status, relatie:relaties(bedrijfsnaam)')
      .ilike('naam', searchTerm)
      .limit(5),
  ])

  return {
    relaties: relatiesRes.data || [],
    offertes: offertesRes.data || [],
    projecten: projectenRes.data || [],
  }
}

// === PROJECT-OFFERTE INTEGRATIE ===
export async function getProjectenByRelatie(relatieId: string) {
  const supabase = await createClient()
  const { data } = await supabase
    .from('projecten')
    .select('id, naam, status, omschrijving')
    .eq('relatie_id', relatieId)
    .order('created_at', { ascending: false })
  return data || []
}

export async function getLastOfferteForProject(projectId: string) {
  const supabase = await createClient()
  const { data } = await supabase
    .from('offertes')
    .select('*, regels:offerte_regels(*)')
    .eq('project_id', projectId)
    .order('versie_nummer', { ascending: false })
    .limit(1)
    .maybeSingle()
  return data
}

export async function createProjectInline(data: {
  naam: string
  relatie_id: string
  omschrijving?: string
}) {
  const supabase = await createClient()
  const adminId = await getAdministratieId()
  if (!adminId) return { error: 'Niet ingelogd' }

  const { data: project, error } = await supabase
    .from('projecten')
    .insert({
      administratie_id: adminId,
      naam: data.naam,
      relatie_id: data.relatie_id,
      omschrijving: data.omschrijving || null,
      status: 'actief',
    })
    .select('id, naam')
    .single()

  if (error) return { error: error.message }
  revalidatePath('/projecten')
  return { success: true, id: project.id, naam: project.naam }
}

export async function getOffertesByProject(projectId: string) {
  const supabase = await createClient()
  const { data } = await supabase
    .from('offertes')
    .select('id, offertenummer, versie_nummer, datum, status, totaal, relatie:relaties(bedrijfsnaam)')
    .eq('project_id', projectId)
    .order('versie_nummer', { ascending: false })
  return data || []
}

// === PROJECT TIMELINE (Verkoopkans view) ===

export interface PipelineStage {
  key: string
  label: string
  bereikt: boolean
  actief: boolean
}

export interface TimelineItem {
  id: string
  type: 'offerte_aangemaakt' | 'offerte_verzonden' | 'offerte_geaccepteerd' | 'offerte_afgewezen' | 'order_aangemaakt' | 'factuur_aangemaakt' | 'factuur_verzonden' | 'factuur_betaald' | 'email_verstuurd' | 'bericht' | 'taak' | 'afspraak' | 'project_aangemaakt'
  datum: string
  titel: string
  ondertitel?: string
  bedrag?: number
  status?: string
  link?: string
  meta?: Record<string, unknown>
}

export interface ProjectTimeline {
  project: Record<string, unknown> & {
    relatie?: { id: string; bedrijfsnaam: string; email?: string } | null
    geoffreerd: number
    gefactureerd: number
    betaald: number
    openstaand: number
  }
  pipeline: PipelineStage[]
  items: TimelineItem[]
  laatsteOfferteId: string | null
}

export async function getProjectTimeline(projectId: string): Promise<ProjectTimeline | null> {
  const supabase = await createClient()

  const [projectRes, offertesRes, takenRes, afsprakenRes] = await Promise.all([
    supabase
      .from('projecten')
      .select('*, relatie:relaties(id, bedrijfsnaam, email)')
      .eq('id', projectId)
      .single(),
    supabase
      .from('offertes')
      .select('id, offertenummer, versie_nummer, datum, status, subtotaal, totaal, onderwerp, created_at, facturen:facturen(id, factuurnummer, datum, status, subtotaal, totaal, betaald_bedrag, factuur_type, created_at), email_log:email_log(id, aan, onderwerp, verstuurd_op), berichten:berichten(id, tekst, afzender_type, afzender_naam, created_at)')
      .eq('project_id', projectId)
      // Eerst op datum (laatst verstuurde offerte bovenaan), dan versie_nummer
      // als tie-breaker. Zo krijgt de sidebar "Geoffreerd" altijd de meest
      // recente offerte, ook als er meerdere offerte-groepen in dit project zijn.
      .order('datum', { ascending: false })
      .order('versie_nummer', { ascending: false }),
    supabase
      .from('taken')
      .select('id, titel, status, prioriteit, deadline, created_at')
      .eq('project_id', projectId)
      .order('created_at', { ascending: false }),
    supabase
      .from('afspraken')
      .select('id, titel, start_datum, locatie, created_at')
      .eq('project_id', projectId)
      .order('start_datum', { ascending: false }),
  ])

  const project = projectRes.data
  if (!project) return null

  const offertes = offertesRes.data || []
  const taken = takenRes.data || []
  const afspraken = afsprakenRes.data || []

  // Financiële samenvatting — bedragen excl BTW (subtotaal).
  // geoffreerd = alleen de laatste offerte (hoogste versie). Betaald/openstaand
  // werken nog met totaal incl BTW omdat betaal_bedrag incl BTW is.
  const allFacturen = offertes.flatMap((o: Record<string, unknown>) => (o.facturen as Record<string, unknown>[]) || [])
  const laatsteOfferte = offertes[0] as Record<string, unknown> | undefined // al gesorteerd op versie_nummer desc
  const geoffreerd = (laatsteOfferte?.subtotaal as number) || 0
  const gefactureerd = allFacturen.reduce((sum: number, f: Record<string, unknown>) => sum + ((f.subtotaal as number) || 0), 0)
  const betaald = allFacturen.reduce((sum: number, f: Record<string, unknown>) => sum + ((f.betaald_bedrag as number) || 0), 0)
  const openstaand = allFacturen.reduce((sum: number, f: Record<string, unknown>) => sum + ((f.totaal as number) || 0) - ((f.betaald_bedrag as number) || 0), 0)

  // Pipeline stages afleiden
  const heeftOffertes = offertes.length > 0
  const heeftGeaccepteerd = offertes.some((o: Record<string, unknown>) => o.status === 'geaccepteerd')
  const heeftAanbetaling = allFacturen.some((f: Record<string, unknown>) => (f.factuur_type === 'aanbetaling' || f.factuur_type === 'volledig') && f.status !== 'concept')
  const heeftRestbetaling = allFacturen.some((f: Record<string, unknown>) => f.factuur_type === 'restbetaling' && f.status !== 'concept')
  const isAfgerond = project.status === 'afgerond'

  const stages: PipelineStage[] = [
    { key: 'contact', label: 'Contact', bereikt: true, actief: false },
    { key: 'offerte', label: 'Offerte', bereikt: heeftOffertes, actief: false },
    { key: 'offerte_akkoord', label: 'Offerte akkoord', bereikt: heeftGeaccepteerd, actief: false },
    { key: 'eerste_factuur', label: '1e Factuur', bereikt: heeftAanbetaling, actief: false },
    { key: 'tweede_factuur', label: '2e Factuur', bereikt: heeftRestbetaling, actief: false },
    { key: 'afgerond', label: 'Afgerond', bereikt: isAfgerond, actief: false },
  ]
  // Actieve stage = laatste bereikte
  const laatsteBereikte = stages.reduce((idx, s, i) => (s.bereikt ? i : idx), 0)
  stages[laatsteBereikte].actief = true

  // Timeline items opbouwen
  const items: TimelineItem[] = []

  // Project aangemaakt
  items.push({
    id: `project-${project.id}`,
    type: 'project_aangemaakt',
    datum: project.created_at,
    titel: 'Project aangemaakt',
    ondertitel: project.naam as string,
  })

  for (const o of offertes as Record<string, unknown>[]) {
    // Offerte aangemaakt
    items.push({
      id: `offerte-${o.id}`,
      type: o.status === 'geaccepteerd' ? 'offerte_geaccepteerd' : o.status === 'afgewezen' ? 'offerte_afgewezen' : o.status === 'verzonden' ? 'offerte_verzonden' : 'offerte_aangemaakt',
      datum: o.created_at as string,
      titel: `${o.offertenummer} v${(o.versie_nummer as number) || 1}`,
      ondertitel: (o.onderwerp as string) || undefined,
      bedrag: (o.subtotaal as number) ?? (o.totaal as number),
      status: o.status as string,
      link: `/offertes/${o.id}`,
    })

    // Facturen per offerte
    for (const f of (o.facturen as Record<string, unknown>[]) || []) {
      const fStatus = f.status as string
      const fType = fStatus === 'betaald' ? 'factuur_betaald' : fStatus === 'verzonden' || fStatus === 'vervallen' || fStatus === 'deels_betaald' ? 'factuur_verzonden' : 'factuur_aangemaakt'
      items.push({
        id: `factuur-${f.id}`,
        type: fType,
        datum: f.created_at as string,
        titel: `Factuur ${f.factuurnummer}`,
        ondertitel: f.factuur_type === 'aanbetaling' ? 'Aanbetaling' : f.factuur_type === 'restbetaling' ? 'Restbetaling' : undefined,
        bedrag: (f.subtotaal as number) ?? (f.totaal as number),
        status: fStatus,
        link: `/facturatie`,
      })
    }

    // Emails per offerte
    for (const e of (o.email_log as Record<string, unknown>[]) || []) {
      items.push({
        id: `email-${e.id}`,
        type: 'email_verstuurd',
        datum: e.verstuurd_op as string,
        titel: (e.onderwerp as string) || 'E-mail verstuurd',
        ondertitel: `Aan: ${e.aan}`,
        meta: { emailLogId: e.id as string },
      })
    }

    // Berichten per offerte
    for (const b of (o.berichten as Record<string, unknown>[]) || []) {
      items.push({
        id: `bericht-${b.id}`,
        type: 'bericht',
        datum: b.created_at as string,
        titel: `Bericht van ${(b.afzender_naam as string) || (b.afzender_type as string)}`,
        ondertitel: ((b.tekst as string) || '').substring(0, 100),
      })
    }
  }

  // Taken
  for (const t of taken) {
    items.push({
      id: `taak-${t.id}`,
      type: 'taak',
      datum: t.created_at,
      titel: t.titel,
      status: t.status,
      link: `/taken/${t.id}`,
    })
  }

  // Afspraken
  for (const a of afspraken) {
    items.push({
      id: `afspraak-${a.id}`,
      type: 'afspraak',
      datum: a.start_datum,
      titel: a.titel,
      ondertitel: a.locatie || undefined,
      link: `/agenda`,
    })
  }

  // Sorteer op datum, nieuwste eerst
  items.sort((a, b) => new Date(b.datum).getTime() - new Date(a.datum).getTime())

  return {
    project: { ...project, geoffreerd, gefactureerd, betaald, openstaand },
    pipeline: stages,
    items,
    laatsteOfferteId: (laatsteOfferte?.id as string) || null,
  }
}

// === KLANTENPORTAAL ===
export async function createKlantToegang(data: {
  relatie_id: string
  email: string
  naam: string
  wachtwoord: string
}) {
  const supabase = await createClient()
  const adminId = await getAdministratieId()
  if (!adminId) return { error: 'Niet ingelogd' }

  const { data: relatie } = await supabase
    .from('relaties')
    .select('id')
    .eq('id', data.relatie_id)
    .eq('administratie_id', adminId)
    .single()
  if (!relatie) return { error: 'Relatie niet gevonden' }

  const supabaseAdmin = createAdminClient()

  const { data: userData, error: authError } = await supabaseAdmin.auth.admin.createUser({
    email: data.email,
    password: data.wachtwoord,
    email_confirm: true,
    user_metadata: { naam: data.naam },
  })
  if (authError) return { error: authError.message }
  if (!userData.user) return { error: 'Account aanmaken mislukt' }

  await supabaseAdmin
    .from('profielen')
    .update({ administratie_id: adminId, rol: 'klant', naam: data.naam })
    .eq('id', userData.user.id)

  await supabaseAdmin
    .from('klant_relaties')
    .insert({ profiel_id: userData.user.id, relatie_id: data.relatie_id })

  // Stuur welkomstmail met inloggegevens
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'

  const welkomBody = `Beste ${data.naam},

Er is een klantenportaal account voor u aangemaakt bij Rebu Kozijnen. Via het portaal kunt u uw offertes, orders en berichten bekijken.

Uw inloggegevens:
- E-mail: ${data.email}
- Wachtwoord: ${data.wachtwoord}

Wij raden u aan uw wachtwoord na de eerste login te wijzigen via de instellingen in het portaal.`

  try {
    await sendEmail({
      to: data.email,
      subject: 'Uw klantenportaal account — Rebu Kozijnen',
      html: buildRebuEmailHtml(welkomBody, `${baseUrl}/login`, 'Inloggen op het portaal'),
    })
  } catch (err) {
    console.error('Welkomstmail versturen mislukt:', err)
  }

  revalidatePath(`/relatiebeheer/${data.relatie_id}`)
  return { success: true }
}

export async function getKlantAccounts(relatieId: string) {
  const supabaseAdmin = createAdminClient()
  const { data } = await supabaseAdmin
    .from('klant_relaties')
    .select('id, profiel:profielen(id, naam, email), created_at')
    .eq('relatie_id', relatieId)
    .order('created_at', { ascending: false })
  return data || []
}

export async function deleteKlantToegang(klantRelatieId: string) {
  const supabaseAdmin = createAdminClient()
  const { data: link } = await supabaseAdmin
    .from('klant_relaties')
    .select('profiel_id')
    .eq('id', klantRelatieId)
    .single()
  if (!link) return { error: 'Niet gevonden' }

  const { error } = await supabaseAdmin.auth.admin.deleteUser(link.profiel_id)
  if (error) return { error: error.message }
  return { success: true }
}

// === ADMIN CHAT ===
export async function getOfferteBerichten(offerteId: string) {
  const supabaseAdmin = createAdminClient()
  const { data } = await supabaseAdmin
    .from('berichten')
    .select('*, afzender:profielen(naam)')
    .eq('offerte_id', offerteId)
    .order('created_at', { ascending: true })
  return data || []
}

export async function sendBerichtAdmin(offerteId: string, tekst: string) {
  const supabase = await createClient()
  const adminId = await getAdministratieId()
  const { data: { user } } = await supabase.auth.getUser()
  if (!adminId || !user) return { error: 'Niet ingelogd' }

  const supabaseAdmin = createAdminClient()
  const { data: profiel } = await supabaseAdmin
    .from('profielen')
    .select('naam')
    .eq('id', user.id)
    .single()

  const { error } = await supabaseAdmin.from('berichten').insert({
    administratie_id: adminId,
    offerte_id: offerteId,
    afzender_id: user.id,
    afzender_type: 'medewerker',
    afzender_naam: profiel?.naam || user.email || 'Medewerker',
    tekst,
  })
  if (error) return { error: error.message }

  await supabaseAdmin
    .from('berichten')
    .update({ gelezen: true })
    .eq('offerte_id', offerteId)
    .eq('afzender_type', 'klant')
    .eq('gelezen', false)

  revalidatePath(`/offertes/${offerteId}`)
  return { success: true }
}

// === LEVERANCIER PDF ===

// Import shared parser (defined in separate file to avoid 'use server' constraint)
import { parseLeverancierPdfText } from './pdf-parser'
export async function processLeverancierPdf(offerteId: string, formData: FormData) {
  const adminId = await getAdministratieId()
  if (!adminId) return { error: 'Niet ingelogd' }

  const file = formData.get('pdf') as File
  if (!file) return { error: 'Geen PDF bestand' }

  const buffer = Buffer.from(await file.arrayBuffer())

  const { parsePdfBuffer: pdfParse } = await import('@/lib/pdf-extract')
  let parsed
  try {
    parsed = await pdfParse(buffer)
  } catch (e) {
    console.error('PDF parse error:', e)
    return { error: 'Kan PDF niet lezen: ' + (e instanceof Error ? e.message : String(e)) }
  }

  const { totaal, elementen } = parseLeverancierPdfText(parsed.text)

  // Store original PDF in Supabase Storage
  const supabaseAdmin = createAdminClient()
  const timestamp = Date.now()
  const pdfPath = `leverancier-pdfs/${offerteId}/${timestamp}_${file.name}`

  const { error: uploadError } = await supabaseAdmin.storage
    .from('documenten')
    .upload(pdfPath, buffer, { contentType: 'application/pdf' })

  if (uploadError) {
    return { error: `Upload fout: ${uploadError.message}` }
  }

  // Delete old leverancier records for this offerte
  const { data: existing } = await supabaseAdmin
    .from('documenten')
    .select('id, storage_path')
    .eq('entiteit_type', 'offerte_leverancier')
    .eq('entiteit_id', offerteId)

  if (existing && existing.length > 0) {
    // Delete old files from storage
    for (const doc of existing) {
      await supabaseAdmin.storage.from('documenten').remove([doc.storage_path])
    }
    // Delete old tekening images
    const { data: oldFiles } = await supabaseAdmin.storage
      .from('documenten')
      .list(`leverancier-pdfs/${offerteId}`)
    if (oldFiles) {
      const oldPaths = oldFiles.map(f => `leverancier-pdfs/${offerteId}/${f.name}`)
      if (oldPaths.length > 0) {
        await supabaseAdmin.storage.from('documenten').remove(oldPaths)
      }
    }
    // Delete old records
    await supabaseAdmin
      .from('documenten')
      .delete()
      .eq('entiteit_type', 'offerte_leverancier')
      .eq('entiteit_id', offerteId)
  }

  // Re-upload PDF (may have been deleted above)
  await supabaseAdmin.storage
    .from('documenten')
    .upload(pdfPath, buffer, { contentType: 'application/pdf', upsert: true })

  // Save metadata to documenten table
  const { error: insertError } = await supabaseAdmin
    .from('documenten')
    .insert({
      administratie_id: adminId,
      naam: `Leverancier PDF - ${file.name}`,
      bestandsnaam: file.name,
      bestandstype: 'application/pdf',
      bestandsgrootte: file.size,
      storage_path: pdfPath,
      entiteit_type: 'offerte_leverancier',
      entiteit_id: offerteId,
    })

  if (insertError) {
    return { error: `Database fout: ${insertError.message}` }
  }

  // Save parsed element data (prices) immediately so the PDF route always has them
  const parsedPrijzen: Record<string, { prijs: number; hoeveelheid: number }> = {}
  for (const e of elementen) {
    parsedPrijzen[e.naam] = { prijs: e.prijs, hoeveelheid: e.hoeveelheid }
  }
  await supabaseAdmin
    .from('documenten')
    .delete()
    .eq('entiteit_type', 'offerte_leverancier_parsed')
    .eq('entiteit_id', offerteId)
  await supabaseAdmin
    .from('documenten')
    .insert({
      administratie_id: adminId,
      naam: 'Leverancier parsed data',
      bestandsnaam: 'parsed.json',
      bestandstype: 'application/json',
      bestandsgrootte: 0,
      storage_path: JSON.stringify({ totaal, prijzen: parsedPrijzen }),
      entiteit_type: 'offerte_leverancier_parsed',
      entiteit_id: offerteId,
    })

  return {
    totaal,
    elementen: elementen.map(e => ({
      naam: e.naam,
      hoeveelheid: e.hoeveelheid,
      systeem: e.systeem,
      kleur: e.kleur,
      afmetingen: e.afmetingen,
      type: e.type,
      prijs: e.prijs,
      glasType: e.glasType,
      beslag: e.beslag,
      uwWaarde: e.uwWaarde,
      drapirichting: e.drapirichting,
      dorpel: e.dorpel,
      sluiting: e.sluiting,
      scharnieren: e.scharnieren,
      gewicht: e.gewicht,
      paneel: e.paneel,
      commentaar: e.commentaar,
    })),
    aantalElementen: elementen.length,
    pdfPath,
  }
}

export async function uploadLeverancierTekening(offerteId: string, pageNum: number, formData: FormData) {
  const supabaseAdmin = createAdminClient()
  const file = formData.get('image') as File
  if (!file) return { error: 'Geen afbeelding' }

  const buffer = Buffer.from(await file.arrayBuffer())
  // Leg extensie en content-type uit het blob zelf — tekeningen zijn nu JPEG (kleiner
  // dan PNG zodat ze onder de server-action body limit blijven).
  const isJpeg = (file.type || '').includes('jpeg') || (file.type || '').includes('jpg')
  const ext = isJpeg ? 'jpg' : 'png'
  const contentType = isJpeg ? 'image/jpeg' : 'image/png'
  const path = `leverancier-pdfs/${offerteId}/tekening-${pageNum}.${ext}`

  const { error: uploadError } = await supabaseAdmin.storage
    .from('documenten')
    .upload(path, buffer, { contentType, upsert: true })

  if (uploadError) return { error: uploadError.message }
  return { path }
}

export async function saveLeverancierTekeningen(offerteId: string, elementen: { naam: string; tekeningPath: string; pageIndex?: number; totalPages?: number }[], margePercentage?: number, elementMarges?: Record<string, number>, elementPrijzen?: Record<string, { prijs: number; hoeveelheid: number }>) {
  const adminId = await getAdministratieId()
  if (!adminId) return { error: 'Niet ingelogd' }

  const supabaseAdmin = createAdminClient()

  // Get existing document record
  const { data: doc } = await supabaseAdmin
    .from('documenten')
    .select('id, storage_path')
    .eq('entiteit_type', 'offerte_leverancier')
    .eq('entiteit_id', offerteId)
    .maybeSingle()

  if (!doc) return { error: 'Geen leverancier PDF gevonden' }

  // Store tekening data + optional marge + element prices as JSON
  const metadata: { tekeningen: typeof elementen; margePercentage?: number; marges?: Record<string, number>; prijzen?: Record<string, { prijs: number; hoeveelheid: number }> } = { tekeningen: elementen }
  if (margePercentage && margePercentage > 0) {
    metadata.margePercentage = margePercentage
  }
  if (elementMarges && Object.keys(elementMarges).length > 0) {
    metadata.marges = elementMarges
  }
  if (elementPrijzen && Object.keys(elementPrijzen).length > 0) {
    metadata.prijzen = elementPrijzen
  }

  await supabaseAdmin
    .from('documenten')
    .delete()
    .eq('entiteit_type', 'offerte_leverancier_data')
    .eq('entiteit_id', offerteId)

  await supabaseAdmin
    .from('documenten')
    .insert({
      administratie_id: adminId,
      naam: 'Leverancier tekeningen metadata',
      bestandsnaam: 'metadata.json',
      bestandstype: 'application/json',
      bestandsgrootte: 0,
      storage_path: JSON.stringify(metadata),
      entiteit_type: 'offerte_leverancier_data',
      entiteit_id: offerteId,
    })

  return { success: true }
}

export async function getLeverancierPdfData(offerteId: string) {
  const supabaseAdmin = createAdminClient()

  // Get PDF record
  const { data: pdfDoc } = await supabaseAdmin
    .from('documenten')
    .select('*')
    .eq('entiteit_type', 'offerte_leverancier')
    .eq('entiteit_id', offerteId)
    .maybeSingle()

  if (!pdfDoc) return null

  // Get tekeningen metadata
  const { data: metaDoc } = await supabaseAdmin
    .from('documenten')
    .select('*')
    .eq('entiteit_type', 'offerte_leverancier_data')
    .eq('entiteit_id', offerteId)
    .maybeSingle()

  let elementen: { naam: string; tekeningPath: string }[] = []
  let margePercentage = 0
  if (metaDoc) {
    try {
      const parsed = JSON.parse(metaDoc.storage_path)
      // Support both old format (array) and new format (object with tekeningen + margePercentage)
      if (Array.isArray(parsed)) {
        elementen = parsed
      } else {
        elementen = parsed.tekeningen || []
        margePercentage = parsed.margePercentage || 0
      }
    } catch {
      // ignore parse errors
    }
  }

  // Parse PDF to get element details (prijs, hoeveelheid, etc.)
  let leverancierTotaal = 0
  let parsedElementen: { naam: string; hoeveelheid: number; prijs: number }[] = []
  try {
    const { parsePdfBuffer: pdfParse } = await import('@/lib/pdf-extract')
    const { data: pdfFile } = await supabaseAdmin.storage
      .from('documenten')
      .download(pdfDoc.storage_path)

    if (pdfFile) {
      const pdfBuffer = Buffer.from(await pdfFile.arrayBuffer())
      const parsed = await pdfParse(pdfBuffer)
      const { totaal: pdfTotaal, elementen: pdfElementen } = parseLeverancierPdfText(parsed.text)
      leverancierTotaal = pdfTotaal
      parsedElementen = pdfElementen.map(e => ({
        naam: e.naam,
        hoeveelheid: e.hoeveelheid,
        prijs: e.prijs,
      }))
      console.error(`[getLeverancierPdfData] Parsed: totaal=${pdfTotaal}, elementen=${pdfElementen.length}, textLen=${parsed.text.length}`)
    } else {
      console.error(`[getLeverancierPdfData] pdfFile is null for path: ${pdfDoc.storage_path}`)
    }
  } catch (err) {
    console.error('[getLeverancierPdfData] Error parsing leverancier PDF:', err)
  }

  // Fallback: if re-parsing failed, try loading from saved parsed data
  if (parsedElementen.length === 0) {
    try {
      const { data: parsedDoc } = await supabaseAdmin
        .from('documenten')
        .select('*')
        .eq('entiteit_type', 'offerte_leverancier_parsed')
        .eq('entiteit_id', offerteId)
        .maybeSingle()
      if (parsedDoc) {
        const parsedData = JSON.parse(parsedDoc.storage_path)
        if (parsedData.prijzen) {
          parsedElementen = Object.entries(parsedData.prijzen).map(([naam, data]) => ({
            naam,
            hoeveelheid: (data as { hoeveelheid: number }).hoeveelheid || 1,
            prijs: (data as { prijs: number }).prijs || 0,
          }))
          if (!leverancierTotaal && parsedData.totaal) leverancierTotaal = parsedData.totaal
          console.error(`[getLeverancierPdfData] Fallback: loaded ${parsedElementen.length} elements from saved parsed data`)
        }
      }
    } catch { /* ignore */ }
  }

  return {
    pdfPath: pdfDoc.storage_path,
    bestandsnaam: pdfDoc.bestandsnaam,
    elementen,
    margePercentage,
    parsedElementen,
    leverancierTotaal,
  }
}

export async function updateMargePercentage(offerteId: string, margePercentage: number) {
  const adminId = await getAdministratieId()
  if (!adminId) return { error: 'Niet ingelogd' }

  const supabaseAdmin = createAdminClient()

  const { data: metaDoc } = await supabaseAdmin
    .from('documenten')
    .select('id, storage_path')
    .eq('entiteit_type', 'offerte_leverancier_data')
    .eq('entiteit_id', offerteId)
    .maybeSingle()

  if (!metaDoc) return { error: 'Geen leverancier data gevonden' }

  try {
    const parsed = JSON.parse(metaDoc.storage_path)
    const metadata = Array.isArray(parsed) ? { tekeningen: parsed } : parsed
    metadata.margePercentage = margePercentage > 0 ? margePercentage : undefined

    await supabaseAdmin
      .from('documenten')
      .update({ storage_path: JSON.stringify(metadata) })
      .eq('id', metaDoc.id)

    return { success: true }
  } catch {
    return { error: 'Fout bij opslaan marge' }
  }
}

export async function parseLeverancierPdfOnly(formData: FormData) {
  try {
    const adminId = await getAdministratieId()
    if (!adminId) return { error: 'Niet ingelogd' }

    const file = formData.get('pdf') as File
    if (!file) return { error: 'Geen PDF bestand' }

    const buffer = Buffer.from(await file.arrayBuffer())
    const { parsePdfBuffer: pdfParse } = await import('@/lib/pdf-extract')

    let parsed
    try {
      parsed = await pdfParse(buffer)
    } catch (e) {
      console.error('PDF parse error:', e)
      return { error: 'Kan PDF niet lezen: ' + (e instanceof Error ? e.message : String(e)) }
    }

    const { totaal, elementen } = parseLeverancierPdfText(parsed.text)

    return {
      totaal,
      elementen: elementen.map(e => ({
        naam: e.naam,
        hoeveelheid: e.hoeveelheid,
        systeem: e.systeem,
        kleur: e.kleur,
        afmetingen: e.afmetingen,
        type: e.type,
        prijs: e.prijs,
        glasType: e.glasType,
        beslag: e.beslag,
        uwWaarde: e.uwWaarde,
        drapirichting: e.drapirichting,
        dorpel: e.dorpel,
        sluiting: e.sluiting,
        scharnieren: e.scharnieren,
        gewicht: e.gewicht,
        omtrek: e.omtrek,
        paneel: e.paneel,
        commentaar: e.commentaar,
        hoekverbinding: e.hoekverbinding,
        montageGaten: e.montageGaten,
        afwatering: e.afwatering,
        scharnierenKleur: e.scharnierenKleur,
        lakKleur: e.lakKleur,
        sluitcilinder: e.sluitcilinder,
        aantalSleutels: e.aantalSleutels,
        gelijksluitend: e.gelijksluitend,
        krukBinnen: e.krukBinnen,
        krukBuiten: e.krukBuiten,
      })),
      aantalElementen: elementen.length,
    }
  } catch (err) {
    console.error('parseLeverancierPdfOnly error:', err)
    return { error: `Server fout: ${err instanceof Error ? err.message : String(err)}` }
  }
}

export async function deleteLeverancierPdf(offerteId: string) {
  const adminId = await getAdministratieId()
  if (!adminId) return { error: 'Niet ingelogd' }

  const supabaseAdmin = createAdminClient()

  // Delete all files in storage for this offerte
  const { data: files } = await supabaseAdmin.storage
    .from('documenten')
    .list(`leverancier-pdfs/${offerteId}`)

  if (files && files.length > 0) {
    const paths = files.map(f => `leverancier-pdfs/${offerteId}/${f.name}`)
    await supabaseAdmin.storage.from('documenten').remove(paths)
  }

  // Delete document records
  await supabaseAdmin
    .from('documenten')
    .delete()
    .eq('entiteit_type', 'offerte_leverancier')
    .eq('entiteit_id', offerteId)

  await supabaseAdmin
    .from('documenten')
    .delete()
    .eq('entiteit_type', 'offerte_leverancier_data')
    .eq('entiteit_id', offerteId)

  return { success: true }
}

// === LEADS ===
export async function getLeads(filter?: string) {
  const supabase = await createClient()
  let query = supabase
    .from('leads')
    .select('*')
    .order('created_at', { ascending: false })

  if (filter && filter !== 'alle') {
    query = query.eq('status', filter)
  }

  const { data } = await query
  return data || []
}

export async function getLead(id: string) {
  const supabase = await createClient()
  const { data } = await supabase
    .from('leads')
    .select('*')
    .eq('id', id)
    .single()
  return data
}

export async function getLeadTaken(leadId: string) {
  const supabase = await createClient()
  const { data } = await supabase
    .from('taken')
    .select('*')
    .eq('lead_id', leadId)
    .order('created_at', { ascending: false })
  return data || []
}

// === AI email feedback (leert van handmatige aanpassingen) ===
export async function saveAiEmailFeedback(data: { context: 'leads_bulk' | 'email_reply'; template?: string; ai_origineel: string; user_verzonden: string }) {
  const supabase = await createClient()
  const adminId = await getAdministratieId()
  const { data: { user } } = await supabase.auth.getUser()
  if (!adminId || !user) return { error: 'Niet ingelogd' }

  // Alleen opslaan als er een daadwerkelijk verschil is
  if (data.ai_origineel.trim() === data.user_verzonden.trim()) return { success: true, skipped: true }

  const supabaseAdmin = createAdminClient()
  await supabaseAdmin.from('ai_email_feedback').insert({
    administratie_id: adminId,
    gebruiker_id: user.id,
    context: data.context,
    template: data.template || null,
    ai_origineel: data.ai_origineel,
    user_verzonden: data.user_verzonden,
  })
  return { success: true }
}

// === LEADS BULK-MAIL ===
export async function sendLeadsBulkEmail(leadIds: string[], onderwerp: string, bericht: string): Promise<{ success?: boolean; verstuurd?: number; mislukt?: number; error?: string }> {
  const adminId = await getAdministratieId()
  if (!adminId) return { error: 'Niet ingelogd' }
  if (leadIds.length === 0) return { error: 'Geen leads geselecteerd' }

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  const supabaseAdmin = createAdminClient()

  let medewerkerNaam = 'Rebu Kozijnen'
  if (user) {
    const { data: profiel } = await supabaseAdmin.from('profielen').select('naam').eq('id', user.id).single()
    if (profiel?.naam) medewerkerNaam = profiel.naam
  }

  const { data: leads } = await supabaseAdmin
    .from('leads')
    .select('id, bedrijfsnaam, contactpersoon, email')
    .eq('administratie_id', adminId)
    .in('id', leadIds)
    .not('email', 'is', null)
    .neq('email', '')

  if (!leads || leads.length === 0) return { error: 'Geen leads met e-mailadres gevonden' }

  const { sendEmail } = await import('@/lib/email')
  const { buildRebuEmailHtml } = await import('@/lib/email-template')

  let verstuurd = 0
  let mislukt = 0

  for (const lead of leads) {
    const naam = lead.contactpersoon || lead.bedrijfsnaam || ''
    const personalised = bericht
      .replace(/\{\{naam\}\}/g, naam)
      .replace(/\{\{bedrijfsnaam\}\}/g, lead.bedrijfsnaam || '')
      .replace(/\{\{medewerker\}\}/g, medewerkerNaam)
    const onderwerpPers = onderwerp
      .replace(/\{\{naam\}\}/g, naam)
      .replace(/\{\{bedrijfsnaam\}\}/g, lead.bedrijfsnaam || '')

    try {
      await sendEmail({
        to: lead.email as string,
        subject: onderwerpPers,
        html: buildRebuEmailHtml(personalised),
      })
      await supabaseAdmin.from('email_log').insert({
        administratie_id: adminId,
        aan: lead.email,
        onderwerp: onderwerpPers,
        body_html: buildRebuEmailHtml(personalised),
        verstuurd_door: user?.id || null,
      })
      verstuurd++
    } catch (err) {
      console.error('Lead bulk mail mislukt voor', lead.email, err)
      mislukt++
    }
  }

  revalidatePath('/leads')
  return { success: true, verstuurd, mislukt }
}

export async function bulkCreateLeadsFromKvk(kandidaten: Array<{
  kvkNummer: string
  naam: string
  adres: string
  postcode: string
  plaats: string
  email?: string
  telefoon?: string
}>) {
  const supabase = await createClient()
  const adminId = await getAdministratieId()
  if (!adminId) return { error: 'Niet ingelogd' }

  // Filter dubbele kvk-nummers die toch al bestaan (safety)
  const kvkNrs = kandidaten.map(k => k.kvkNummer).filter(Boolean)
  const bestaandKvk = new Set<string>()
  if (kvkNrs.length > 0) {
    const { data: r } = await supabase.from('relaties').select('kvk_nummer').eq('administratie_id', adminId).in('kvk_nummer', kvkNrs)
    for (const x of r || []) if (x.kvk_nummer) bestaandKvk.add(String(x.kvk_nummer))
    const { data: l } = await supabase.from('leads').select('bedrijfsnaam').eq('administratie_id', adminId)
    for (const x of l || []) if (x.bedrijfsnaam) bestaandKvk.add(x.bedrijfsnaam.toLowerCase())
  }

  // Verrijk met email/telefoon uit KVK basisprofiel voor elke kandidaat
  const gefilterd = kandidaten.filter(k => !bestaandKvk.has(k.kvkNummer) && !bestaandKvk.has((k.naam || '').toLowerCase()))
  const apiKey = process.env.KVK_API_KEY
  const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'

  const records: Record<string, unknown>[] = []
  for (const k of gefilterd) {
    let email = k.email || null
    let telefoon = k.telefoon || null
    if (apiKey && (!email || !telefoon)) {
      try {
        const r = await fetch(`${appUrl}/api/kvk/detail?kvkNummer=${encodeURIComponent(k.kvkNummer)}`)
        if (r.ok) {
          const detail = await r.json() as { email?: string; telefoon?: string }
          if (!email && detail.email) email = detail.email
          if (!telefoon && detail.telefoon) telefoon = detail.telefoon
        }
      } catch {}
    }
    records.push({
      administratie_id: adminId,
      bedrijfsnaam: k.naam,
      adres: k.adres || null,
      postcode: k.postcode || null,
      plaats: k.plaats || null,
      email,
      telefoon,
      bron: 'kvk',
    })
  }

  if (records.length === 0) return { success: true, ingevoegd: 0 }

  let ingevoegd = 0
  for (let i = 0; i < records.length; i += 100) {
    const batch = records.slice(i, i + 100)
    const { error } = await supabase.from('leads').insert(batch)
    if (error) return { error: error.message, ingevoegd }
    ingevoegd += batch.length
  }
  revalidatePath('/leads')
  revalidatePath('/relatiebeheer/leads')
  return { success: true, ingevoegd }
}

export async function createLead(formData: FormData) {
  const supabase = await createClient()
  const adminId = await getAdministratieId()
  if (!adminId) return { error: 'Niet ingelogd' }

  const record = {
    administratie_id: adminId,
    bedrijfsnaam: formData.get('bedrijfsnaam') as string,
    contactpersoon: formData.get('contactpersoon') as string || null,
    email: formData.get('email') as string || null,
    telefoon: formData.get('telefoon') as string || null,
    adres: formData.get('adres') as string || null,
    postcode: formData.get('postcode') as string || null,
    plaats: formData.get('plaats') as string || null,
    bron: 'handmatig',
    notities: formData.get('notities') as string || null,
  }

  const { data, error } = await supabase
    .from('leads')
    .insert(record)
    .select('id')
    .single()

  if (error) return { error: error.message }
  revalidatePath('/leads')
  return { success: true, id: data.id }
}

export async function updateLead(id: string, formData: FormData) {
  const supabase = await createClient()
  const record = {
    bedrijfsnaam: formData.get('bedrijfsnaam') as string,
    contactpersoon: formData.get('contactpersoon') as string || null,
    email: formData.get('email') as string || null,
    telefoon: formData.get('telefoon') as string || null,
    adres: formData.get('adres') as string || null,
    postcode: formData.get('postcode') as string || null,
    plaats: formData.get('plaats') as string || null,
    notities: formData.get('notities') as string || null,
    updated_at: new Date().toISOString(),
  }

  const { error } = await supabase.from('leads').update(record).eq('id', id)
  if (error) return { error: error.message }
  revalidatePath('/leads')
  revalidatePath(`/leads/${id}`)
  return { success: true }
}

export async function deleteLead(id: string) {
  const supabase = await createClient()
  const { error } = await supabase.from('leads').delete().eq('id', id)
  if (error) return { error: error.message }
  revalidatePath('/leads')
  return { success: true }
}

export async function updateLeadStatus(id: string, status: string) {
  const supabase = await createClient()
  const { error } = await supabase
    .from('leads')
    .update({ status, updated_at: new Date().toISOString() })
    .eq('id', id)
  if (error) return { error: error.message }
  revalidatePath('/leads')
  revalidatePath(`/leads/${id}`)
  return { success: true }
}

export async function setTerugbelMoment(id: string, datum: string, notitie: string) {
  const supabase = await createClient()
  const { error } = await supabase
    .from('leads')
    .update({
      terugbel_datum: datum || null,
      terugbel_notitie: notitie || null,
      updated_at: new Date().toISOString(),
    })
    .eq('id', id)
  if (error) return { error: error.message }
  revalidatePath('/leads')
  revalidatePath(`/leads/${id}`)
  return { success: true }
}

export async function convertLeadToRelatie(id: string) {
  const supabase = await createClient()
  const adminId = await getAdministratieId()
  if (!adminId) return { error: 'Niet ingelogd' }

  const lead = await getLead(id)
  if (!lead) return { error: 'Lead niet gevonden' }

  const { data: relatie, error: relatieError } = await supabase
    .from('relaties')
    .insert({
      administratie_id: adminId,
      bedrijfsnaam: lead.bedrijfsnaam,
      contactpersoon: lead.contactpersoon,
      email: lead.email,
      telefoon: lead.telefoon,
      adres: lead.adres,
      postcode: lead.postcode,
      plaats: lead.plaats,
      type: 'zakelijk',
    })
    .select('id')
    .single()

  if (relatieError) return { error: relatieError.message }

  await supabase
    .from('leads')
    .update({
      status: 'gewonnen',
      relatie_id: relatie.id,
      updated_at: new Date().toISOString(),
    })
    .eq('id', id)

  revalidatePath('/leads')
  revalidatePath('/relatiebeheer')
  return { success: true, relatie_id: relatie.id }
}

export async function importLeads(rows: {
  bedrijfsnaam: string
  contactpersoon?: string
  email?: string
  telefoon?: string
  adres?: string
  postcode?: string
  plaats?: string
  notities?: string
}[]) {
  const supabase = await createClient()
  const adminId = await getAdministratieId()
  if (!adminId) return { error: 'Niet ingelogd' }

  const { data: existing } = await supabase
    .from('leads')
    .select('bedrijfsnaam')
    .eq('administratie_id', adminId)

  const existingNames = new Set(
    (existing || []).map(r => r.bedrijfsnaam.toLowerCase().trim())
  )

  const toInsert: typeof rows = []
  const duplicates: string[] = []
  const invalid: string[] = []

  for (const row of rows) {
    const name = row.bedrijfsnaam?.trim()
    if (!name) {
      invalid.push(row.bedrijfsnaam || '(leeg)')
      continue
    }
    if (existingNames.has(name.toLowerCase())) {
      duplicates.push(name)
      continue
    }
    toInsert.push({ ...row, bedrijfsnaam: name })
    existingNames.add(name.toLowerCase())
  }

  let imported = 0
  const errors: string[] = []

  if (toInsert.length > 0) {
    const BATCH_SIZE = 100
    for (let i = 0; i < toInsert.length; i += BATCH_SIZE) {
      const batch = toInsert.slice(i, i + BATCH_SIZE).map(row => ({
        administratie_id: adminId,
        bedrijfsnaam: row.bedrijfsnaam,
        contactpersoon: row.contactpersoon || null,
        email: row.email || null,
        telefoon: row.telefoon || null,
        adres: row.adres || null,
        postcode: row.postcode || null,
        plaats: row.plaats || null,
        notities: row.notities || null,
        bron: 'import',
        status: 'nieuw',
      }))

      const { error } = await supabase.from('leads').insert(batch)
      if (error) {
        errors.push(error.message)
      } else {
        imported += batch.length
      }
    }
  }

  revalidatePath('/leads')
  return {
    success: true,
    imported,
    duplicates: duplicates.length,
    duplicateNames: duplicates.slice(0, 10),
    invalid: invalid.length,
    errors,
  }
}

export async function createLeadTaak(leadId: string, titel: string, deadline?: string, prioriteit?: string) {
  const supabase = await createClient()
  const adminId = await getAdministratieId()
  if (!adminId) return { error: 'Niet ingelogd' }

  // Toewijzen aan ingelogde medewerker
  const { data: { user } } = await supabase.auth.getUser()
  let leadMedewerkerId: string | null = null
  if (user?.id) {
    const { data: mw } = await supabase
      .from('medewerkers')
      .select('id')
      .eq('profiel_id', user.id)
      .eq('administratie_id', adminId)
      .maybeSingle()
    leadMedewerkerId = mw?.id || null
  }

  const { error } = await supabase.from('taken').insert({
    administratie_id: adminId,
    taaknummer: await getVolgendTaaknummer(supabase),
    titel,
    lead_id: leadId,
    deadline: deadline || null,
    prioriteit: prioriteit || 'normaal',
    status: 'open',
    medewerker_id: leadMedewerkerId,
    toegewezen_aan: user?.id || null,
  })

  if (error) return { error: error.message }
  revalidatePath(`/leads/${leadId}`)
  revalidatePath('/taken')
  return { success: true }
}

// === AFSPRAKEN ===
export async function getAfspraken() {
  const supabase = await createClient()
  const { data } = await supabase
    .from('afspraken')
    .select('*, relatie:relaties(bedrijfsnaam), lead:leads(bedrijfsnaam)')
    .order('start_datum', { ascending: true })
  return data || []
}

export async function saveAfspraak(formData: FormData) {
  const supabase = await createClient()
  const adminId = await getAdministratieId()
  if (!adminId) return { error: 'Niet ingelogd' }

  const id = formData.get('id') as string
  const record = {
    administratie_id: adminId,
    titel: formData.get('titel') as string,
    omschrijving: formData.get('omschrijving') as string || null,
    start_datum: formData.get('start_datum') as string,
    eind_datum: formData.get('eind_datum') as string || null,
    hele_dag: formData.get('hele_dag') === 'true',
    locatie: formData.get('locatie') as string || null,
    relatie_id: formData.get('relatie_id') as string || null,
    lead_id: formData.get('lead_id') as string || null,
    project_id: formData.get('project_id') as string || null,
  }

  if (id) {
    const { error } = await supabase.from('afspraken').update(record).eq('id', id)
    if (error) return { error: error.message }
  } else {
    const { error } = await supabase.from('afspraken').insert(record)
    if (error) return { error: error.message }
  }

  revalidatePath('/agenda')
  return { success: true }
}

export async function deleteAfspraak(id: string) {
  const supabase = await createClient()
  const { error } = await supabase.from('afspraken').delete().eq('id', id)
  if (error) return { error: error.message }
  revalidatePath('/agenda')
  return { success: true }
}

export type AgendaItemType = 'taak' | 'levering' | 'terugbellen' | 'afspraak'

export interface AgendaItem {
  id: string
  type: AgendaItemType
  titel: string
  datum: string
  meta?: string
  link?: string
}

export async function getAgendaItems(): Promise<AgendaItem[]> {
  const supabase = await createClient()

  const [takenRes, leveringenRes, leadsRes, afsprakenRes] = await Promise.all([
    supabase
      .from('taken')
      .select('id, titel, deadline, status, prioriteit, project:projecten(naam)')
      .not('deadline', 'is', null)
      .neq('status', 'afgerond'),
    supabase
      .from('orders')
      .select('id, ordernummer, leverdatum, status, onderwerp, relatie:relaties(bedrijfsnaam)')
      .not('leverdatum', 'is', null),
    supabase
      .from('leads')
      .select('id, bedrijfsnaam, terugbel_datum, terugbel_notitie')
      .not('terugbel_datum', 'is', null),
    supabase
      .from('afspraken')
      .select('id, titel, start_datum, locatie, hele_dag, relatie:relaties(bedrijfsnaam), lead:leads(bedrijfsnaam)'),
  ])

  const items: AgendaItem[] = []

  for (const t of takenRes.data || []) {
    items.push({
      id: t.id,
      type: 'taak',
      titel: t.titel,
      datum: t.deadline!,
      meta: (t.project as { naam: string } | null)?.naam || undefined,
      link: `/taken/${t.id}`,
    })
  }

  for (const o of leveringenRes.data || []) {
    const bedrijf = (o.relatie as { bedrijfsnaam: string } | null)?.bedrijfsnaam || '-'
    items.push({
      id: o.id,
      type: 'levering',
      titel: `${bedrijf} — ${o.ordernummer}`,
      datum: o.leverdatum!,
      meta: o.onderwerp || undefined,
      link: `/offertes/orders/${o.id}`,
    })
  }

  for (const l of leadsRes.data || []) {
    items.push({
      id: l.id,
      type: 'terugbellen',
      titel: l.bedrijfsnaam,
      datum: l.terugbel_datum!,
      meta: l.terugbel_notitie || undefined,
      link: `/leads/${l.id}`,
    })
  }

  for (const a of afsprakenRes.data || []) {
    const relNaam = (a.relatie as { bedrijfsnaam: string } | null)?.bedrijfsnaam
    const leadNaam = (a.lead as { bedrijfsnaam: string } | null)?.bedrijfsnaam
    items.push({
      id: a.id,
      type: 'afspraak',
      titel: a.titel,
      datum: a.start_datum,
      meta: a.locatie || relNaam || leadNaam || undefined,
    })
  }

  return items
}

// === MEDEWERKERS ===
export async function getMedewerkers() {
  const supabase = await createClient()
  const adminId = await getAdministratieId()
  let query = supabase.from('medewerkers').select('*')
  if (adminId) query = query.eq('administratie_id', adminId)
  const { data } = await query.order('naam')
  return data || []
}

export async function getMedewerker(id: string) {
  const supabase = await createClient()
  const { data } = await supabase
    .from('medewerkers')
    .select('*, profiel:profielen(naam, email, rol)')
    .eq('id', id)
    .single()
  return data
}

export async function saveMedewerker(formData: FormData) {
  const supabase = await createClient()
  const adminId = await getAdministratieId()
  if (!adminId) return { error: 'Niet ingelogd' }

  const id = formData.get('id') as string
  const specialisatiesRaw = formData.get('specialisaties') as string
  const specialisaties = specialisatiesRaw
    ? specialisatiesRaw.split(',').map(s => s.trim()).filter(Boolean)
    : null

  const record = {
    administratie_id: adminId,
    naam: formData.get('naam') as string,
    email: formData.get('email') as string || null,
    telefoon: formData.get('telefoon') as string || null,
    type: formData.get('type') as string,
    functie: formData.get('functie') as string || null,
    uurtarief: parseFloat(formData.get('uurtarief') as string) || null,
    kvk_nummer: formData.get('kvk_nummer') as string || null,
    btw_nummer: formData.get('btw_nummer') as string || null,
    specialisaties,
    kleur: formData.get('kleur') as string || '#3b82f6',
    actief: formData.get('actief') === 'true',
    startdatum: formData.get('startdatum') as string || null,
    opmerkingen: formData.get('opmerkingen') as string || null,
  }

  if (id) {
    const { error } = await supabase.from('medewerkers').update(record).eq('id', id)
    if (error) return { error: error.message }
  } else {
    const { error } = await supabase.from('medewerkers').insert(record)
    if (error) return { error: error.message }
  }

  revalidatePath('/medewerkers')
  return { success: true }
}

export async function deleteMedewerker(id: string) {
  const supabase = await createClient()
  const { error } = await supabase.from('medewerkers').delete().eq('id', id)
  if (error) return { error: error.message }
  revalidatePath('/medewerkers')
  return { success: true }
}

export async function getOrderFacturen(orderId: string) {
  const supabase = await createClient()
  const { data } = await supabase
    .from('facturen')
    .select('id, factuurnummer, datum, status, totaal, betaald_bedrag, factuur_type, onderwerp, gerelateerde_factuur_id')
    .eq('order_id', orderId)
    .order('factuur_type', { ascending: true })
  return data || []
}

export async function getOrderMedewerkers(orderId: string) {
  const supabase = await createClient()
  const { data } = await supabase
    .from('order_medewerkers')
    .select('*, medewerker:medewerkers(id, naam, type, functie, kleur)')
    .eq('order_id', orderId)
  return data || []
}

export async function saveOrderMedewerker(formData: FormData) {
  const supabase = await createClient()

  const id = formData.get('id') as string
  const record = {
    order_id: formData.get('order_id') as string,
    medewerker_id: formData.get('medewerker_id') as string,
    rol: formData.get('rol') as string || null,
    gepland_van: formData.get('gepland_van') as string || null,
    gepland_tot: formData.get('gepland_tot') as string || null,
    geschatte_uren: parseFloat(formData.get('geschatte_uren') as string) || null,
    notitie: formData.get('notitie') as string || null,
  }

  if (id) {
    const { error } = await supabase.from('order_medewerkers').update(record).eq('id', id)
    if (error) return { error: error.message }
  } else {
    const { error } = await supabase.from('order_medewerkers').insert(record)
    if (error) return { error: error.message }
  }

  revalidatePath('/offertes/orders')
  return { success: true }
}

export async function deleteOrderMedewerker(id: string) {
  const supabase = await createClient()
  const { error } = await supabase.from('order_medewerkers').delete().eq('id', id)
  if (error) return { error: error.message }
  revalidatePath('/offertes/orders')
  return { success: true }
}

export async function getMedewerkerOrders(medewerkerId: string) {
  const supabase = await createClient()
  const { data } = await supabase
    .from('order_medewerkers')
    .select('*, order:orders(id, ordernummer, onderwerp, status, datum, relatie:relaties(bedrijfsnaam))')
    .eq('medewerker_id', medewerkerId)
  return data || []
}

export async function createMedewerkerAccount(medewerkerId: string, formData: FormData) {
  const supabase = await createClient()
  const adminId = await getAdministratieId()
  if (!adminId) return { error: 'Niet ingelogd' }

  const email = formData.get('email') as string
  const wachtwoord = formData.get('wachtwoord') as string
  const naam = formData.get('naam') as string

  const supabaseAdmin = createAdminClient()

  const { data: userData, error: authError } = await supabaseAdmin.auth.admin.createUser({
    email,
    password: wachtwoord,
    email_confirm: true,
    user_metadata: { naam },
  })
  if (authError) return { error: authError.message }
  if (!userData.user) return { error: 'Account aanmaken mislukt' }

  await supabaseAdmin
    .from('profielen')
    .update({ administratie_id: adminId, rol: 'medewerker', naam })
    .eq('id', userData.user.id)

  await supabaseAdmin
    .from('medewerkers')
    .update({ profiel_id: userData.user.id })
    .eq('id', medewerkerId)

  // Optioneel: stuur welkomstmail met inloggegevens
  if (formData.get('stuur_email') === 'true') {
    const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'
    const welkomBody = `Beste ${naam},

Er is een medewerker-account voor u aangemaakt bij Rebu Kozijnen. Via het dashboard kunt u uw taken, planning en uren bekijken.

Uw inloggegevens:
- E-mail: ${email}
- Wachtwoord: ${wachtwoord}

Wij raden u aan uw wachtwoord na de eerste login te wijzigen.`

    try {
      await sendEmail({
        to: email,
        subject: 'Uw medewerker-account — Rebu Kozijnen',
        html: buildRebuEmailHtml(welkomBody, `${baseUrl}/login`, 'Inloggen op het dashboard'),
      })
    } catch (err) {
      console.error('Welkomstmail versturen mislukt:', err)
    }
  }

  revalidatePath('/medewerkers')
  return { success: true }
}

export async function getMedewerkerDashboardData() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null

  const supabaseAdmin = createAdminClient()

  // Find medewerker record linked to this profile
  const { data: medewerker } = await supabaseAdmin
    .from('medewerkers')
    .select('id')
    .eq('profiel_id', user.id)
    .single()
  if (!medewerker) return null

  const [ordersRes, takenRes, urenRes] = await Promise.all([
    supabaseAdmin
      .from('order_medewerkers')
      .select('*, order:orders(id, ordernummer, onderwerp, status, datum, leverdatum, relatie:relaties(bedrijfsnaam))')
      .eq('medewerker_id', medewerker.id),
    supabaseAdmin
      .from('taken')
      .select('*, project:projecten(naam)')
      .eq('medewerker_id', medewerker.id)
      .in('status', ['open', 'in_uitvoering']),
    supabaseAdmin
      .from('uren')
      .select('*')
      .eq('medewerker_id', medewerker.id)
      .gte('datum', new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]),
  ])

  return {
    medewerkerId: medewerker.id,
    orders: ordersRes.data || [],
    taken: takenRes.data || [],
    urenDezeWeek: urenRes.data || [],
  }
}

export async function getMedewerkerPlanning(startDatum: string, eindDatum: string) {
  const supabase = await createClient()
  const { data } = await supabase
    .from('order_medewerkers')
    .select('*, medewerker:medewerkers(id, naam, kleur, functie), order:orders(id, ordernummer, onderwerp, relatie:relaties(bedrijfsnaam))')
    .or(`gepland_van.lte.${eindDatum},gepland_tot.gte.${startDatum}`)
    .not('gepland_van', 'is', null)
  return data || []
}

export async function getMedewerkersMetBezetting() {
  const supabase = await createClient()
  const vandaag = new Date().toISOString().split('T')[0]
  const volgendeWeek = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]

  const [medewerkers, bezetting] = await Promise.all([
    supabase.from('medewerkers').select('id, naam, type, functie, kleur, actief').eq('actief', true).order('naam'),
    supabase.from('order_medewerkers')
      .select('medewerker_id, gepland_van, gepland_tot, order:orders(ordernummer, onderwerp)')
      .gte('gepland_tot', vandaag)
      .lte('gepland_van', volgendeWeek),
  ])

  return {
    medewerkers: medewerkers.data || [],
    bezetting: bezetting.data || [],
  }
}

// === TAAK NOTITIES ===
export async function getTaakNotities(taakId: string) {
  const supabase = await createClient()
  const { data } = await supabase
    .from('taak_notities')
    .select('*, gebruiker:profielen(naam)')
    .eq('taak_id', taakId)
    .order('created_at', { ascending: false })
  return data || []
}

export async function saveTaakNotitie(data: { id?: string; taak_id: string; tekst: string }) {
  const supabase = await createClient()
  const adminId = await getAdministratieId()
  const { data: { user } } = await supabase.auth.getUser()
  if (!adminId || !user) return { error: 'Niet ingelogd' }

  if (data.id) {
    // Update bestaande notitie
    const { error } = await supabase
      .from('taak_notities')
      .update({ tekst: data.tekst })
      .eq('id', data.id)
    if (error) return { error: error.message }
    revalidatePath(`/taken/${data.taak_id}`)
    return { success: true, id: data.id }
  }

  const { data: inserted, error } = await supabase
    .from('taak_notities')
    .insert({
      administratie_id: adminId,
      taak_id: data.taak_id,
      gebruiker_id: user.id,
      tekst: data.tekst,
    })
    .select('id')
    .single()
  if (error) return { error: error.message }

  const { data: profiel } = await supabase
    .from('profielen')
    .select('naam')
    .eq('id', user.id)
    .single()

  revalidatePath(`/taken/${data.taak_id}`)
  return { success: true, id: inserted?.id, gebruikerNaam: profiel?.naam || 'Jij' }
}

export async function deleteTaakNotitie(id: string) {
  const supabase = await createClient()
  const { error } = await supabase.from('taak_notities').delete().eq('id', id)
  if (error) return { error: error.message }
  return { success: true }
}

// --- Broadcast email ---

type BroadcastType = 'alle' | 'zakelijk' | 'particulier' | 'top_klanten'

async function getTopKlantenRelatieIds(adminId: string): Promise<string[]> {
  const supabaseAdmin = createAdminClient()
  // Haal facturen + offertes op om top klanten te bepalen (zelfde logica als dashboard)
  const facturenData = await fetchAllRows<{ relatie_id: string | null; totaal: number | null; status: string }>((from, to) =>
    supabaseAdmin.from('facturen').select('relatie_id, totaal, status').eq('administratie_id', adminId).range(from, to)
  )
  const offertesData = await fetchAllRows<{ relatie_id: string | null; totaal: number | null }>((from, to) =>
    supabaseAdmin.from('offertes').select('relatie_id, totaal').eq('administratie_id', adminId).in('status', ['verzonden', 'geaccepteerd']).range(from, to)
  )
  const relatieMap = new Map<string, number>()
  for (const f of facturenData) {
    if (!f.relatie_id) continue
    if (f.status === 'betaald') relatieMap.set(f.relatie_id, (relatieMap.get(f.relatie_id) || 0) + (f.totaal || 0))
  }
  for (const o of offertesData) {
    if (!o.relatie_id) continue
    relatieMap.set(o.relatie_id, (relatieMap.get(o.relatie_id) || 0) + (o.totaal || 0))
  }
  return [...relatieMap.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 50)
    .map(([id]) => id)
}

export async function getBroadcastRelatieCount(type: BroadcastType): Promise<number> {
  const adminId = await getAdministratieId()
  if (!adminId) return 0
  const supabaseAdmin = createAdminClient()

  if (type === 'top_klanten') {
    const topIds = await getTopKlantenRelatieIds(adminId)
    if (topIds.length === 0) return 0
    const { count } = await supabaseAdmin
      .from('relaties')
      .select('id', { count: 'exact', head: true })
      .eq('administratie_id', adminId)
      .in('id', topIds)
      .not('email', 'is', null)
      .neq('email', '')
    return count || 0
  }

  let query = supabaseAdmin
    .from('relaties')
    .select('id', { count: 'exact', head: true })
    .eq('administratie_id', adminId)
    .not('email', 'is', null)
    .neq('email', '')

  if (type === 'zakelijk') query = query.eq('type', 'zakelijk')
  if (type === 'particulier') query = query.eq('type', 'particulier')

  const { count } = await query
  return count || 0
}

export async function getBroadcastRelaties(): Promise<{ id: string; bedrijfsnaam: string; email: string; type: string }[]> {
  const adminId = await getAdministratieId()
  if (!adminId) return []
  const supabaseAdmin = createAdminClient()

  const data = await fetchAllRows<{ id: string; bedrijfsnaam: string; email: string; type: string }>((from, to) =>
    supabaseAdmin
      .from('relaties')
      .select('id, bedrijfsnaam, email, type')
      .eq('administratie_id', adminId)
      .not('email', 'is', null)
      .neq('email', '')
      .order('bedrijfsnaam')
      .range(from, to)
  )
  return data
}

export async function sendBroadcastEmail(onderwerp: string, bericht: string, type: BroadcastType, selectedIds?: string[]): Promise<{ success?: boolean; aantalOntvangers?: number; error?: string }> {
  const adminId = await getAdministratieId()
  if (!adminId) return { error: 'Niet ingelogd' }

  const supabaseAdmin = createAdminClient()
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  let emailAdressen: string[] = []

  if (selectedIds && selectedIds.length > 0) {
    // Handmatige selectie: haal emails op voor geselecteerde relatie IDs
    const data = await fetchAllRows<{ email: string }>((from, to) =>
      supabaseAdmin
        .from('relaties')
        .select('email')
        .eq('administratie_id', adminId)
        .in('id', selectedIds)
        .not('email', 'is', null)
        .neq('email', '')
        .range(from, to)
    )
    emailAdressen = [...new Set(data.map(r => r.email).filter(Boolean))]
  } else if (type === 'top_klanten') {
    const topIds = await getTopKlantenRelatieIds(adminId)
    if (topIds.length === 0) return { error: 'Geen top klanten gevonden' }
    const data = await fetchAllRows<{ email: string }>((from, to) =>
      supabaseAdmin
        .from('relaties')
        .select('email')
        .eq('administratie_id', adminId)
        .in('id', topIds)
        .not('email', 'is', null)
        .neq('email', '')
        .range(from, to)
    )
    emailAdressen = [...new Set(data.map(r => r.email).filter(Boolean))]
  } else {
    let query = supabaseAdmin
      .from('relaties')
      .select('email')
      .eq('administratie_id', adminId)
      .not('email', 'is', null)
      .neq('email', '')

    if (type === 'zakelijk') query = query.eq('type', 'zakelijk')
    if (type === 'particulier') query = query.eq('type', 'particulier')

    const allEmails = await fetchAllRows<{ email: string }>((from, to) =>
      query.range(from, to)
    )
    emailAdressen = [...new Set(allEmails.map(r => r.email).filter(Boolean))]
  }

  if (emailAdressen.length === 0) return { error: 'Geen relaties met emailadres gevonden' }

  const emailHtml = buildRebuEmailHtml(bericht)
  const from = process.env.SMTP_FROM || process.env.SMTP_USER || 'Nick@rebukozijnen.nl'
  const BATCH_SIZE = 90

  try {
    // Verstuur in batches van 90 (Gmail SMTP limiet)
    for (let i = 0; i < emailAdressen.length; i += BATCH_SIZE) {
      const batch = emailAdressen.slice(i, i + BATCH_SIZE)
      await sendEmail({
        to: from,
        subject: onderwerp,
        html: emailHtml,
        bcc: batch,
      })
    }
  } catch (err) {
    console.error('Broadcast email verzenden mislukt:', err)
    return { error: 'E-mail verzenden mislukt' }
  }

  // Log in email_log
  const label = selectedIds?.length ? 'Selectie' : type === 'top_klanten' ? 'Top klanten' : type.charAt(0).toUpperCase() + type.slice(1)
  await supabaseAdmin.from('email_log').insert({
    administratie_id: adminId,
    aan: `Broadcast ${label} (${emailAdressen.length} ontvangers)`,
    onderwerp,
    body_html: emailHtml,
    verstuurd_door: user?.id || null,
  })

  return { success: true, aantalOntvangers: emailAdressen.length }
}

// ========== Leverancier registry ==========

export async function getBekendeLeveranciers() {
  const sb = createAdminClient()
  const { data } = await sb
    .from('bekende_leveranciers')
    .select('naam, display_naam, parser_key, profielen, validated_count')
    .order('display_naam', { ascending: true })
  return (data || []) as { naam: string; display_naam: string; parser_key: string; profielen: string[] | null; validated_count: number }[]
}

export async function addBekendeLeverancier(input: { display_naam: string; profiel?: string; parser_key?: string }) {
  const adminId = await getAdministratieId()
  if (!adminId) return { error: 'Niet ingelogd' }
  const display = input.display_naam.trim()
  if (!display) return { error: 'Naam is verplicht' }
  const slug = display.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
  if (!slug) return { error: 'Ongeldige naam' }
  const sb = createAdminClient()
  const { data: existing } = await sb.from('bekende_leveranciers').select('naam').eq('naam', slug).maybeSingle()
  if (existing) return { naam: slug, display_naam: display, alreadyExists: true }
  const profielen = input.profiel ? [input.profiel.trim()] : []
  const { error } = await sb.from('bekende_leveranciers').insert({
    naam: slug,
    display_naam: display,
    profielen,
    parser_key: input.parser_key || 'default',
    added_by_user: true,
  })
  if (error) return { error: error.message }
  return { naam: slug, display_naam: display, alreadyExists: false }
}

// ========== Leverancier prijs-correcties (gebruiker vult handmatig prijs in, AI leert) ==========

export async function saveLeverancierPrijsCorrecties(input: {
  leverancierSlug: string
  offerteId?: string | null
  correcties: Array<{
    elementNaam: string
    aiPrijs: number
    handmatigePrijs: number
    pdfTextSample?: string
  }>
}) {
  if (!input.correcties.length) return { success: true, count: 0 }
  const sb = createAdminClient()
  const rows = input.correcties.map(c => ({
    leverancier_slug: input.leverancierSlug,
    element_naam: c.elementNaam,
    ai_prijs: c.aiPrijs,
    handmatige_prijs: c.handmatigePrijs,
    pdf_text_sample: c.pdfTextSample || null,
    offerte_id: input.offerteId || null,
  }))
  const { error } = await sb.from('leverancier_prijs_correctie').insert(rows)
  if (error) return { error: error.message }
  return { success: true, count: rows.length }
}

// ========== Leverancier wis-template (gebruiker leert AI welke regio's weg moeten) ==========

// Slaat door gebruiker gecorrigeerde wis-regio's op als template per leverancier.
// Volgende scan van dezelfde leverancier gebruikt deze regio's vóór AI Vision wordt
// aangeroepen, of als baseline waarop AI alleen verfijning doet.
export async function saveLeverancierWipeTemplate(input: {
  leverancierSlug: string
  // Regio's als percentages van paginabreedte/-hoogte (schaal-onafhankelijk)
  regionsPct: { x: number; y: number; w: number; h: number }[]
  pageWidth: number
  pageHeight: number
  validated?: boolean
}) {
  const adminId = await getAdministratieId()
  if (!adminId) return { error: 'Niet ingelogd' }
  const sb = createAdminClient()
  const { data: existing } = await sb
    .from('ai_tekening_template')
    .select('id, usage_count')
    .eq('supplier', input.leverancierSlug)
    .maybeSingle()

  if (existing) {
    const { error } = await sb.from('ai_tekening_template').update({
      remove_regions_pct: input.regionsPct,
      page_width: input.pageWidth,
      page_height: input.pageHeight,
      validated: input.validated ?? true,
      usage_count: (existing.usage_count ?? 0) + 1,
      last_used: new Date().toISOString(),
    }).eq('id', existing.id)
    if (error) return { error: error.message }
  } else {
    const { error } = await sb.from('ai_tekening_template').insert({
      supplier: input.leverancierSlug,
      remove_regions_pct: input.regionsPct,
      page_width: input.pageWidth,
      page_height: input.pageHeight,
      box_x_pct: 0,
      box_y_pct: 0,
      box_w_pct: 1,
      box_h_pct: 1,
      confidence: 1,
      validated: input.validated ?? true,
      usage_count: 1,
      last_used: new Date().toISOString(),
    })
    if (error) return { error: error.message }
  }
  return { success: true }
}

// ========== Offerte concept state (preview/correctie-loop) ==========

export async function saveConceptState(input: { offerteId: string; state: unknown; ronde?: number }) {
  const adminId = await getAdministratieId()
  if (!adminId) return { error: 'Niet ingelogd' }
  const sb = createAdminClient()
  const { data: existing } = await sb
    .from('offerte_concept_state')
    .select('id')
    .eq('offerte_id', input.offerteId)
    .eq('administratie_id', adminId)
    .maybeSingle()
  const payload = {
    state: input.state,
    ronde: input.ronde ?? 0,
    updated_at: new Date().toISOString(),
  }
  if (existing) {
    const { error } = await sb.from('offerte_concept_state').update(payload).eq('id', existing.id)
    if (error) return { error: error.message }
    return { success: true, id: existing.id }
  } else {
    const { data, error } = await sb.from('offerte_concept_state').insert({
      offerte_id: input.offerteId,
      administratie_id: adminId,
      ...payload,
    }).select('id').single()
    if (error) return { error: error.message }
    return { success: true, id: data?.id }
  }
}

export async function loadConceptState(offerteId: string) {
  const adminId = await getAdministratieId()
  if (!adminId) return null
  const sb = createAdminClient()
  const { data } = await sb
    .from('offerte_concept_state')
    .select('state, ronde, approved, updated_at')
    .eq('offerte_id', offerteId)
    .eq('administratie_id', adminId)
    .eq('approved', false)
    .maybeSingle()
  return data || null
}

export async function approveConceptState(offerteId: string) {
  const adminId = await getAdministratieId()
  if (!adminId) return { error: 'Niet ingelogd' }
  const sb = createAdminClient()
  await sb
    .from('offerte_concept_state')
    .update({ approved: true, updated_at: new Date().toISOString() })
    .eq('offerte_id', offerteId)
    .eq('administratie_id', adminId)
  return { success: true }
}

export async function bevestigLeverancierDetectie(input: {
  offerteId: string
  leverancierSlug: string
  userCorrectedFrom?: string
}) {
  const sb = createAdminClient()
  // Bump validated_count op de bevestigde leverancier
  const { data: lev } = await sb.from('bekende_leveranciers').select('id, validated_count').eq('naam', input.leverancierSlug).maybeSingle()
  if (lev) {
    await sb.from('bekende_leveranciers').update({
      validated_count: (lev.validated_count || 0) + 1,
      updated_at: new Date().toISOString(),
    }).eq('id', lev.id)
  }
  // Log de bevestiging/correctie
  if (input.offerteId) {
    await sb.from('leverancier_detectie_log').update({
      user_confirmed: true,
      user_corrected_to: input.userCorrectedFrom ? input.leverancierSlug : null,
    }).eq('offerte_id', input.offerteId).order('created_at', { ascending: false }).limit(1)
  }
  return { success: true }
}
