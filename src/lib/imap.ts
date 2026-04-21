import { ImapFlow } from 'imapflow'
import { simpleParser } from 'mailparser'
import { createAdminClient } from '@/lib/supabase/admin'

export function createImapClient() {
  return new ImapFlow({
    host: process.env.IMAP_HOST || 'imap.gmail.com',
    port: parseInt(process.env.IMAP_PORT || '993'),
    secure: true,
    auth: {
      user: process.env.SMTP_USER || '',
      pass: process.env.SMTP_PASS || '',
    },
    logger: false,
  })
}

interface ParsedEmail {
  message_id: string | null
  in_reply_to: string | null
  reference_ids: string[]
  van_email: string
  van_naam: string | null
  aan_email: string
  onderwerp: string | null
  body_text: string | null
  body_html: string | null
  datum: string
  imap_uid: number
}

function parseAddress(addr: { address?: string; name?: string } | { address?: string; name?: string }[] | undefined): { email: string; naam: string | null } {
  if (!addr) return { email: '', naam: null }
  const first = Array.isArray(addr) ? addr[0] : addr
  return { email: first?.address || '', naam: first?.name || null }
}

export type EmailClassificatie = 'offerte_aanvraag' | 'offerte_reactie' | 'onzeker' | 'irrelevant'

const IRRELEVANT_AFZENDER_PREFIXES = [
  'no-reply@', 'noreply@', 'mailer-daemon@', 'notifications@', 'bounce@',
  'auto-', 'donotreply@', 'no_reply@',
]

const IRRELEVANT_DOMEINEN = [
  'mailchimp.com', 'sendgrid.net', 'facebookmail.com', 'linkedin.com',
  'amazonses.com', 'mandrillapp.com', 'mailgun.org', 'constantcontact.com',
  'hubspot.com', 'sendinblue.com', 'brevo.com', 'mailerlite.com',
]

const IRRELEVANT_ONDERWERP_KEYWORDS = [
  'newsletter', 'nieuwsbrief', 'unsubscribe', 'uitschrijven',
  'afwezigbericht', 'out of office', 'auto-reply', 'autoreply',
  'automatic reply', 'automatisch antwoord', 'delivery status',
  'mailer-daemon', 'failure notice', 'undeliverable',
]

const PRODUCT_KEYWORDS = [
  'kozijn', 'kozijnen', 'raam', 'ramen', 'deur', 'deuren',
  'schuifpui', 'voordeur', 'achterdeur', 'dakkapel',
  'glas', 'beglazing', 'dubbel glas', 'triple glas',
  'draaikiepraam', 'vouwwand', 'openslaande', 'tuindeur',
  'rolluik', 'screen', 'zonwering',
]

const INTENT_KEYWORDS = [
  'offerte', 'prijsopgave', 'aanvraag', 'prijs', 'kosten',
  'prijsindicatie', 'kostenplaatje', 'begroting', 'calculatie',
]

const MATERIAAL_SERVICE_KEYWORDS = [
  'kunststof', 'pvc', 'aluminium', 'hout', 'hr++', 'hr+',
  'triple', 'dubbel', 'montage', 'vervangen', 'plaatsen',
  'renovatie', 'nieuwbouw', 'verbouwing', 'isolatie',
]

export function classifyEmail(
  onderwerp: string | null,
  vanEmail: string,
  inReplyTo: string | null,
  hasOfferteMatch: boolean,
  hasRelatieMatch: boolean,
): EmailClassificatie {
  const sub = (onderwerp || '').toLowerCase()
  const email = vanEmail.toLowerCase()
  const domein = email.split('@')[1] || ''

  // 1. Irrelevant check
  if (IRRELEVANT_AFZENDER_PREFIXES.some(p => email.startsWith(p) || email.includes(p))) {
    return 'irrelevant'
  }
  if (IRRELEVANT_DOMEINEN.some(d => domein === d || domein.endsWith('.' + d))) {
    return 'irrelevant'
  }
  if (IRRELEVANT_ONDERWERP_KEYWORDS.some(kw => sub.includes(kw))) {
    return 'irrelevant'
  }

  // 2. Offerte reactie: matcht bestaande offerte
  if (hasOfferteMatch) {
    return 'offerte_reactie'
  }

  // 3. Offerte aanvraag: product + intent keywords
  const isReply = sub.startsWith('re:') || sub.startsWith('fw:') || sub.startsWith('fwd:') || !!inReplyTo
  const hasProduct = PRODUCT_KEYWORDS.some(kw => sub.includes(kw))
  const hasIntent = INTENT_KEYWORDS.some(kw => sub.includes(kw))
  const hasMateriaal = MATERIAAL_SERVICE_KEYWORDS.some(kw => sub.includes(kw))

  if (hasProduct && hasIntent) return 'offerte_aanvraag'
  if (hasIntent && !isReply) return 'offerte_aanvraag'
  if (hasProduct && hasMateriaal) return 'offerte_aanvraag'

  // 4. Onzeker: partial match or unknown sender
  if (hasProduct || hasIntent || hasMateriaal) return 'onzeker'
  if (!hasRelatieMatch) return 'onzeker'

  // Known relatie but no recognizable pattern
  return 'onzeker'
}

