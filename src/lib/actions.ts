'use server'

import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { revalidatePath } from 'next/cache'
import { sendEmail } from '@/lib/email'

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

  // Fetch existing relaties for duplicate check
  const { data: existing } = await supabase
    .from('relaties')
    .select('bedrijfsnaam, kvk_nummer')
    .eq('administratie_id', adminId)

  const existingNames = new Set(
    (existing || []).map(r => r.bedrijfsnaam.toLowerCase().trim())
  )
  const existingKvk = new Set(
    (existing || []).filter(r => r.kvk_nummer).map(r => r.kvk_nummer!.trim())
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
    .select('*, relatie:relaties(bedrijfsnaam), project:projecten(naam)')
    .order('datum', { ascending: false })
  return data || []
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
    project_id: formData.get('project_id') as string || null,
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
      status: 'nieuw',
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

export async function getFactuurEmailDefaults(factuurId: string) {
  const supabase = await createClient()

  const { data: factuur } = await supabase
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

  const betaalLink = factuur.betaal_link
  const betaalSectie = betaalLink
    ? `U kunt direct online betalen via de volgende link:
${betaalLink}

Of maak het bedrag over naar:`
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

  return {
    to: factuur.relatie?.email || '',
    subject: `Factuur ${factuur.factuurnummer} - Rebu Kozijnen`,
    body,
  }
}

export async function sendFactuurEmail(factuurId: string, options: {
  to: string
  subject: string
  body: string
  extraBijlagen?: { filename: string; content: string }[]
}) {
  const supabase = await createClient()

  const { data: factuur } = await supabase
    .from('facturen')
    .select('*, relatie:relaties(*), regels:factuur_regels(*)')
    .eq('id', factuurId)
    .single()

  if (!factuur) return { error: 'Factuur niet gevonden' }
  if (!options.to) return { error: 'Geen e-mailadres opgegeven' }

  const logoUrl = `${process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'}/images/logo-rebu.png`

  const bodyHtml = options.body
    .split('\n')
    .map(line => line.trim() === '' ? '<br>' : `<p style="margin:0 0 4px 0;">${line.replace(/^- /, '&bull; ')}</p>`)
    .join('\n')

  const emailHtml = `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; color: #333;">
      ${bodyHtml}
      <br>
      <hr style="border:none; border-top:1px solid #e0e0e0; margin:20px 0;" />
      <table cellpadding="0" cellspacing="0" border="0" style="font-family:Arial,sans-serif;">
        <tr>
          <td style="padding-right:20px; vertical-align:top; border-right:2px solid #00a651;">
            <img src="${logoUrl}" alt="Rebu Kozijnen" width="140" style="display:block;" />
          </td>
          <td style="padding-left:20px; vertical-align:top;">
            <p style="margin:0; font-size:13px; color:#333;">
              <strong>Rebu kozijnen B.V.</strong>
            </p>
            <p style="margin:4px 0 0; font-size:12px; color:#666; line-height:1.6;">
              Samsonweg 26F<br>
              1521 RM Wormerveer<br>
              <a href="tel:+31658866070" style="color:#00a651; text-decoration:none;">+31 6 58 86 60 70</a><br>
              <a href="mailto:info@rebukozijnen.nl" style="color:#00a651; text-decoration:none;">info@rebukozijnen.nl</a><br>
              <a href="https://www.rebukozijnen.nl" style="color:#00a651; text-decoration:none;">www.rebukozijnen.nl</a>
            </p>
            <p style="margin:8px 0 0; font-size:11px; color:#999;">
              KVK: 907 204 74 | BTW: NL 865 427 926 B01<br>
              IBAN: NL80 INGB 0675 6102 73
            </p>
          </td>
        </tr>
      </table>
    </div>
  `

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
    })
  } catch (err) {
    console.error('Factuur e-mail verzenden mislukt:', err)
    return { error: 'E-mail verzenden mislukt' }
  }

  // Update status naar verzonden
  await supabase.from('facturen').update({ status: 'verzonden' }).eq('id', factuurId)

  // Log email
  const { data: { user } } = await supabase.auth.getUser()
  const bijlagenMeta = attachments.map(a => ({ filename: a.filename }))
  const supabaseAdmin = createAdminClient()
  await supabaseAdmin.from('email_log').insert({
    administratie_id: factuur.administratie_id,
    factuur_id: factuurId,
    relatie_id: factuur.relatie_id,
    aan: options.to,
    onderwerp: options.subject,
    body_html: emailHtml,
    bijlagen: bijlagenMeta,
    verstuurd_door: user?.id || null,
  })

  revalidatePath('/facturatie')
  return { success: true }
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
  const { data } = await supabase
    .from('projecten')
    .select('*, relatie:relaties(bedrijfsnaam), offertes:offertes(id, status, versie_nummer)')
    .order('created_at', { ascending: false })
  // Verrijk met offerte stats
  return (data || []).map(p => {
    const offertes = (p.offertes || []) as { id: string; status: string; versie_nummer: number }[]
    const laatsteOfferte = offertes.sort((a, b) => (b.versie_nummer || 0) - (a.versie_nummer || 0))[0]
    return {
      ...p,
      aantal_offertes: offertes.length,
      laatste_offerte_status: laatsteOfferte?.status || null,
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

  const supabaseAdmin = createAdminClient()
  const [facturenRes, offertesRes, takenRes, relatiesRes, profielenRes, openOffertesRes, tePlannenRes, geplandeLeveringenRes, ongelezenBerichtenRes, geaccepteerdRes, openstaandeFacturenRes] = await Promise.all([
    supabase.from('facturen').select('totaal, betaald_bedrag, status, datum').eq('administratie_id', adminId),
    supabase.from('offertes').select('totaal, status, datum').eq('administratie_id', adminId),
    supabase.from('taken').select('id, titel, status, prioriteit, deadline, toegewezen_aan').eq('administratie_id', adminId),
    supabase.from('relaties').select('type').eq('administratie_id', adminId),
    supabase.from('profielen').select('id, naam').eq('administratie_id', adminId),
    supabase.from('offertes').select('id, offertenummer, datum, totaal, relatie:relaties(bedrijfsnaam), project:projecten(naam)').eq('administratie_id', adminId).eq('status', 'verzonden').order('datum', { ascending: true }),
    supabase.from('orders').select('id, ordernummer, datum, totaal, onderwerp, relatie:relaties(bedrijfsnaam, contactpersoon, email), offerte:offertes(offertenummer)').eq('administratie_id', adminId).eq('status', 'nieuw').is('leverdatum', null).order('datum', { ascending: true }),
    supabase.from('orders').select('id, ordernummer, leverdatum, totaal, onderwerp, status, relatie:relaties(bedrijfsnaam)').eq('administratie_id', adminId).not('leverdatum', 'is', null).in('status', ['in_behandeling', 'nieuw']).order('leverdatum', { ascending: true }),
    supabaseAdmin.from('berichten').select('id, offerte_id', { count: 'exact', head: true }).eq('administratie_id', adminId).eq('afzender_type', 'klant').eq('gelezen', false),
    supabase.from('offertes').select('id, offertenummer, datum, totaal, onderwerp, relatie:relaties(bedrijfsnaam)').eq('administratie_id', adminId).eq('status', 'geaccepteerd').order('datum', { ascending: false }),
    supabase.from('facturen').select('id, factuurnummer, totaal, betaald_bedrag, vervaldatum, status, relatie:relaties(bedrijfsnaam)').eq('administratie_id', adminId).in('status', ['verzonden', 'deels_betaald', 'vervallen']).order('vervaldatum', { ascending: true }),
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

  // Gefactureerd per maand (alle facturen behalve concept)
  const gefactureerdPerMaand: { maand: string; bedrag: number; aantal: number }[] = []
  for (let i = 11; i >= 0; i--) {
    const d = new Date(nu.getFullYear(), nu.getMonth() - i, 1)
    const maandStr = d.toLocaleDateString('nl-NL', { month: 'short', year: '2-digit' })
    const jaar = d.getFullYear()
    const maandNr = d.getMonth() + 1
    const maandFacturen = facturenData.filter(f => {
      if (f.status === 'concept' || !f.datum) return false
      const fd = new Date(f.datum)
      return fd.getFullYear() === jaar && fd.getMonth() + 1 === maandNr
    })
    gefactureerdPerMaand.push({
      maand: maandStr,
      bedrag: maandFacturen.reduce((sum, f) => sum + (f.totaal || 0), 0),
      aantal: maandFacturen.length,
    })
  }
  const totaalGefactureerd = facturenData.filter(f => f.status !== 'concept').reduce((sum, f) => sum + (f.totaal || 0), 0)
  const totaalFacturen = facturenData.filter(f => f.status !== 'concept').length

  // Aangemaakte offertes per maand
  const offertesPerMaand: { maand: string; aantal: number; bedrag: number }[] = []
  for (let i = 11; i >= 0; i--) {
    const d = new Date(nu.getFullYear(), nu.getMonth() - i, 1)
    const maandStr = d.toLocaleDateString('nl-NL', { month: 'short', year: '2-digit' })
    const jaar = d.getFullYear()
    const maandNr = d.getMonth() + 1
    const maandOffertes = offertesData.filter(o => {
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
  const totaalOffertes = offertesData.length

  // Organisaties
  const organisaties = {
    totaal: relatiesData.length,
    particulier: relatiesData.filter(r => r.type === 'particulier').length,
    zakelijk: relatiesData.filter(r => r.type === 'zakelijk').length,
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
  const geplandeLeveringen = (geplandeLeveringenRes.data || []).map(o => ({
    id: o.id,
    ordernummer: o.ordernummer,
    leverdatum: o.leverdatum,
    status: o.status,
    onderwerp: o.onderwerp,
    totaal: o.totaal || 0,
    relatie_bedrijfsnaam: (o.relatie as { bedrijfsnaam: string } | null)?.bedrijfsnaam || '-',
  }))

  // Geaccepteerde offertes (voor factuur aanmaken)
  const geaccepteerdeOffertes = (geaccepteerdRes.data || []).map(o => ({
    id: o.id,
    offertenummer: o.offertenummer,
    relatie_bedrijfsnaam: (o.relatie as { bedrijfsnaam: string } | null)?.bedrijfsnaam || '-',
    onderwerp: o.onderwerp,
    totaal: o.totaal || 0,
    datum: o.datum,
  }))

  // Openstaande facturen (verzonden, deels_betaald, vervallen)
  const openstaandeFacturen = (openstaandeFacturenRes.data || []).map(f => ({
    id: f.id,
    factuurnummer: f.factuurnummer,
    relatie_bedrijfsnaam: (f.relatie as { bedrijfsnaam: string } | null)?.bedrijfsnaam || '-',
    totaal: f.totaal || 0,
    betaald_bedrag: f.betaald_bedrag || 0,
    openstaand_bedrag: (f.totaal || 0) - (f.betaald_bedrag || 0),
    vervaldatum: f.vervaldatum,
    status: f.status,
  }))

  return {
    omzet, openstaand, openOffertes, openTaken,
    ongelezenBerichten: ongelezenBerichtenRes.count || 0,
    maandOmzet, gefactureerdPerMaand, totaalGefactureerd, totaalFacturen,
    offertesPerMaand, totaalOffertes,
    organisaties, offertesPerFase, facturenPerFase, takenPerCollega, mijnTaken, openOffertesList, tePlannenOrders, geplandeLeveringen, geaccepteerdeOffertes, openstaandeFacturen,
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
    supabase.from('projecten').select('id, naam, status, offertes:offertes(id, offertenummer, versie_nummer, datum, status, totaal)').eq('relatie_id', id).order('created_at', { ascending: false }),
  ])

  const relatie = relatieRes.data
  const offertes = offertesRes.data || []
  const facturen = facturenRes.data || []
  const projecten = projectenRes.data || []

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
    projecten,
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
  const logoUrl = `${baseUrl}/images/logo-rebu.png`

  // Bouw HTML email van platte tekst body + branding footer
  const bodyHtml = options.body
    .split('\n')
    .map(line => line.trim() === '' ? '<br>' : `<p style="margin:0 0 4px 0;">${line.replace(/^- /, '&bull; ')}</p>`)
    .join('\n')

  const emailHtml = `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; color: #333;">
      ${bodyHtml}
      <br>
      <p><a href="${link}" style="display:inline-block; background-color:#00a651; color:#fff; padding:12px 28px; text-decoration:none; border-radius:6px; font-weight:bold; font-size:14px;">Offerte online bekijken &amp; accepteren</a></p>
      <br>
      <hr style="border:none; border-top:1px solid #e0e0e0; margin:20px 0;" />
      <table cellpadding="0" cellspacing="0" border="0" style="font-family:Arial,sans-serif;">
        <tr>
          <td style="padding-right:20px; vertical-align:top; border-right:2px solid #00a651;">
            <img src="${logoUrl}" alt="Rebu Kozijnen" width="140" style="display:block;" />
          </td>
          <td style="padding-left:20px; vertical-align:top;">
            <p style="margin:0; font-size:13px; color:#333;">
              <strong>Rebu kozijnen B.V.</strong>
            </p>
            <p style="margin:4px 0 0; font-size:12px; color:#666; line-height:1.6;">
              Samsonweg 26F<br>
              1521 RM Wormerveer<br>
              <a href="tel:+31658866070" style="color:#00a651; text-decoration:none;">+31 6 58 86 60 70</a><br>
              <a href="mailto:info@rebukozijnen.nl" style="color:#00a651; text-decoration:none;">info@rebukozijnen.nl</a><br>
              <a href="https://www.rebukozijnen.nl" style="color:#00a651; text-decoration:none;">www.rebukozijnen.nl</a>
            </p>
            <p style="margin:8px 0 0; font-size:11px; color:#999;">
              KVK: 907 204 74 | BTW: NL 865 427 926 B01<br>
              IBAN: NL80 INGB 0675 6102 73
            </p>
          </td>
        </tr>
      </table>
    </div>
  `

  // Load kozijn elements for PDF generation
  const supabaseAdmin = createAdminClient()
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
        if (Array.isArray(rawMeta)) {
          tekeningData = rawMeta
        } else {
          tekeningData = rawMeta.tekeningen || []
          margePercentage = rawMeta.margePercentage || 0
        }

        const pdfParse = (await import(/* webpackIgnore: true */ 'pdf-parse/lib/pdf-parse.js')).default as (buf: Buffer) => Promise<{ text: string }>
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
              tekeningUrl = `data:image/png;base64,${imgBuffer.toString('base64')}`
            }

            const matchingElement = elementData.find(e => e.naam === tekening.naam)
            const inkoopPrijs = matchingElement?.prijs || 0
            const verkoopPrijs = margePercentage > 0 ? Math.round(inkoopPrijs * (1 + margePercentage / 100) * 100) / 100 : inkoopPrijs

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
    })
  } catch (err) {
    console.error('E-mail verzenden mislukt:', err)
    return { error: 'E-mail verzenden mislukt. Gebruik de link om handmatig te delen.', link }
  }

  // Update status naar verzonden
  await supabase.from('offertes').update({ status: 'verzonden' }).eq('id', offerteId)

  // Log email in email_log
  const { data: { user } } = await supabase.auth.getUser()
  const bijlagenMeta = attachments.map(a => ({ filename: a.filename }))
  await supabaseAdmin.from('email_log').insert({
    administratie_id: offerte.administratie_id,
    offerte_id: offerteId,
    relatie_id: offerte.relatie_id,
    aan: options.to,
    onderwerp: options.subject,
    body_html: emailHtml,
    bijlagen: bijlagenMeta,
    verstuurd_door: user?.id || null,
  })

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
    .select('id, status, administratie_id, relatie_id, onderwerp, subtotaal, btw_totaal, totaal')
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

  return { success: true }
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
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'
  const logoUrl = `${baseUrl}/images/logo-rebu.png`

  const bodyHtml = options.emailBody
    .split('\n')
    .map(line => line.trim() === '' ? '<br>' : `<p style="margin:0 0 4px 0;">${line.replace(/^- /, '&bull; ')}</p>`)
    .join('\n')

  const emailHtml = `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; color: #333;">
      ${bodyHtml}
      <br>
      <hr style="border:none; border-top:1px solid #e0e0e0; margin:20px 0;" />
      <table cellpadding="0" cellspacing="0" border="0" style="font-family:Arial,sans-serif;">
        <tr>
          <td style="padding-right:20px; vertical-align:top; border-right:2px solid #00a651;">
            <img src="${logoUrl}" alt="Rebu Kozijnen" width="140" style="display:block;" />
          </td>
          <td style="padding-left:20px; vertical-align:top;">
            <p style="margin:0; font-size:13px; color:#333;">
              <strong>Rebu kozijnen B.V.</strong>
            </p>
            <p style="margin:4px 0 0; font-size:12px; color:#666; line-height:1.6;">
              Samsonweg 26F<br>
              1521 RM Wormerveer<br>
              <a href="tel:+31658866070" style="color:#00a651; text-decoration:none;">+31 6 58 86 60 70</a><br>
              <a href="mailto:info@rebukozijnen.nl" style="color:#00a651; text-decoration:none;">info@rebukozijnen.nl</a><br>
              <a href="https://www.rebukozijnen.nl" style="color:#00a651; text-decoration:none;">www.rebukozijnen.nl</a>
            </p>
            <p style="margin:8px 0 0; font-size:11px; color:#999;">
              KVK: 907 204 74 | BTW: NL 865 427 926 B01<br>
              IBAN: NL80 INGB 0675 6102 73
            </p>
          </td>
        </tr>
      </table>
    </div>
  `

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

    await supabase.from('factuur_regels').insert({
      factuur_id: factuur2.id,
      omschrijving: `Restbetaling ${100 - aanbetalingPercentage}% offerte ${offerte.offertenummer}`,
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

// === GLOBAL SEARCH ===
export async function globalSearch(query: string) {
  if (!query || query.trim().length < 2) return { relaties: [], offertes: [], projecten: [] }

  const supabase = await createClient()
  const searchTerm = `%${query.trim()}%`

  const [relatiesRes, offertesRes, projectenRes] = await Promise.all([
    supabase
      .from('relaties')
      .select('id, bedrijfsnaam, contactpersoon, plaats')
      .or(`bedrijfsnaam.ilike.${searchTerm},contactpersoon.ilike.${searchTerm}`)
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
  const logoUrl = `${baseUrl}/images/logo-rebu.png`

  try {
    await sendEmail({
      to: data.email,
      subject: 'Uw klantenportaal account — Rebu Kozijnen',
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; color: #333;">
          <p>Beste ${data.naam},</p>
          <br>
          <p>Er is een klantenportaal account voor u aangemaakt bij Rebu Kozijnen. Via het portaal kunt u uw offertes, orders en berichten bekijken.</p>
          <br>
          <p><strong>Uw inloggegevens:</strong></p>
          <table style="margin: 12px 0; font-size: 14px;">
            <tr><td style="padding: 4px 16px 4px 0; color: #666;">E-mail:</td><td style="padding: 4px 0;"><strong>${data.email}</strong></td></tr>
            <tr><td style="padding: 4px 16px 4px 0; color: #666;">Wachtwoord:</td><td style="padding: 4px 0;"><strong>${data.wachtwoord}</strong></td></tr>
          </table>
          <br>
          <p><a href="${baseUrl}/login" style="display:inline-block; background-color:#00a651; color:#fff; padding:12px 28px; text-decoration:none; border-radius:6px; font-weight:bold; font-size:14px;">Inloggen op het portaal</a></p>
          <br>
          <p style="font-size: 13px; color: #666;">Wij raden u aan uw wachtwoord na de eerste login te wijzigen via de instellingen in het portaal.</p>
          <br>
          <hr style="border:none; border-top:1px solid #e0e0e0; margin:20px 0;" />
          <table cellpadding="0" cellspacing="0" border="0" style="font-family:Arial,sans-serif;">
            <tr>
              <td style="padding-right:20px; vertical-align:top; border-right:2px solid #00a651;">
                <img src="${logoUrl}" alt="Rebu Kozijnen" width="140" style="display:block;" />
              </td>
              <td style="padding-left:20px; vertical-align:top;">
                <p style="margin:0; font-size:13px; color:#333;"><strong>Rebu kozijnen B.V.</strong></p>
                <p style="margin:4px 0 0; font-size:12px; color:#666; line-height:1.6;">
                  Samsonweg 26F<br>1521 RM Wormerveer<br>
                  <a href="tel:+31658866070" style="color:#00a651; text-decoration:none;">+31 6 58 86 60 70</a><br>
                  <a href="mailto:info@rebukozijnen.nl" style="color:#00a651; text-decoration:none;">info@rebukozijnen.nl</a>
                </p>
              </td>
            </tr>
          </table>
        </div>
      `,
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

interface KozijnElement {
  naam: string
  hoeveelheid: number
  systeem: string
  kleur: string
  afmetingen: string
  type: string
  prijs: number
  glasType: string
  beslag: string
  uwWaarde: string
  tekeningPath: string
  drapirichting: string
  dorpel: string
  sluiting: string
  scharnieren: string
  gewicht: string
  omtrek: string
  paneel: string
  commentaar: string
  hoekverbinding: string
  montageGaten: string
  afwatering: string
  scharnierenKleur: string
  lakKleur: string
  sluitcilinder: string
  aantalSleutels: string
  gelijksluitend: string
  krukBinnen: string
  krukBuiten: string
}

function parseLeverancierPdfText(text: string): { totaal: number; elementen: KozijnElement[] } {
  const cleanField = (val: string) => val.replace(/\s*Geen\s*[Gg]arantie!?\s*/gi, '').replace(/\s*No\s*warranty!?\s*/gi, '').trim()

  // Detect Eko-Okna format (uses "Hoev. :" instead of "Hoeveelheid:")
  const isEkoOkna = /Hoev\.\s*:\s*\d+/.test(text)

  // Extract totaal
  let totaal = 0
  if (isEkoOkna) {
    // Eko-Okna prices are always excl. BTW
    // Try multiple patterns for total extraction from Eko-Okna PDFs:
    // Pattern 1: "17 519,29 ETotaal" or "17 519,29 E Totaal" or "17 519,29 E\nTotaal"
    let totaalMatch = text.match(/([\d\s.,]+)\s*E\s*\n?\s*Totaal\b/)
    // Pattern 2: "Totaal 17 519,29 E" or "Totaal\n17 519,29 E"
    if (!totaalMatch) totaalMatch = text.match(/Totaal\s*\n?\s*([\d\s.,]+)\s*E(?:UR)?\b/i)
    // Pattern 3: "Totaal excl" or "Netto" followed by price
    if (!totaalMatch) totaalMatch = text.match(/(?:Totaal\s*(?:excl|netto)|Netto\s*(?:totaal|prijs))[^\n]*?([\d\s.,]+)\s*(?:E(?:UR)?)\b/i)
    // Pattern 4: "Totaal" with EUR currency
    if (!totaalMatch) totaalMatch = text.match(/([\d\s.,]+)\s*EUR\s*\n?\s*Totaal\b/)
    if (totaalMatch) {
      totaal = parseFloat(totaalMatch[1].replace(/\s/g, '').replace(/\./g, '').replace(',', '.'))
    }
  } else {
    const totaalMatch = text.match(/Prijs\s+TOT\.?\s*\n?€\s*([\d.,]+)/)
    if (totaalMatch) {
      totaal = parseFloat(totaalMatch[1].replace(/\./g, '').replace(',', '.'))
    }
  }

  // Find element headers (name, hoeveelheid, systeem, kleur)
  const headers: { naam: string; hoeveelheid: number; systeem: string; kleur: string; idx: number; endIdx: number }[] = []
  let match
  if (isEkoOkna) {
    const elementPattern = /((?:Gekoppeld\s+)?[Ee]lement\s+\d{3}(?:\/\d+)?)\s*Hoev\.\s*:\s*(\d+)\s*Kleur\s*:\s*([\s\S]*?)Systeem\s*:\s*([^\n]+)/g
    while ((match = elementPattern.exec(text)) !== null) {
      headers.push({
        naam: match[1].trim(),
        hoeveelheid: parseInt(match[2]),
        systeem: match[4].trim(),
        kleur: match[3].trim(),
        idx: match.index,
        endIdx: match.index + match[0].length,
      })
    }
  } else {
    const elementPattern = /((?:Deur|Element)\s+\d{3})\nHoeveelheid:\n(\d+)\nSysteem:\s*([\s\S]+?)Kleur:\s*([^\n]+)/g
    while ((match = elementPattern.exec(text)) !== null) {
      headers.push({
        naam: match[1],
        hoeveelheid: parseInt(match[2]),
        systeem: match[3].trim(),
        kleur: match[4].trim(),
        idx: match.index,
        endIdx: match.index + match[0].length,
      })
    }
  }

  // Find all Buitenaanzicht positions (only for original format where specs appear BEFORE each header)
  const allBuitenPositions: number[] = []
  const specsPositions: number[] = []
  if (!isEkoOkna) {
    const buitenPattern = /Buitenaanzicht\n/g
    while ((match = buitenPattern.exec(text)) !== null) {
      allBuitenPositions.push(match.index)
    }
    for (let i = 0; i < headers.length; i++) {
      const prevHeaderEnd = i > 0 ? headers[i - 1].endIdx : 0
      const candidates = allBuitenPositions.filter(pos => pos > prevHeaderEnd && pos < headers[i].idx)
      specsPositions.push(candidates.length > 0 ? candidates[candidates.length - 1] : -1)
    }
  }

  // Extract ALL price lines in order (only for original format; Eko-Okna uses only totaal)
  const allPrices: number[] = []
  if (!isEkoOkna) {
    const pricePattern = /^(?:Deur|Element)\s*(?:(\d+)\s*x\s*€\s*([\d.,]+))?€\s*([\d.,]+)/gm
    let priceMatch
    while ((priceMatch = pricePattern.exec(text)) !== null) {
      const prijsStr = priceMatch[2] || priceMatch[3]
      allPrices.push(parseFloat(prijsStr.replace(/\./g, '').replace(',', '.')))
    }
  }

  const elementen: KozijnElement[] = []

  for (let i = 0; i < headers.length; i++) {
    const header = headers[i]

    let specsText: string
    let notesText: string
    let searchText: string

    if (isEkoOkna) {
      // In Eko-Okna, all specs come AFTER the header (not before)
      const nextIdx = i + 1 < headers.length ? headers[i + 1].idx : text.length
      searchText = text.substring(header.endIdx, nextIdx)
      specsText = searchText
      notesText = searchText
    } else {
      // Original format: specs before header, notes after header
      specsText = specsPositions[i] >= 0
        ? text.substring(specsPositions[i], header.idx)
        : ''
      let notesEnd: number
      if (i + 1 < headers.length) {
        notesEnd = specsPositions[i + 1] >= 0 ? specsPositions[i + 1] : headers[i + 1].idx
      } else {
        notesEnd = text.length
      }
      notesText = text.substring(header.endIdx, notesEnd)
      searchText = specsText + '\n' + notesText
    }

    // --- Prijs ---
    let prijs = 0
    if (isEkoOkna) {
      // Try "N x unit_price" format first (unit price ends at comma + 2 digits)
      let ekoPriceMatch = searchText.match(/Prijs van het element\s*\d+\s*x\s*([\d\s.]+,\d{2})/i)
      // Fallback: single price before "E" (no "N x" prefix)
      if (!ekoPriceMatch) ekoPriceMatch = searchText.match(/Prijs van het element\s*([\d\s.]+,\d{2})\s*E/i)
      if (ekoPriceMatch) {
        const prijsStr = ekoPriceMatch[1].trim()
        prijs = parseFloat(prijsStr.replace(/\s/g, '').replace(/\./g, '').replace(',', '.'))
      }
    } else {
      prijs = i < allPrices.length ? allPrices[i] : 0
    }

    // --- Type & drapirichting from Vleugel description ---
    let drapirichting = ''
    let type = header.naam.startsWith('Deur') ? 'Deur' :
               header.naam.toLowerCase().startsWith('gekoppeld') ? 'Koppelelement' : 'Raam'

    const vleugelMatches = specsText.match(/Vleugel\s*(?:\d\s*\n\s*)?(17\d{4}\s+[^\n]+|K\d{5,6}[,\s]+[^\n]+|COR-\d{4}[,\s]+[^\n]+|Vast raam in de kader)/g)
    if (vleugelMatches) {
      // Check ALL vleugels — door/terras types take priority over Vast raam
      let allVast = true
      for (const desc of vleugelMatches) {
        if (/deur\s+vleugel\s+naar\s+binnen\s+opendraaiend/i.test(desc)) {
          drapirichting = 'Naar binnen draaiend'
          type = 'Deur'
        } else if (/deur\s+vleugel\s+naar\s+buiten\s+opendraaiend/i.test(desc)) {
          drapirichting = 'Naar buiten draaiend'
          type = 'Deur'
        } else if (/terras\s+vleugel\s+naar\s+binnen\s+opendraaiend/i.test(desc)) {
          drapirichting = 'Naar binnen draaiend'
          type = 'Terrasraam'
        } else if (/terras\s+vleugel\s+naar\s+buiten\s+opendraaiend/i.test(desc)) {
          drapirichting = 'Naar buiten draaiend'
          type = 'Terrasraam'
        } else if (/vleugel\s+RECHT/i.test(desc)) {
          allVast = false
        } else if (!/Vast\s+raam/i.test(desc)) {
          allVast = false
        }
      }
      // Only set Vast raam if ALL vleugels are vast and no door/terras was found
      if (type !== 'Deur' && type !== 'Terrasraam' && allVast) {
        type = 'Vast raam'
      }
    }

    // Refine type with beslag info
    const beslagMatch = specsText.match(/Beslag\s*([A-Z][^\n]+)/)
    const beslagRaw = beslagMatch ? beslagMatch[1].trim() : ''
    const beslag = cleanField(beslagRaw)

    if (/Draai-kiep|Draai\s*-\s*kiep|Tilt\s*&\s*Turn/i.test(beslag)) {
      if (type === 'Raam') type = 'Draai-kiep raam'
    } else if (/Draai\s*\+\s*Draai\s*-?\s*kiep/i.test(beslag)) {
      if (type === 'Raam') type = 'Draai + draai-kiep raam'
    } else if (/Draai\s*\+\s*Draai\s*-?\s*deur/i.test(beslag)) {
      if (drapirichting) type = 'Dubbele deur'
    } else if (/deur\s*beslag/i.test(beslag)) {
      if (!type.includes('Deur') && !type.includes('deur')) type = 'Deur'
    }

    // Add stulp info from specs text
    if (/STULP/i.test(specsText) && !type.includes('Dubbele')) {
      type = type + ' (stulp)'
    }

    // --- Afmetingen ---
    const afmMatch = searchText.match(/Afmetingen[\s\S]{0,30}?(\d+\s*mm\s*x\s*\d+\s*mm)/)
    const afmetingen = afmMatch ? afmMatch[1] : ''

    // Detect HST / schuifpui from system name or combined text
    if (/HST|hef.*schui|\bschuif/i.test(header.systeem) || /HST|hef.*schui|\bschuif/i.test(searchText)) {
      type = 'Schuifpui'
    }

    // --- Glass types from Vullingen section (correct per element) ---
    // Step 1: Try Vullingen in specsText, fallback to notesText
    const vulSpec = specsText.match(/(?:Vullingen|Glazing used)\s*\n?Afmetingen\n([\s\S]*?)(?=Prijs\b|$)/)
    const vulNotes = !vulSpec ? notesText.match(/(?:Vullingen|Glazing used)\s*\n?Afmetingen\n([\s\S]*?)(?=Prijs\b|$)/) : null
    const vullingenMatch = vulSpec || vulNotes
    let glasType = ''
    if (vullingenMatch) {
      const glasTypes: string[] = []
      const glasPattern = /\d+\.\d+\n([^\n]+\[Ug=[\d.,]+\][^\n]*)/g
      let glasMatch2
      while ((glasMatch2 = glasPattern.exec(vullingenMatch[1])) !== null) {
        let glasStr = glasMatch2[1].trim()
        const ugIdx = glasStr.indexOf(' Zontoetredingsfactor')
        if (ugIdx > 0) glasStr = glasStr.substring(0, ugIdx).trim()
        if (!glasTypes.includes(glasStr)) glasTypes.push(glasStr)
      }
      glasType = cleanField(glasTypes.join(' / '))
    }
    // Step 2: Fallback — collect ALL Gevraagd glas entries (multiple per element possible)
    if (!glasType) {
      const glasTypes: string[] = []
      const gevPat = /(?:Gevraagd glas|Glazing required)\s*([^\n]+)/g
      let gm
      while ((gm = gevPat.exec(searchText)) !== null) {
        const gs = cleanField(gm[1].trim())
        if (gs && !glasTypes.includes(gs)) glasTypes.push(gs)
      }
      glasType = glasTypes.join(' / ')
    }
    // Step 3: Eko-Okna fallback — extract from "Glazing used" glass spec pattern
    if (!glasType) {
      const glasTypes: string[] = []
      const ekoGlasPat = /(\d+[\w. ]*\/\d+\w*\/\d+[\w ]*\[Ug=[\d.,]+\])/g
      let gm
      while ((gm = ekoGlasPat.exec(searchText)) !== null) {
        const gs = cleanField(gm[1].trim())
        if (gs && !glasTypes.includes(gs)) glasTypes.push(gs)
      }
      glasType = glasTypes.join(' / ')
    }

    // --- Specs fields ---
    const dorpelMatch = searchText.match(/Deur\s*drempel\s*([^\n]+)/i) || searchText.match(/HST\s*dorpel\s*type\s*([^\n]+)/i) || searchText.match(/Dorpel\s*([^\n]+)/i)
    const sluitingMatch = searchText.match(/Sluiting\s*([^\n]+)/)
    const scharnierenMatch = searchText.match(/Scharnieren\s*([A-Z][^\n]+)/) || searchText.match(/scharnieren\s+(\w[^\n]+)/i)
    const uwMatch = searchText.match(/Uw\s*=\s*([\d,]+\s*W\/m.*?K)/)
    const gewichtMatch = searchText.match(/Eenheidsgewicht\s*([\d.,]+\s*Kg)/i)
    const omtrekMatch = searchText.match(/Eenheidsomtrek\s*([\d.,]+\s*mm)/i) || searchText.match(/\bOmtrek\s*([\d.,]+\s*m)\b/i)
    const paneelMatch = searchText.match(/Paneel\s*([A-Z][^\n]+)/i)
    const hoekverbindingMatch = searchText.match(/Hoekverbinding\s*([^\n]+)/i)
    const montageGatenMatch = searchText.match(/Montage\s*gaten\([^)]+\):\s*(\w+)/i) || searchText.match(/Montage\s*gaten\s+(\w[^\n]*)/i)
    const afwateringMatch = searchText.match(/Afwatering\s*([^\n]+)/i)
    const scharnierenKleurMatch = searchText.match(/Kleur\s*scharnieren\s*([^\n]+)/i)
    const lakKleurMatch = searchText.match(/Lak\s*kleur\s*([^\n]+)/i)
    const sluitcilinderMatch = searchText.match(/sluitcilinder\s*([^\n]+)/i)
    const aantalSleutelsMatch = searchText.match(/Aantal\s*sleutels?\s*([^\n]+)/i)
    const gelijksluitendMatch = searchText.match(/Gelijksluitend[e]?\s*(?:cilinder)?\s*([^\n]+)/i)
    const krukBinnenMatch = searchText.match(/Kleur\s*kruk\s*binnen\s*([^\n]+)/i) || searchText.match(/kruk\/trekker\/cilinderplaatje\nbinnen\n([^\n]+)/i)
    const krukBuitenMatch = searchText.match(/Kleur\s*kruk\s*buiten\s*([^\n]+)/i) || searchText.match(/kruk\/trekker\/cilinderplaatje\nbuiten\n([^\n]+)/i)

    // --- Commentaar ---
    const commentaarMatch = notesText.match(/Commentaar(?:\s+op het product)?\n([^\n]+)/)
    const commentaar = commentaarMatch ? cleanField(commentaarMatch[1].trim()) : ''

    elementen.push({
      naam: header.naam,
      hoeveelheid: header.hoeveelheid,
      systeem: cleanField(header.systeem),
      kleur: cleanField(header.kleur),
      afmetingen,
      type,
      prijs,
      glasType,
      beslag,
      uwWaarde: uwMatch ? cleanField(uwMatch[1].trim()) : '',
      drapirichting,
      dorpel: dorpelMatch ? cleanField(dorpelMatch[1].trim()) : '',
      sluiting: sluitingMatch ? cleanField(sluitingMatch[1].trim()) : '',
      scharnieren: scharnierenMatch ? cleanField(scharnierenMatch[1].trim()) : '',
      gewicht: gewichtMatch ? gewichtMatch[1].trim() : '',
      omtrek: omtrekMatch ? omtrekMatch[1].trim() : '',
      paneel: paneelMatch ? cleanField(paneelMatch[1].trim()) : '',
      commentaar,
      tekeningPath: '',
      hoekverbinding: hoekverbindingMatch ? cleanField(hoekverbindingMatch[1].trim()) : '',
      montageGaten: montageGatenMatch ? cleanField(montageGatenMatch[1].trim()) : '',
      afwatering: afwateringMatch ? cleanField(afwateringMatch[1].trim()) : '',
      scharnierenKleur: scharnierenKleurMatch ? cleanField(scharnierenKleurMatch[1].trim()) : '',
      lakKleur: lakKleurMatch ? cleanField(lakKleurMatch[1].trim()) : '',
      sluitcilinder: sluitcilinderMatch ? cleanField(sluitcilinderMatch[1].trim()) : '',
      aantalSleutels: aantalSleutelsMatch ? cleanField(aantalSleutelsMatch[1].trim()) : '',
      gelijksluitend: gelijksluitendMatch ? cleanField(gelijksluitendMatch[1].trim()) : '',
      krukBinnen: krukBinnenMatch ? cleanField(krukBinnenMatch[1].trim()) : '',
      krukBuiten: krukBuitenMatch ? cleanField(krukBuitenMatch[1].trim()) : '',
    })
  }

  return { totaal, elementen }
}

export async function processLeverancierPdf(offerteId: string, formData: FormData) {
  const adminId = await getAdministratieId()
  if (!adminId) return { error: 'Niet ingelogd' }

  const file = formData.get('pdf') as File
  if (!file) return { error: 'Geen PDF bestand' }

  const buffer = Buffer.from(await file.arrayBuffer())

  // Import pdf-parse/lib directly to avoid test file loading in dev
  const pdfParse = (await import(/* webpackIgnore: true */ 'pdf-parse/lib/pdf-parse.js')).default as (buf: Buffer) => Promise<{ text: string }>
  let parsed
  try {
    parsed = await pdfParse(buffer)
  } catch {
    return { error: 'Kan PDF niet lezen' }
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
  const path = `leverancier-pdfs/${offerteId}/tekening-${pageNum}.png`

  const { error: uploadError } = await supabaseAdmin.storage
    .from('documenten')
    .upload(path, buffer, { contentType: 'image/png', upsert: true })

  if (uploadError) return { error: uploadError.message }
  return { path }
}

export async function saveLeverancierTekeningen(offerteId: string, elementen: { naam: string; tekeningPath: string }[], margePercentage?: number) {
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

  // Store tekening data + optional marge as JSON in storage_path field
  const metadata: { tekeningen: typeof elementen; margePercentage?: number } = { tekeningen: elementen }
  if (margePercentage && margePercentage > 0) {
    metadata.margePercentage = margePercentage
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
    const pdfParse = (await import(/* webpackIgnore: true */ 'pdf-parse/lib/pdf-parse.js')).default as (buf: Buffer) => Promise<{ text: string }>
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
    }
  } catch (err) {
    console.error('Error parsing leverancier PDF for edit mode:', err)
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
    // Import pdf-parse/lib directly to avoid test file loading in dev
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const pdfParse = (await import(/* webpackIgnore: true */ 'pdf-parse/lib/pdf-parse.js')).default as (buf: Buffer) => Promise<{ text: string }>

    let parsed
    try {
      parsed = await pdfParse(buffer)
    } catch {
      return { error: 'Kan PDF niet lezen' }
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
