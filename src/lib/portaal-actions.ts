'use server'

import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { revalidatePath } from 'next/cache'

// === HELPER: Get klant context (profiel + relatie IDs) ===
async function getKlantContext() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null

  const supabaseAdmin = createAdminClient()
  const { data: profiel } = await supabaseAdmin
    .from('profielen')
    .select('id, administratie_id, naam, email')
    .eq('id', user.id)
    .single()

  if (!profiel || !profiel.administratie_id) return null

  // Haal relatie IDs op via klant_relaties koppeltabel
  const { data: links } = await supabaseAdmin
    .from('klant_relaties')
    .select('relatie_id')
    .eq('profiel_id', user.id)

  const relatieIds = (links || []).map(l => l.relatie_id)

  return {
    profiel: {
      id: profiel.id,
      administratie_id: profiel.administratie_id,
      naam: profiel.naam,
      email: profiel.email,
    },
    relatieIds,
  }
}

// === DASHBOARD DATA ===
export async function getPortaalDashboard() {
  const ctx = await getKlantContext()
  if (!ctx || ctx.relatieIds.length === 0) {
    return { openOffertes: 0, actieveOrders: 0, ongelezen: 0, recenteOffertes: [], recenteOrders: [] }
  }

  const supabaseAdmin = createAdminClient()

  const [offertesRes, ordersRes, berichtenRes, recenteOffertesRes, recenteOrdersRes] = await Promise.all([
    supabaseAdmin
      .from('offertes')
      .select('id', { count: 'exact', head: true })
      .in('relatie_id', ctx.relatieIds)
      .eq('status', 'verzonden'),
    supabaseAdmin
      .from('orders')
      .select('id', { count: 'exact', head: true })
      .in('relatie_id', ctx.relatieIds)
      .in('status', ['nieuw', 'in_behandeling']),
    supabaseAdmin
      .from('berichten')
      .select('id', { count: 'exact', head: true })
      .in('offerte_id', (
        await supabaseAdmin
          .from('offertes')
          .select('id')
          .in('relatie_id', ctx.relatieIds)
      ).data?.map(o => o.id) || [])
      .eq('afzender_type', 'medewerker')
      .eq('gelezen', false),
    supabaseAdmin
      .from('offertes')
      .select('id, offertenummer, datum, onderwerp, status, totaal, relatie:relaties(bedrijfsnaam)')
      .in('relatie_id', ctx.relatieIds)
      .neq('status', 'concept')
      .order('datum', { ascending: false })
      .limit(5),
    supabaseAdmin
      .from('orders')
      .select('id, ordernummer, datum, onderwerp, status, totaal, relatie:relaties(bedrijfsnaam)')
      .in('relatie_id', ctx.relatieIds)
      .order('datum', { ascending: false })
      .limit(5),
  ])

  return {
    openOffertes: offertesRes.count || 0,
    actieveOrders: ordersRes.count || 0,
    ongelezen: berichtenRes.count || 0,
    recenteOffertes: (recenteOffertesRes.data || []).map(o => ({
      id: o.id,
      offertenummer: o.offertenummer,
      datum: o.datum,
      onderwerp: o.onderwerp,
      status: o.status,
      totaal: o.totaal,
      relatie_bedrijfsnaam: (o.relatie as { bedrijfsnaam: string } | null)?.bedrijfsnaam || '-',
    })),
    recenteOrders: (recenteOrdersRes.data || []).map(o => ({
      id: o.id,
      ordernummer: o.ordernummer,
      datum: o.datum,
      onderwerp: o.onderwerp,
      status: o.status,
      totaal: o.totaal,
      relatie_bedrijfsnaam: (o.relatie as { bedrijfsnaam: string } | null)?.bedrijfsnaam || '-',
    })),
  }
}

// === OFFERTE LIST ===
export async function getPortaalOffertes() {
  const ctx = await getKlantContext()
  if (!ctx || ctx.relatieIds.length === 0) return []

  const supabaseAdmin = createAdminClient()
  const { data } = await supabaseAdmin
    .from('offertes')
    .select('id, offertenummer, datum, onderwerp, status, totaal, relatie:relaties(bedrijfsnaam)')
    .in('relatie_id', ctx.relatieIds)
    .neq('status', 'concept')
    .order('datum', { ascending: false })

  return (data || []).map(o => ({
    ...o,
    relatie_bedrijfsnaam: (o.relatie as { bedrijfsnaam: string } | null)?.bedrijfsnaam || '-',
  }))
}

// === SINGLE OFFERTE WITH REGELS + BERICHTEN ===
export async function getPortaalOfferte(id: string) {
  const ctx = await getKlantContext()
  if (!ctx || ctx.relatieIds.length === 0) return null

  const supabaseAdmin = createAdminClient()
  const { data } = await supabaseAdmin
    .from('offertes')
    .select('*, relatie:relaties(bedrijfsnaam, contactpersoon), regels:offerte_regels(*)')
    .eq('id', id)
    .single()

  if (!data) return null

  // Verify klant has access to this offerte
  if (!ctx.relatieIds.includes(data.relatie_id)) return null

  // Fetch berichten
  const { data: berichten } = await supabaseAdmin
    .from('berichten')
    .select('*')
    .eq('offerte_id', id)
    .order('created_at', { ascending: true })

  return {
    ...data,
    berichten: berichten || [],
  }
}