export async function syncEmails(administratieId: string) {
  const supabase = createAdminClient()

  // Get or create sync state
  let { data: syncState } = await supabase
    .from('email_sync_state')
    .select('*')
    .eq('administratie_id', administratieId)
    .maybeSingle()

  if (!syncState) {
    const { data: newState } = await supabase
      .from('email_sync_state')
      .insert({ administratie_id: administratieId, laatste_uid: 0 })
      .select()
      .single()
    syncState = newState
  }

  // Mark as syncing
  await supabase
    .from('email_sync_state')
    .update({ status: 'syncing', updated_at: new Date().toISOString() })
    .eq('administratie_id', administratieId)

  const client = createImapClient()
  const newEmails: ParsedEmail[] = []

  try {
    await client.connect()
    const lock = await client.getMailboxLock('INBOX')

    try {
      const laatsteUid = syncState?.laatste_uid || 0
      const isFirstSync = laatsteUid === 0

      // Get UIDs to fetch
      let uids: number[] = []

      if (isFirstSync) {
        // First sync: use SEARCH to find emails from last 30 days
        const sinceDate = new Date()
        sinceDate.setDate(sinceDate.getDate() - 30)
        uids = await client.search({ since: sinceDate }, { uid: true }) as number[]
      } else {
        // Incremental: fetch UIDs > laatsteUid
        uids = await client.search({ uid: `${laatsteUid + 1}:*` }, { uid: true }) as number[]
        uids = uids.filter(uid => uid > laatsteUid)
      }

      if (uids.length === 0) {
        lock.release()
        await client.logout()
        await supabase
          .from('email_sync_state')
          .update({ laatste_sync: new Date().toISOString(), status: 'idle', updated_at: new Date().toISOString() })
          .eq('administratie_id', administratieId)
        return { synced: 0 }
      }

      // Fetch envelope + headers (fast) for found UIDs
      const uidRange = uids.join(',')
      for await (const message of client.fetch(uidRange, {
        envelope: true,
        uid: true,
        headers: ['references', 'in-reply-to'],
      }, { uid: true })) {

        const envelope = message.envelope
        if (!envelope) continue

        const from = parseAddress(envelope.from as { address?: string; name?: string }[])
        const to = parseAddress(envelope.to as { address?: string; name?: string }[])

        // Parse References from headers
        const referenceIds: string[] = []
        if (message.headers) {
          const headerStr = message.headers.toString()
          const refMatch = headerStr.match(/^References:\s*([\s\S]*?)(?=\r?\n\S|\r?\n\r?\n|$)/mi)
          if (refMatch) {
            const refs = refMatch[1].match(/<[^>]+>/g)
            if (refs) referenceIds.push(...refs)
          }
        }

        newEmails.push({
          message_id: envelope.messageId || null,
          in_reply_to: envelope.inReplyTo || null,
          reference_ids: referenceIds,
          van_email: from.email,
          van_naam: from.naam,
          aan_email: to.email,
          onderwerp: envelope.subject || null,
          body_text: null,
          body_html: null,
          datum: envelope.date ? new Date(envelope.date).toISOString() : new Date().toISOString(),
          imap_uid: message.uid,
        })
      }
    } finally {
      lock.release()
    }

    await client.logout()
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : 'Onbekende fout'
    await supabase
      .from('email_sync_state')
      .update({ status: 'error', error_bericht: errorMsg, updated_at: new Date().toISOString() })
      .eq('administratie_id', administratieId)
    throw error
  }

  // Process and store new emails — batch approach for speed
  let maxUid = syncState?.laatste_uid || 0
  const isFirstSync = (syncState?.laatste_uid || 0) === 0

  // All "our" email addresses for direction detection
  const onzeAdressen = new Set([
    (process.env.SMTP_USER || '').toLowerCase(),
    'info@rebukozijnen.nl',
    'nick@rebukozijnen.nl',
    'n.burgers@rebukozijnen.nl',
    'verkoop@rebukozijnen.nl',
  ].filter(Boolean))

  // Pre-load all relaties for fast email matching
  const { data: alleRelaties } = await supabase
    .from('relaties')
    .select('id, email')
    .eq('administratie_id', administratieId)
  const relatieEmailMap = new Map<string, string>()
  for (const r of alleRelaties || []) {
    if (r.email) relatieEmailMap.set(r.email.toLowerCase(), r.id)
  }

  // Pre-check which emails match an offerte by subject (OFF-xxx pattern)
  const offerteMatchSet = new Set<number>()
  for (const email of newEmails) {
    if (email.onderwerp && /OFF-\d+/i.test(email.onderwerp)) {
      offerteMatchSet.add(email.imap_uid)
    }
  }

  // Pre-load meest recente actieve verkoopkans per relatie voor project_id matching
  const relatieIds = [...new Set([...relatieEmailMap.values()])]
  const relatieProjectMap = new Map<string, string>()
  if (relatieIds.length > 0) {
    const { data: actieveProjecten } = await supabase
      .from('projecten')
      .select('id, relatie_id')
      .eq('administratie_id', administratieId)
      .eq('status', 'actief')
      .in('relatie_id', relatieIds)
      .order('created_at', { ascending: false })
    for (const p of actieveProjecten || []) {
      // Alleen de eerste (meest recente) per relatie opslaan
      if (!relatieProjectMap.has(p.relatie_id)) {
        relatieProjectMap.set(p.relatie_id, p.id)
      }
    }
  }

  // Build insert batch
  const inserts = newEmails.map(email => {
    const richting = onzeAdressen.has(email.van_email.toLowerCase()) ? 'uitgaand' : 'inkomend'
    const matchEmail = richting === 'inkomend' ? email.van_email : email.aan_email
    const relatieId = relatieEmailMap.get(matchEmail.toLowerCase()) || null

    const labels: string[] = []
    let verwerkt = isFirstSync

    // Classify inkomende emails
    if (richting === 'inkomend') {
      const classificatie = classifyEmail(
        email.onderwerp,
        email.van_email,
        email.in_reply_to,
        offerteMatchSet.has(email.imap_uid),
        !!relatieId,
      )
      labels.push(classificatie)

      if (!isFirstSync) {
        // irrelevant emails are auto-verwerkt
        if (classificatie === 'irrelevant') verwerkt = true
      }
    }

    if (email.imap_uid > maxUid) maxUid = email.imap_uid

    // Match project_id via relatie
    const matchedProjectId = relatieId ? (relatieProjectMap.get(relatieId) || null) : null

    return {
      administratie_id: administratieId,
      message_id: email.message_id,
      in_reply_to: email.in_reply_to,
      reference_ids: email.reference_ids,
      van_email: email.van_email,
      van_naam: email.van_naam,
      aan_email: email.aan_email,
      onderwerp: email.onderwerp,
      body_text: email.body_text,
      body_html: email.body_html,
      datum: email.datum,
      richting,
      relatie_id: relatieId,
      offerte_id: null as string | null,
      project_id: matchedProjectId,
      labels,
      imap_uid: email.imap_uid,
      imap_folder: 'INBOX',
      gelezen: richting === 'uitgaand',
      verwerkt,
    }
  })

  // Insert emails in batches, skip duplicates
  if (inserts.length > 0) {
    const batchSize = 50
    for (let i = 0; i < inserts.length; i += batchSize) {
      const batch = inserts.slice(i, i + batchSize)
      // Filter out emails with message_ids that already exist
      const messageIds = batch.map(e => e.message_id).filter(Boolean)
      let existingIds = new Set<string>()
      if (messageIds.length > 0) {
        const { data: existing } = await supabase
          .from('emails')
          .select('message_id')
          .eq('administratie_id', administratieId)
          .in('message_id', messageIds)
        existingIds = new Set((existing || []).map(e => e.message_id))
      }
      const newBatch = batch.filter(e => !e.message_id || !existingIds.has(e.message_id))
      if (newBatch.length > 0) {
        await supabase.from('emails').insert(newBatch)
      }
    }
  }

  // Only process new emails for tasks on incremental syncs (not first sync)
  if (!isFirstSync) {
    for (const email of newEmails) {
      const richting = onzeAdressen.has(email.van_email.toLowerCase()) ? 'uitgaand' : 'inkomend'
      if (richting !== 'inkomend') continue

      const relatieId = relatieEmailMap.get(email.van_email.toLowerCase()) || null
      const classificatie = classifyEmail(
        email.onderwerp,
        email.van_email,
        email.in_reply_to,
        offerteMatchSet.has(email.imap_uid),
        !!relatieId,
      )

      // irrelevant & onzeker: no automatic actions (onzeker waits for triage)
      if (classificatie === 'irrelevant' || classificatie === 'onzeker') continue

      const offerteId = await matchEmailToOfferte(email.onderwerp, email.in_reply_to, administratieId, supabase)
      await processNewEmail(email, classificatie, administratieId, relatieId, offerteId, supabase)
    }
  }

  // Update sync state
  await supabase
    .from('email_sync_state')
    .update({
      laatste_uid: maxUid,
      laatste_sync: new Date().toISOString(),
      status: 'idle',
      error_bericht: null,
      updated_at: new Date().toISOString(),
    })
    .eq('administratie_id', administratieId)

  return { synced: newEmails.length }
}

