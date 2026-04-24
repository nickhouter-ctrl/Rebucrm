'use server'

import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { revalidatePath } from 'next/cache'
import { buildRebuEmailHtml } from '@/lib/email-template'
import { sendEmail } from '@/lib/email'
import { createMolliePayment } from '@/lib/mollie'

// === HELPER: genereer Mollie betaallink voor een factuur als die nog niet bestaat ===
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function zorgVoorBetaallinkAdmin(factuurId: string, sb: any): Promise<string | null> {
  try {
    const { data: f } = await sb.from('facturen')
      .select('id, factuurnummer, totaal, betaald_bedrag, status, betaal_link')
      .eq('id', factuurId).single()
    if (!f) return null
    if (f.betaal_link) return f.betaal_link
    if (['concept', 'gecrediteerd', 'geannuleerd'].includes(f.status)) return null
    const openstaand = Number(f.totaal || 0) - Number(f.betaald_bedrag || 0)
    if (openstaand <= 0) return null
    if (!process.env.MOLLIE_API_KEY) return null
    const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://rebucrm.vercel.app'
    const payment = await createMolliePayment({
      amount: openstaand,
      description: `Factuur ${f.factuurnummer}`,
      redirectUrl: `${appUrl}/betaling/succes`,
      webhookUrl: `${appUrl}/api/mollie/webhook`,
    })
    await sb.from('facturen').update({ mollie_payment_id: payment.id, betaal_link: payment.checkoutUrl }).eq('id', f.id)
    return payment.checkoutUrl
  } catch (err) {
    console.error('zorgVoorBetaallinkAdmin fout:', err)
    return null
  }
}

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
    recenteEmails: await (async () => {
      // Verzonden mails (vanuit CRM) naar klant — uit email_log
      const { data } = await supabaseAdmin
        .from('email_log')
        .select('id, aan, onderwerp, verstuurd_op, offerte_id, offerte:offertes(offertenummer)')
        .in('relatie_id', ctx.relatieIds)
        .order('verstuurd_op', { ascending: false })
        .limit(10)
      return (data || []).map(e => ({
        id: e.id as string,
        aan: (e.aan as string) || '',
        onderwerp: (e.onderwerp as string) || '(geen onderwerp)',
        verstuurd_op: e.verstuurd_op as string,
        offerte_id: (e.offerte_id as string) || null,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        offertenummer: ((e.offerte as any)?.offertenummer) || null,
      }))
    })(),
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

  let orderId: string | null = existingOrder?.id || null

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

    if (order) {
      orderId = order.id
      if (regels && regels.length > 0) {
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
  }

  // Auto-facturatie na acceptatie
  try {
    await autoFacturerenNaAcceptatie(offerte, orderId, supabaseAdmin)
  } catch (err) {
    console.error('Auto-facturatie na acceptatie mislukt:', err)
    // Factuur aanmaken faalt, maar offerte+order zijn al aangemaakt — geen rollback
  }

  revalidatePath('/portaal/offertes')
  revalidatePath(`/portaal/offertes/${id}`)
  revalidatePath('/portaal/facturen')
  return { success: true }
}

