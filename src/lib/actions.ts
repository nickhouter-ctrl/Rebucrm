'use server'

import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { revalidatePath } from 'next/cache'

export async function getAdministratieId(): Promise<string | null> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null

  const { data: profiel } = await supabase
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

// === RELATIES ===
export async function getRelaties() {
  const supabase = await createClient()
  const { data } = await supabase
    .from('relaties')
    .select('*')
    .order('bedrijfsnaam')
  return data || []
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
    telefoon: formData.get('telefoon') as string || null,
    adres: formData.get('adres') as string || null,
    postcode: formData.get('postcode') as string || null,
    plaats: formData.get('plaats') as string || null,
    kvk_nummer: formData.get('kvk_nummer') as string || null,
    btw_nummer: formData.get('btw_nummer') as string || null,
    iban: formData.get('iban') as string || null,
    opmerkingen: formData.get('opmerkingen') as string || null,
  }

  if (id) {
    const { error } = await supabase.from('relaties').update(record).eq('id', id)
    if (error) return { error: error.message }
  } else {
    const { error } = await supabase.from('relaties').insert(record)
    if (error) return { error: error.message }
  }

  revalidatePath('/relatiebeheer')
  return { success: true }
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
export async function getOffertes() {
  const supabase = await createClient()
  const { data } = await supabase
    .from('offertes')
    .select('*, relatie:relaties(bedrijfsnaam)')
    .order('datum', { ascending: false })
  return data || []
}