// Fetch email body on-demand by IMAP UID
export async function fetchEmailBody(imapUid: number): Promise<{ text: string | null; html: string | null }> {
  const client = createImapClient()
  let text: string | null = null
  let html: string | null = null

  try {
    await client.connect()
    const lock = await client.getMailboxLock('INBOX')
    try {
      const msg = await client.fetchOne(String(imapUid), { source: true }, { uid: true }) as { source?: Buffer } | false
      if (msg && 'source' in msg && msg.source) {
        const parsed = await simpleParser(msg.source)
        text = parsed.text || null
        html = (typeof parsed.html === 'string' ? parsed.html : null)
      }
    } finally {
      lock.release()
    }
    await client.logout()
  } catch {
    // Ignore — body loading is best-effort
  }

  return { text, html }
}

// Fetch email attachments on-demand by IMAP UID
export async function fetchEmailAttachments(imapUid: number): Promise<{ filename: string; contentType: string; size: number; data: string }[]> {
  const client = createImapClient()
  const attachments: { filename: string; contentType: string; size: number; data: string }[] = []

  try {
    await client.connect()
    const lock = await client.getMailboxLock('INBOX')
    try {
      const msg = await client.fetchOne(String(imapUid), { source: true }, { uid: true }) as { source?: Buffer } | false
      if (msg && 'source' in msg && msg.source) {
        const source = msg.source.toString()

        // Find boundary from Content-Type header
        const boundaryMatch = source.match(/Content-Type:\s*multipart\/mixed[^]*?boundary="?([^\s";]+)"?/i)
        if (boundaryMatch) {
          const boundary = boundaryMatch[1]
          const parts = source.split('--' + boundary)

          for (const part of parts) {
            // Look for attachment parts (Content-Disposition: attachment)
            const dispositionMatch = part.match(/Content-Disposition:\s*attachment[^]*?filename="?([^";\r\n]+)"?/i)
            if (!dispositionMatch) continue

            const filename = dispositionMatch[1].trim()
            const contentTypeMatch = part.match(/Content-Type:\s*([^\s;\r\n]+)/i)
            const contentType = contentTypeMatch?.[1] || 'application/octet-stream'
            const encodingMatch = part.match(/Content-Transfer-Encoding:\s*(\S+)/i)
            const encoding = encodingMatch?.[1]?.toLowerCase() || ''

            // Extract body after double newline
            const bodyStart = part.indexOf('\r\n\r\n')
            if (bodyStart === -1) continue
            let body = part.substring(bodyStart + 4).trim()

            // Remove trailing boundary markers
            const endBoundary = body.indexOf('--' + boundary)
            if (endBoundary !== -1) body = body.substring(0, endBoundary).trim()

            let data: string
            if (encoding === 'base64') {
              data = body.replace(/\s/g, '')
            } else {
              data = Buffer.from(body).toString('base64')
            }

            const size = Math.ceil(data.length * 3 / 4)
            attachments.push({ filename, contentType, size, data })
          }
        }
      }
    } finally {
      lock.release()
    }
    await client.logout()
  } catch {
    // Attachment loading is best-effort
  }

  return attachments
}

