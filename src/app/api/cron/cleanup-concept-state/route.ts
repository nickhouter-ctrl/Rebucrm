import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'

// Cleanup-cron: verwijdert offerte_concept_state records die approved zijn
// en ouder dan 30 dagen, plus afgekeurde concepten ouder dan 90 dagen.
// Wordt dagelijks aangeroepen door Vercel cron (zie vercel.json).

export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  // Vercel cron stuurt automatisch een Authorization header met CRON_SECRET
  const auth = req.headers.get('authorization')
  if (process.env.CRON_SECRET && auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  }

  const sb = createAdminClient()
  const dertigDagenGeleden = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString()
  const negentigDagenGeleden = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString()

  // Approved (klaar) → 30 dagen bewaren voor audit
  const { data: deletedApproved, error: e1 } = await sb
    .from('offerte_concept_state')
    .delete()
    .eq('approved', true)
    .lt('updated_at', dertigDagenGeleden)
    .select('id')

  // Onafgemaakt (geen approve) → 90 dagen
  const { data: deletedAbandoned, error: e2 } = await sb
    .from('offerte_concept_state')
    .delete()
    .eq('approved', false)
    .lt('updated_at', negentigDagenGeleden)
    .select('id')

  if (e1 || e2) {
    return NextResponse.json({
      error: e1?.message || e2?.message,
      approved_deleted: deletedApproved?.length || 0,
      abandoned_deleted: deletedAbandoned?.length || 0,
    }, { status: 500 })
  }

  // Wizard-draft projecten: aangemaakt via createProjectInline tijdens een
  // offerte-wizard. Als er na 24u nog geen offerte aan hangt, is de wizard
  // afgebroken zonder save → opruimen. Taken worden ontkoppeld zodat ze op
  // de relatie blijven hangen.
  const eenDagGeleden = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()
  const { data: draftCandidates } = await sb
    .from('projecten')
    .select('id, offertes:offertes(id), taken:taken(id), notities:notities(id)')
    .eq('bron', 'wizard-draft')
    .lt('created_at', eenDagGeleden)

  // Alleen écht lege, verlaten wizard-drafts opruimen: geen offerte, EN geen
  // taken, EN geen notities. Zo kan een gebruiker die handmatig een taak of
  // notitie aan zo'n project hing nooit data kwijtraken door deze cleanup.
  type DraftRow = { id: string; offertes?: unknown[]; taken?: unknown[]; notities?: unknown[] }
  const draftIds = ((draftCandidates || []) as DraftRow[])
    .filter(p => !p.offertes?.length && !p.taken?.length && !p.notities?.length)
    .map(p => p.id)
  let draftsDeleted = 0
  if (draftIds.length > 0) {
    const BATCH = 200
    for (let i = 0; i < draftIds.length; i += BATCH) {
      const batch = draftIds.slice(i, i + BATCH)
      await sb.from('taken').update({ project_id: null }).in('project_id', batch)
      await sb.from('notities').delete().in('project_id', batch)
      await sb.from('projecten').delete().in('id', batch)
    }
    draftsDeleted = draftIds.length
  }

  return NextResponse.json({
    approved_deleted: deletedApproved?.length || 0,
    abandoned_deleted: deletedAbandoned?.length || 0,
    wizard_drafts_deleted: draftsDeleted,
  })
}