// === AUTO-FACTURATIE NA OFFERTE ACCEPTATIE ===
async function autoFacturerenNaAcceptatie(
  offerte: {
    id: string
    administratie_id: string
    relatie_id: string
    onderwerp: string | null
    subtotaal: number
    btw_totaal: number
    totaal: number
  },
  orderId: string | null,
  supabaseAdmin: ReturnType<typeof createAdminClient>
) {
  const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'
  const vandaag = new Date().toISOString().split('T')[0]
  const vervaldatum = new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]

  // Haal offerte regels + relatie op
  const [regelsRes, relatieRes] = await Promise.all([
    supabaseAdmin
      .from('offerte_regels')
      .select('*')
      .eq('offerte_id', offerte.id)
      .order('volgorde'),
    supabaseAdmin
      .from('relaties')
      .select('*')
      .eq('id', offerte.relatie_id)
      .single(),
  ])
  const offerteRegels = regelsRes.data || []
  const relatie = relatieRes.data

  // Haal offertenummer op voor omschrijving
  const { data: offerteData } = await supabaseAdmin
    .from('offertes')
    .select('offertenummer')
    .eq('id', offerte.id)
    .single()
  const offertenummer = offerteData?.offertenummer || ''

  const isSplit = (offerte.subtotaal || 0) >= 3500
  let factuurIdToSend: string | null = null

  if (!isSplit) {
    // === Eén factuur van 100% ===
    const { data: nummer } = await supabaseAdmin.rpc('volgende_nummer', {
      p_administratie_id: offerte.administratie_id,
      p_type: 'factuur',
    })

    const { data: factuur, error: factuurErr } = await supabaseAdmin
      .from('facturen')
      .insert({
        administratie_id: offerte.administratie_id,
        relatie_id: offerte.relatie_id,
        offerte_id: offerte.id,
        order_id: orderId,
        factuur_type: 'volledig',
        factuurnummer: nummer || '',
        datum: vandaag,
        vervaldatum,
        status: 'verzonden',
        onderwerp: offerte.onderwerp,
        subtotaal: offerte.subtotaal,
        btw_totaal: offerte.btw_totaal,
        totaal: offerte.totaal,
      })
      .select('id')
      .single()

    if (factuurErr || !factuur) {
      console.error('Factuur aanmaken mislukt:', factuurErr)
      return
    }

    // Factuur regels
    if (offerteRegels.length > 0) {
      await supabaseAdmin.from('factuur_regels').insert(
        offerteRegels.map((r: { product_id?: string; omschrijving: string; aantal: number; prijs: number; btw_percentage: number; totaal: number }, i: number) => ({
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

    await zorgVoorBetaallinkAdmin(factuur.id, supabaseAdmin)
    factuurIdToSend = factuur.id
  } else {
    // === Split: 70% aanbetaling + 30% restbetaling ===
    const aanbetalingPercentage = 70
    const factor = aanbetalingPercentage / 100

    const aanbetalingSubtotaal = Math.round(offerte.subtotaal * factor * 100) / 100
    const aanbetalingBtw = Math.round(offerte.btw_totaal * factor * 100) / 100
    const aanbetalingTotaal = aanbetalingSubtotaal + aanbetalingBtw

    const restSubtotaal = offerte.subtotaal - aanbetalingSubtotaal
    const restBtw = offerte.btw_totaal - aanbetalingBtw
    const restTotaal = restSubtotaal + restBtw

    // Genereer 2 factuurnummers
    const { data: nummer1 } = await supabaseAdmin.rpc('volgende_nummer', {
      p_administratie_id: offerte.administratie_id,
      p_type: 'factuur',
    })
    const { data: nummer2 } = await supabaseAdmin.rpc('volgende_nummer', {
      p_administratie_id: offerte.administratie_id,
      p_type: 'factuur',
    })

    // Factuur 1: aanbetaling 70% — status 'verzonden'
    const { data: factuur1, error: err1 } = await supabaseAdmin
      .from('facturen')
      .insert({
        administratie_id: offerte.administratie_id,
        relatie_id: offerte.relatie_id,
        offerte_id: offerte.id,
        order_id: orderId,
        factuur_type: 'aanbetaling',
        factuurnummer: nummer1 || '',
        datum: vandaag,
        vervaldatum,
        status: 'verzonden',
        onderwerp: `Aanbetaling ${aanbetalingPercentage}% - ${offerte.onderwerp || offertenummer}`,
        subtotaal: aanbetalingSubtotaal,
        btw_totaal: aanbetalingBtw,
        totaal: aanbetalingTotaal,
      })
      .select('id')
      .single()

    if (err1 || !factuur1) {
      console.error('Aanbetaling factuur aanmaken mislukt:', err1)
      return
    }

    await supabaseAdmin.from('factuur_regels').insert({
      factuur_id: factuur1.id,
      omschrijving: `Aanbetaling ${aanbetalingPercentage}% offerte ${offertenummer}`,
      aantal: 1,
      prijs: aanbetalingSubtotaal,
      btw_percentage: 21,
      totaal: aanbetalingSubtotaal,
      volgorde: 0,
    })

    await zorgVoorBetaallinkAdmin(factuur1.id, supabaseAdmin)

    // Factuur 2: restbetaling 30% — status 'concept'
    const { data: factuur2, error: err2 } = await supabaseAdmin
      .from('facturen')
      .insert({
        administratie_id: offerte.administratie_id,
        relatie_id: offerte.relatie_id,
        offerte_id: offerte.id,
        order_id: orderId,
        factuur_type: 'restbetaling',
        gerelateerde_factuur_id: factuur1.id,
        factuurnummer: nummer2 || '',
        datum: vandaag,
        vervaldatum: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
        status: 'concept',
        onderwerp: `Restbetaling 30% - ${offerte.onderwerp || offertenummer}`,
        subtotaal: restSubtotaal,
        btw_totaal: restBtw,
        totaal: restTotaal,
      })
      .select('id')
      .single()

    if (err2 || !factuur2) {
      console.error('Restbetaling factuur aanmaken mislukt:', err2)
    } else {
      await supabaseAdmin.from('factuur_regels').insert({
        factuur_id: factuur2.id,
        omschrijving: `Restbetaling 30% offerte ${offertenummer}`,
        aantal: 1,
        prijs: restSubtotaal,
        btw_percentage: 21,
        totaal: restSubtotaal,
        volgorde: 0,
      })

      // Link factuur1 terug naar factuur2
      await supabaseAdmin
        .from('facturen')
        .update({ gerelateerde_factuur_id: factuur2.id })
        .eq('id', factuur1.id)
    }

    factuurIdToSend = factuur1.id
  }

  if (!factuurIdToSend) return

  // === Haal volledige factuur op voor PDF + email ===
  const { data: factuurVolledig } = await supabaseAdmin
    .from('facturen')
    .select('*, relatie:relaties(*), regels:factuur_regels(*)')
    .eq('id', factuurIdToSend)
    .single()

  if (!factuurVolledig) return

  // === Mollie betaallink ===
  let betaalLink: string | null = null
  try {
    const payment = await createMolliePayment({
      amount: factuurVolledig.totaal,
      description: `Factuur ${factuurVolledig.factuurnummer}`,
      redirectUrl: `${appUrl}/betaling/succes`,
      webhookUrl: `${appUrl}/api/mollie/webhook`,
    })

    betaalLink = payment.checkoutUrl || null

    await supabaseAdmin
      .from('facturen')
      .update({
        mollie_payment_id: payment.id,
        betaal_link: betaalLink,
      })
      .eq('id', factuurIdToSend)
  } catch (err) {
    console.error('Mollie betaallink genereren mislukt:', err)
    // Factuur is aangemaakt, maar zonder betaallink — ga door met email
  }

  // === Email versturen ===
  const emailTo = relatie?.email
  if (!emailTo) {
    console.error('Geen e-mailadres voor relatie, email niet verstuurd')
    return
  }

  const klantNaam = relatie?.contactpersoon || relatie?.bedrijfsnaam || ''
  const totaalFormatted = new Intl.NumberFormat('nl-NL', { style: 'currency', currency: 'EUR' }).format(factuurVolledig.totaal || 0)
  const vervaldatumFormatted = factuurVolledig.vervaldatum
    ? new Date(factuurVolledig.vervaldatum).toLocaleDateString('nl-NL')
    : 'n.v.t.'

  const betaalSectie = betaalLink
    ? `U kunt direct online betalen via de volgende link:\n${betaalLink}\n\nOf maak het bedrag over naar:`
    : `Wij verzoeken u het factuurbedrag voor de vervaldatum over te maken naar:`

  const emailBody = `Beste ${klantNaam},

Bijgevoegd treft u de factuur aan voor ${factuurVolledig.onderwerp || factuurVolledig.factuurnummer}:
- Factuurnummer: ${factuurVolledig.factuurnummer}
- Factuurbedrag: ${totaalFormatted}
- Vervaldatum: ${vervaldatumFormatted}

${betaalSectie}
IBAN: NL80 INGB 0675 6102 73
T.n.v. Rebu Kozijnen B.V.
O.v.v. ${factuurVolledig.factuurnummer}

Mocht u vragen hebben over deze factuur, neem dan gerust contact met ons op.

Met vriendelijke groet,
Rebu Kozijnen`

  const emailHtml = buildRebuEmailHtml(emailBody)

  // Genereer factuur PDF
  const attachments: { filename: string; content: Buffer }[] = []
  try {
    const { renderToBuffer } = await import('@react-pdf/renderer')
    const { FactuurDocument } = await import('@/lib/pdf/factuur-template')
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const pdfBuffer = await renderToBuffer(FactuurDocument({ factuur: factuurVolledig }) as any)
    attachments.push({
      filename: `Factuur-${factuurVolledig.factuurnummer}.pdf`,
      content: Buffer.from(pdfBuffer),
    })
  } catch (err) {
    console.error('Factuur PDF generatie mislukt:', err)
  }

  // Verstuur email
  try {
    await sendEmail({
      to: emailTo,
      subject: `Factuur ${factuurVolledig.factuurnummer} - Rebu Kozijnen`,
      html: emailHtml,
      attachments: attachments.map(a => ({
        filename: a.filename,
        content: a.content,
      })),
    })
  } catch (err) {
    console.error('Factuur e-mail verzenden mislukt:', err)
    // Factuur is aangemaakt, maar email niet verstuurd
    return
  }

  // Log email
  const bijlagenMeta = attachments.map(a => ({ filename: a.filename }))
  await supabaseAdmin.from('email_log').insert({
    administratie_id: offerte.administratie_id,
    factuur_id: factuurIdToSend,
    relatie_id: offerte.relatie_id,
    aan: emailTo,
    onderwerp: `Factuur ${factuurVolledig.factuurnummer} - Rebu Kozijnen`,
    body_html: emailHtml,
    bijlagen: bijlagenMeta,
    verstuurd_door: null, // Auto-gegenereerd door systeem
  })

  // SnelStart sync — alleen nieuwe facturen (auto-aangemaakt bij acceptatie)
  try {
    const { isSnelStartEnabled } = await import('@/lib/snelstart')
    if (isSnelStartEnabled() && !factuurVolledig.snelstart_synced_at && !factuurVolledig.snelstart_boeking_id) {
      const { pushFactuurToSnelStart } = await import('@/lib/actions')
      await pushFactuurToSnelStart(factuurIdToSend).catch(err => {
        console.error('SnelStart push mislukt voor auto-factuur', factuurIdToSend, err)
      })
    }
  } catch (err) {
    console.error('SnelStart integratie fout in portaal:', err)
  }
}