async function matchEmailToRelatie(
  email: string,
  administratieId: string,
  supabase: ReturnType<typeof createAdminClient>
): Promise<string | null> {
  if (!email) return null
  const { data } = await supabase
    .from('relaties')
    .select('id')
    .eq('administratie_id', administratieId)
    .ilike('email', email)
    .limit(1)
    .maybeSingle()
  return data?.id || null
}

async function matchEmailToOfferte(
  onderwerp: string | null,
  inReplyTo: string | null,
  administratieId: string,
  supabase: ReturnType<typeof createAdminClient>
): Promise<string | null> {
  if (onderwerp) {
    const match = onderwerp.match(/OFF-\d+/i)
    if (match) {
      const { data } = await supabase
        .from('offertes')
        .select('id')
        .eq('administratie_id', administratieId)
        .ilike('offertenummer', match[0])
        .limit(1)
        .maybeSingle()
      if (data?.id) return data.id
    }
  }

  if (inReplyTo) {
    const { data } = await supabase
      .from('emails')
      .select('offerte_id')
      .eq('administratie_id', administratieId)
      .eq('message_id', inReplyTo)
      .not('offerte_id', 'is', null)
      .limit(1)
      .maybeSingle()
    if (data?.offerte_id) return data.offerte_id
  }

  return null
}