export async function getOfferte(id: string) {
  const supabase = await createClient()
  const { data } = await supabase
    .from('offertes')
    .select('*, relatie:relaties(*), regels:offerte_regels(*, product:producten(naam))')
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

  // Auto-generate offertenummer for new offertes
  const offertenummer = id
    ? (formData.get('offertenummer') as string)
    : await getVolgendeNummer('offerte')

  const record = {
    administratie_id: adminId,
    relatie_id: formData.get('relatie_id') as string || null,
    offertenummer,
    datum: formData.get('datum') as string,
    geldig_tot: formData.get('geldig_tot') as string || null,
    status: formData.get('status') as string || 'concept',
    onderwerp: formData.get('onderwerp') as string || null,
    inleiding: formData.get('inleiding') as string || null,
    subtotaal,
    btw_totaal: btwTotaal,
    totaal: subtotaal + btwTotaal,
    opmerkingen: formData.get('opmerkingen') as string || null,
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

  revalidatePath('/offertes')
  return { success: true }
}

export async function deleteOfferte(id: string) {
  const supabase = await createClient()
  const { error } = await supabase.from('offertes').delete().eq('id', id)
  if (error) return { error: error.message }
  revalidatePath('/offertes')
  return { success: true }
}

// === ORDERS ===
export async function getOrders() {
  const supabase = await createClient()
  const { data } = await supabase
    .from('orders')
    .select('*, relatie:relaties(bedrijfsnaam)')
    .order('datum', { ascending: false })
  return data || []
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

// === FACTUREN ===
export async function getFacturen() {
  const supabase = await createClient()
  const { data } = await supabase
    .from('facturen')
    .select('*, relatie:relaties(bedrijfsnaam)')
    .order('datum', { ascending: false })
  return data || []
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

  revalidatePath('/facturatie')
  return { success: true }
}

export async function deleteFactuur(id: string) {
  const supabase = await createClient()
  const { error } = await supabase.from('facturen').delete().eq('id', id)
  if (error) return { error: error.message }
  revalidatePath('/facturatie')
  return { success: true }
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
  const { data } = await supabase
    .from('projecten')
    .select('*, relatie:relaties(bedrijfsnaam)')
    .order('created_at', { ascending: false })
  return data || []
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
export async function getTaken() {
  const supabase = await createClient()
  const { data } = await supabase
    .from('taken')
    .select('*, project:projecten(naam), toegewezen:profielen(naam)')
    .order('created_at', { ascending: false })
  return data || []
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

export async function saveTaak(formData: FormData) {
  const supabase = await createClient()
  const adminId = await getAdministratieId()
  if (!adminId) return { error: 'Niet ingelogd' }

  const id = formData.get('id') as string
  const record = {
    administratie_id: adminId,
    titel: formData.get('titel') as string,
    omschrijving: formData.get('omschrijving') as string || null,
    project_id: formData.get('project_id') as string || null,
    status: formData.get('status') as string || 'open',
    prioriteit: formData.get('prioriteit') as string || 'normaal',
    deadline: formData.get('deadline') as string || null,
  }

  if (id) {
    const { error } = await supabase.from('taken').update(record).eq('id', id)
    if (error) return { error: error.message }
  } else {
    const { error } = await supabase.from('taken').insert(record)
    if (error) return { error: error.message }
  }

  revalidatePath('/taken')
  return { success: true }
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

  const [facturenRes, offertesRes, takenRes, relatiesRes, profielenRes] = await Promise.all([
    supabase.from('facturen').select('totaal, betaald_bedrag, status, datum').eq('administratie_id', adminId),
    supabase.from('offertes').select('totaal, status').eq('administratie_id', adminId),
    supabase.from('taken').select('id, titel, status, prioriteit, deadline, toegewezen_aan').eq('administratie_id', adminId),
    supabase.from('relaties').select('type').eq('administratie_id', adminId),
    supabase.from('profielen').select('id, naam').eq('administratie_id', adminId),
  ])

  const facturenData = facturenRes.data || []
  const offertesData = offertesRes.data || []
  const takenData = takenRes.data || []
  const relatiesData = relatiesRes.data || []
  const profielenData = profielenRes.data || []

  // Basis KPIs
  const omzet = facturenData
    .filter(f => f.status === 'betaald')
    .reduce((sum, f) => sum + (f.totaal || 0), 0)
  const openstaand = facturenData
    .filter(f => ['verzonden', 'deels_betaald', 'vervallen'].includes(f.status))
    .reduce((sum, f) => sum + (f.totaal || 0) - (f.betaald_bedrag || 0), 0)
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
        if (f.status !== 'betaald' || !f.datum) return false
        const fd = new Date(f.datum)
        return fd.getFullYear() === jaar && fd.getMonth() + 1 === maand
      })
      .reduce((sum, f) => sum + (f.totaal || 0), 0)
    maandOmzet.push({ maand: maandStr, bedrag })
  }

  // Organisaties
  const organisaties = {
    klanten: relatiesData.filter(r => r.type === 'klant' || r.type === 'beide').length,
    leads: relatiesData.filter(r => r.type === 'lead').length,
    leveranciers: relatiesData.filter(r => r.type === 'leverancier' || r.type === 'beide').length,
  }

  // Offertes per fase
  const offerteFases = ['concept', 'verzonden', 'geaccepteerd', 'afgewezen', 'verlopen']
  const offertesPerFase = offerteFases.map(status => ({
    status,
    aantal: offertesData.filter(o => o.status === status).length,
    bedrag: offertesData.filter(o => o.status === status).reduce((sum, o) => sum + (o.totaal || 0), 0),
  }))

  // Facturen per fase
  const factuurFases = ['concept', 'verzonden', 'betaald', 'deels_betaald', 'vervallen', 'gecrediteerd']
  const facturenPerFase = factuurFases.map(status => ({
    status,
    aantal: facturenData.filter(f => f.status === status).length,
    bedrag: facturenData.filter(f => f.status === status).reduce((sum, f) => sum + (f.totaal || 0), 0),
  }))

  // Taken per collega
  const takenPerCollega = profielenData.map(p => ({
    naam: p.naam,
    aantal: takenData.filter(t => t.toegewezen_aan === p.id && t.status !== 'afgerond').length,
  })).filter(t => t.aantal > 0)

  // Mijn openstaande taken
  const mijnTaken = takenData
    .filter(t => t.toegewezen_aan === user.id && t.status !== 'afgerond')
    .slice(0, 10)
    .map(t => ({ id: t.id, titel: t.titel, deadline: t.deadline, prioriteit: t.prioriteit }))

  return {
    omzet, openstaand, openOffertes, openTaken,
    maandOmzet, organisaties, offertesPerFase, facturenPerFase, takenPerCollega, mijnTaken,
  }
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

  // Nieuw offertenummer
  const nummer = await getVolgendeNummer('offerte')

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

  const [relatieRes, offertesRes, facturenRes] = await Promise.all([
    supabase.from('relaties').select('*').eq('id', id).single(),
    supabase.from('offertes').select('*').eq('relatie_id', id).order('datum', { ascending: false }),
    supabase.from('facturen').select('*').eq('relatie_id', id).order('datum', { ascending: false }),
  ])

  const relatie = relatieRes.data
  const offertes = offertesRes.data || []
  const facturen = facturenRes.data || []

  const totaleOmzet = facturen
    .filter(f => f.status === 'betaald')
    .reduce((sum, f) => sum + (f.totaal || 0), 0)

  const openstaand = facturen
    .filter(f => ['verzonden', 'deels_betaald', 'vervallen'].includes(f.status))
    .reduce((sum, f) => sum + (f.totaal || 0) - (f.betaald_bedrag || 0), 0)

  const geaccepteerdeOffertes = offertes.filter(o => o.status === 'geaccepteerd').length
  const conversiePercentage = offertes.length > 0 ? Math.round((geaccepteerdeOffertes / offertes.length) * 100) : 0

  return {
    relatie,
    offertes,
    facturen,
    stats: {
      totaleOmzet,
      openstaand,
      aantalOffertes: offertes.length,
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
    type: 'lead',
    adres: adresParts[0] || null,
    postcode,
    plaats: adresParts.length > 1 ? adresParts[adresParts.length - 2]?.replace(/\d{4}\s?[A-Z]{2}/i, '').trim() || null : null,
    telefoon: data.phone || null,
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
      type: data.type || 'klant',
    })
    .select('id, bedrijfsnaam')
    .single()

  if (error) return { error: error.message }
  revalidatePath('/relatiebeheer')
  return { success: true, id: relatie.id, bedrijfsnaam: relatie.bedrijfsnaam }
}

// === OFFERTE EMAIL VERSTUREN ===
export async function sendOfferteEmail(offerteId: string) {
  const supabase = await createClient()

  const { data: offerte } = await supabase
    .from('offertes')
    .select('*, relatie:relaties(*)')
    .eq('id', offerteId)
    .single()

  if (!offerte) return { error: 'Offerte niet gevonden' }
  if (!offerte.relatie?.email) return { error: 'Relatie heeft geen e-mailadres' }

  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'
  const link = `${baseUrl}/offerte/${offerte.publiek_token}`

  const resendKey = process.env.RESEND_API_KEY
  if (resendKey) {
    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${resendKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: 'Rebu Kozijnen <noreply@rebukozijnen.nl>',
        to: offerte.relatie.email,
        subject: `Offerte ${offerte.offertenummer} - Rebu Kozijnen`,
        html: `
          <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
            <div style="background: #000; padding: 30px; text-align: center;">
              <h1 style="color: #00C9A7; margin: 0; font-size: 28px;">Rebu Kozijnen</h1>
            </div>
            <div style="padding: 30px; background: #fff;">
              <h2 style="color: #333;">Beste ${offerte.relatie.contactpersoon || offerte.relatie.bedrijfsnaam},</h2>
              <p style="color: #555; line-height: 1.6;">Hierbij ontvangt u onze offerte <strong>${offerte.offertenummer}</strong>.</p>
              <p style="color: #555; line-height: 1.6;">U kunt de offerte bekijken en accepteren via onderstaande knop:</p>
              <div style="text-align: center; margin: 30px 0;">
                <a href="${link}" style="background: #00C9A7; color: #fff; padding: 14px 32px; text-decoration: none; border-radius: 6px; font-weight: bold; display: inline-block;">
                  Offerte bekijken
                </a>
              </div>
              <p style="color: #555; line-height: 1.6;">Met vriendelijke groet,<br><strong>Rebu Kozijnen B.V.</strong></p>
            </div>
            <div style="background: #f5f5f5; padding: 20px; text-align: center; font-size: 12px; color: #999;">
              Rebu Kozijnen B.V. | Samsonweg 26F, 1521 RM Wormerveer | +31 6 58 86 60 70
            </div>
          </div>
        `,
      }),
    })

    if (!response.ok) {
      return { error: 'E-mail verzenden mislukt. Gebruik de link om handmatig te delen.', link }
    }
  }

  // Update status naar verzonden
  await supabase.from('offertes').update({ status: 'verzonden' }).eq('id', offerteId)
  revalidatePath('/offertes')
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
    .select('id, status')
    .eq('publiek_token', token)
    .single()

  if (fetchError || !offerte) return { error: 'Offerte niet gevonden' }
  if (offerte.status === 'geaccepteerd') return { error: 'Deze offerte is al geaccepteerd' }

  const { error } = await supabaseAdmin
    .from('offertes')
    .update({ status: 'geaccepteerd' })
    .eq('id', offerte.id)

  if (error) return { error: error.message }
  return { success: true }
}