// === ORDERS LIST ===
export async function getPortaalOrders() {
  const ctx = await getKlantContext()
  if (!ctx || ctx.relatieIds.length === 0) return []

  const supabaseAdmin = createAdminClient()
  const { data } = await supabaseAdmin
    .from('orders')
    .select('id, ordernummer, datum, leverdatum, onderwerp, status, totaal, relatie:relaties(bedrijfsnaam)')
    .in('relatie_id', ctx.relatieIds)
    .order('datum', { ascending: false })

  return (data || []).map(o => ({
    ...o,
    relatie_bedrijfsnaam: (o.relatie as { bedrijfsnaam: string } | null)?.bedrijfsnaam || '-',
  }))
}

// === FACTUREN LIST ===
export async function getPortaalFacturen() {
  const ctx = await getKlantContext()
  if (!ctx || ctx.relatieIds.length === 0) return []

  const supabaseAdmin = createAdminClient()
  const { data } = await supabaseAdmin
    .from('facturen')
    .select('id, factuurnummer, datum, vervaldatum, onderwerp, status, totaal, betaald_bedrag, relatie:relaties(bedrijfsnaam)')
    .in('relatie_id', ctx.relatieIds)
    .neq('status', 'concept')
    .order('datum', { ascending: false })

  return (data || []).map(f => ({
    ...f,
    relatie_bedrijfsnaam: (f.relatie as { bedrijfsnaam: string } | null)?.bedrijfsnaam || '-',
  }))
}

// === GEPLANDE LEVERINGEN ===
export async function getPortaalLeveringen() {
  const ctx = await getKlantContext()
  if (!ctx || ctx.relatieIds.length === 0) return []

  const supabaseAdmin = createAdminClient()
  const { data } = await supabaseAdmin
    .from('orders')
    .select('id, ordernummer, datum, leverdatum, onderwerp, status, totaal, relatie:relaties(bedrijfsnaam)')
    .in('relatie_id', ctx.relatieIds)
    .not('leverdatum', 'is', null)
    .order('leverdatum', { ascending: true })

  return (data || []).map(o => ({
    ...o,
    relatie_bedrijfsnaam: (o.relatie as { bedrijfsnaam: string } | null)?.bedrijfsnaam || '-',
  }))
}

// === EMAIL HISTORY ===
export async function getPortaalEmails() {
  const ctx = await getKlantContext()
  if (!ctx || ctx.relatieIds.length === 0) return []

  const supabaseAdmin = createAdminClient()
  const { data } = await supabaseAdmin
    .from('email_log')
    .select('*')
    .in('relatie_id', ctx.relatieIds)
    .order('verstuurd_op', { ascending: false })

  return data || []
}

// === SEND CHAT MESSAGE ===
export async function sendBericht(offerteId: string, tekst: string) {
  const ctx = await getKlantContext()
  if (!ctx) return { error: 'Niet ingelogd' }

  if (!tekst.trim()) return { error: 'Bericht mag niet leeg zijn' }

  const supabaseAdmin = createAdminClient()

  // Verify offerte belongs to klant + get administratie_id
  const { data: offerte } = await supabaseAdmin
    .from('offertes')
    .select('id, relatie_id, administratie_id')
    .eq('id', offerteId)
    .single()

  if (!offerte) return { error: 'Offerte niet gevonden' }
  if (!ctx.relatieIds.includes(offerte.relatie_id)) return { error: 'Geen toegang' }

  const { error } = await supabaseAdmin
    .from('berichten')
    .insert({
      offerte_id: offerteId,
      administratie_id: offerte.administratie_id,
      afzender_type: 'klant',
      afzender_id: ctx.profiel.id,
      afzender_naam: ctx.profiel.naam || ctx.profiel.email,
      tekst: tekst.trim(),
      gelezen: false,
    })

  if (error) return { error: error.message }

  revalidatePath(`/portaal/offertes/${offerteId}`)
  return { success: true }
}

// === GET BERICHTEN + MARK AS READ ===
export async function getBerichten(offerteId: string) {
  const ctx = await getKlantContext()
  if (!ctx) return []

  const supabaseAdmin = createAdminClient()

  // Verify access
  const { data: offerte } = await supabaseAdmin
    .from('offertes')
    .select('id, relatie_id')
    .eq('id', offerteId)
    .single()

  if (!offerte || !ctx.relatieIds.includes(offerte.relatie_id)) return []

  // Mark unread medewerker messages as gelezen
  await supabaseAdmin
    .from('berichten')
    .update({ gelezen: true })
    .eq('offerte_id', offerteId)
    .eq('afzender_type', 'medewerker')
    .eq('gelezen', false)

  // Fetch all berichten
  const { data } = await supabaseAdmin
    .from('berichten')
    .select('*')
    .eq('offerte_id', offerteId)
    .order('created_at', { ascending: true })

  return data || []
}

// === ACCEPT OFFERTE FROM PORTAL ===
export async function acceptOffertePortaal(id: string) {
  const ctx = await getKlantContext()
  if (!ctx) return { error: 'Niet ingelogd' }

  const supabaseAdmin = createAdminClient()

  const { data: offerte, error: fetchError } = await supabaseAdmin
    .from('offertes')
    .select('id, status, administratie_id, relatie_id, onderwerp, subtotaal, btw_totaal, totaal')
    .eq('id', id)
    .single()

  if (fetchError || !offerte) return { error: 'Offerte niet gevonden' }
  if (!ctx.relatieIds.includes(offerte.relatie_id)) return { error: 'Geen toegang' }
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

  revalidatePath('/portaal/offertes')
  revalidatePath(`/portaal/offertes/${id}`)
  return { success: true }
}