async function matchMedewerkerByEmail(
  aanEmail: string,
  administratieId: string,
  supabase: ReturnType<typeof createAdminClient>
): Promise<{ id: string; profiel_id: string | null } | null> {
  if (!aanEmail) return null
  const { data } = await supabase
    .from('medewerkers')
    .select('id, profiel_id')
    .eq('administratie_id', administratieId)
    .ilike('email', aanEmail.trim())
    .eq('actief', true)
    .maybeSingle()
  return data || null
}

async function processNewEmail(
  email: ParsedEmail,
  classificatie: EmailClassificatie,
  administratieId: string,
  relatieId: string | null,
  offerteId: string | null,
  supabase: ReturnType<typeof createAdminClient>
) {
  const toegewezenMedewerker = await matchMedewerkerByEmail(email.aan_email, administratieId, supabase)
  if (classificatie === 'offerte_aanvraag') {
    let finalRelatieId = relatieId
    if (!finalRelatieId) {
      // Create new relatie for unknown sender
      const { data: newRelatie } = await supabase
        .from('relaties')
        .insert({
          administratie_id: administratieId,
          bedrijfsnaam: email.van_naam || email.van_email,
          email: email.van_email,
          type: 'particulier',
        })
        .select('id')
        .single()

      if (newRelatie) {
        finalRelatieId = newRelatie.id
        await supabase
          .from('emails')
          .update({ relatie_id: newRelatie.id, verwerkt: true })
          .eq('administratie_id', administratieId)
          .eq('message_id', email.message_id)
      }
    } else {
      await supabase
        .from('emails')
        .update({ verwerkt: true })
        .eq('administratie_id', administratieId)
        .eq('message_id', email.message_id)
    }

    // Find or create project + concept offerte linked to the klant
    let conceptOfferteId: string | null = null
    let isNieuweVersie = false
    if (finalRelatieId) {
      const projectNaam = email.onderwerp || '(geen onderwerp)'

      // Check if a project with the same name already exists for this relatie
      const { data: bestaandProject } = await supabase
        .from('projecten')
        .select('id')
        .eq('administratie_id', administratieId)
        .eq('relatie_id', finalRelatieId)
        .ilike('naam', projectNaam)
        .limit(1)
        .maybeSingle()

      const projectId = bestaandProject?.id || null
      let finalProjectId = projectId

      if (!finalProjectId) {
        // Create new project
        const { data: newProject } = await supabase
          .from('projecten')
          .insert({
            administratie_id: administratieId,
            relatie_id: finalRelatieId,
            naam: projectNaam,
            status: 'actief',
          })
          .select('id')
          .single()
        finalProjectId = newProject?.id || null
      }

      // Check if an offerte already exists for this project → create new version
      let bestaandeOfferte: { id: string; offertenummer: string; groep_id: string | null; versie_nummer: number } | null = null
      if (finalProjectId) {
        const { data } = await supabase
          .from('offertes')
          .select('id, offertenummer, groep_id, versie_nummer')
          .eq('project_id', finalProjectId)
          .order('versie_nummer', { ascending: false })
          .limit(1)
          .maybeSingle()
        bestaandeOfferte = data
      }

      const vandaag = new Date().toISOString().split('T')[0]

      if (bestaandeOfferte) {
        // Create new version of existing offerte
        isNieuweVersie = true
        const groepId = bestaandeOfferte.groep_id || bestaandeOfferte.id
        const volgendVersie = bestaandeOfferte.versie_nummer + 1

        const { data: newOfferte } = await supabase
          .from('offertes')
          .insert({
            administratie_id: administratieId,
            relatie_id: finalRelatieId,
            project_id: finalProjectId,
            offertenummer: bestaandeOfferte.offertenummer,
            datum: vandaag,
            status: 'concept',
            onderwerp: projectNaam,
            subtotaal: 0,
            btw_totaal: 0,
            totaal: 0,
            versie_nummer: volgendVersie,
            groep_id: groepId,
          })
          .select('id')
          .single()
        conceptOfferteId = newOfferte?.id || null

        // Ensure groep_id is set on the original offerte
        if (!bestaandeOfferte.groep_id) {
          await supabase
            .from('offertes')
            .update({ groep_id: groepId })
            .eq('id', bestaandeOfferte.id)
        }
      } else {
        // Create brand new offerte
        const { data: offertenummer } = await supabase.rpc('volgende_nummer', {
          p_administratie_id: administratieId,
          p_type: 'offerte',
        })

        const { data: newOfferte } = await supabase
          .from('offertes')
          .insert({
            administratie_id: administratieId,
            relatie_id: finalRelatieId,
            project_id: finalProjectId,
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
    }

    await supabase.from('taken').insert({
      administratie_id: administratieId,
      titel: isNieuweVersie ? `Nieuwe versie aanvraag - ${email.onderwerp || '(geen onderwerp)'}` : `Nieuwe aanvraag - offerte nog te maken`,
      omschrijving: `E-mail ontvangen van ${email.van_naam || email.van_email}: "${email.onderwerp || '(geen onderwerp)'}"${conceptOfferteId ? ` [offerte:${conceptOfferteId}]` : ''}`,
      prioriteit: 'hoog',
      status: 'open',
      relatie_id: finalRelatieId,
      medewerker_id: toegewezenMedewerker?.id || null,
      toegewezen_aan: toegewezenMedewerker?.profiel_id || null,
    })
  } else if (classificatie === 'offerte_reactie' && offerteId) {
    const { data: offerte } = await supabase
      .from('offertes')
      .select('offertenummer')
      .eq('id', offerteId)
      .single()

    await supabase
      .from('emails')
      .update({ verwerkt: true, offerte_id: offerteId })
      .eq('administratie_id', administratieId)
      .eq('message_id', email.message_id)

    await supabase.from('taken').insert({
      administratie_id: administratieId,
      titel: `Offerte reactie: ${offerte?.offertenummer || 'onbekend'} - offerte aanpassen`,
      omschrijving: `Reactie ontvangen van ${email.van_naam || email.van_email}: "${email.onderwerp || '(geen onderwerp)'}"`,
      prioriteit: 'normaal',
      status: 'open',
      relatie_id: relatieId,
      offerte_id: offerteId,
      medewerker_id: toegewezenMedewerker?.id || null,
      toegewezen_aan: toegewezenMedewerker?.profiel_id || null,
    })
  }
}