// === OFFERTE NAAR FACTUUR ===
export async function convertToFactuur(offerteId: string, splitType: 'volledig' | 'split' = 'volledig') {
  const supabase = await createClient()
  const adminId = await getAdministratieId()
  if (!adminId) return { error: 'Niet ingelogd' }

  const { data: offerte } = await supabase
    .from('offertes')
    .select('*, regels:offerte_regels(*)')
    .eq('id', offerteId)
    .single()

  if (!offerte) return { error: 'Offerte niet gevonden' }

  if (splitType === 'volledig') {
    const nummer = await getVolgendeNummer('factuur')
    const { data: factuur, error } = await supabase
      .from('facturen')
      .insert({
        administratie_id: adminId,
        relatie_id: offerte.relatie_id,
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
    }

    revalidatePath('/facturatie')
    return { success: true, factuurIds: [factuur.id] }
  } else {
    const nummer1 = await getVolgendeNummer('factuur')
    const nummer2 = await getVolgendeNummer('factuur')

    const aanbetalingSubtotaal = Math.round(offerte.subtotaal * 0.7 * 100) / 100
    const aanbetalingBtw = Math.round(offerte.btw_totaal * 0.7 * 100) / 100
    const aanbetalingTotaal = aanbetalingSubtotaal + aanbetalingBtw

    const restSubtotaal = offerte.subtotaal - aanbetalingSubtotaal
    const restBtw = offerte.btw_totaal - aanbetalingBtw
    const restTotaal = restSubtotaal + restBtw

    const { data: factuur1, error: err1 } = await supabase
      .from('facturen')
      .insert({
        administratie_id: adminId,
        relatie_id: offerte.relatie_id,
        factuurnummer: nummer1,
        datum: new Date().toISOString().split('T')[0],
        vervaldatum: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
        status: 'concept',
        onderwerp: `Aanbetaling 70% - ${offerte.onderwerp || offerte.offertenummer}`,
        subtotaal: aanbetalingSubtotaal,
        btw_totaal: aanbetalingBtw,
        totaal: aanbetalingTotaal,
      })
      .select('id')
      .single()

    if (err1) return { error: err1.message }

    await supabase.from('factuur_regels').insert({
      factuur_id: factuur1.id,
      omschrijving: `Aanbetaling 70% offerte ${offerte.offertenummer}`,
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
        factuurnummer: nummer2,
        datum: new Date().toISOString().split('T')[0],
        vervaldatum: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
        status: 'concept',
        onderwerp: `Restbetaling 30% - ${offerte.onderwerp || offerte.offertenummer}`,
        subtotaal: restSubtotaal,
        btw_totaal: restBtw,
        totaal: restTotaal,
      })
      .select('id')
      .single()

    if (err2) return { error: err2.message }

    await supabase.from('factuur_regels').insert({
      factuur_id: factuur2.id,
      omschrijving: `Restbetaling 30% offerte ${offerte.offertenummer}`,
      aantal: 1,
      prijs: restSubtotaal,
      btw_percentage: 21,
      totaal: restSubtotaal,
      volgorde: 0,
    })

    revalidatePath('/facturatie')
    return { success: true, factuurIds: [factuur1.id, factuur2.id] }
  }
}

// === NOTITIES ===
export async function getNotities(relatieId: string) {
  const supabase = await createClient()
  const { data } = await supabase
    .from('notities')
    .select('*, gebruiker:profielen(naam)')
    .eq('relatie_id', relatieId)
    .order('created_at', { ascending: false })
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
