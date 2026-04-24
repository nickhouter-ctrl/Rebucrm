import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'

export const maxDuration = 300
export const dynamic = 'force-dynamic'

/**
 * Maakt een volledige JSON-dump van alle kritische tabellen en slaat die op
 * in een private Supabase Storage bucket ('db-backups'). Bewaart automatisch
 * de laatste 14 dagen. Triggeren:
 *  - Vercel Cron dagelijks om 03:00 UTC (vercel.json)
 *  - Handmatig via curl met x-admin-key header = SUPABASE_SERVICE_ROLE_KEY
 */

const TABLES = [
  'administraties', 'profielen', 'medewerkers', 'klant_relaties',
  'relaties', 'contactpersonen', 'projecten',
  'offertes', 'offerte_regels',
  'orders', 'order_medewerkers', 'order_regels',
  'facturen', 'factuur_regels',
  'producten', 'notities', 'taak_notities', 'taken',
  'email_log', 'emails', 'berichten', 'leads',
  'inkoopfacturen', 'inkoopfactuur_regels',
  'faalkosten', 'ai_tekening_template',
]

export async function GET(req: NextRequest) {
  return handle(req)
}
export async function POST(req: NextRequest) {
  return handle(req)
}

async function handle(req: NextRequest) {
  // Auth: óf x-admin-key header met service role, óf Vercel Cron signature
  const adminKey = req.headers.get('x-admin-key')
  const cronHeader = req.headers.get('x-vercel-cron')
  const autorized = adminKey === process.env.SUPABASE_SERVICE_ROLE_KEY || !!cronHeader
  if (!autorized) return NextResponse.json({ error: 'forbidden' }, { status: 403 })

  const sb = createAdminClient()

  const dump: Record<string, unknown> = { _meta: { generated_at: new Date().toISOString(), tables: TABLES } }
  let totalRows = 0
  for (const t of TABLES) {
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const all: any[] = []
      let from = 0
      while (true) {
        const to = from + 999
        const { data, error } = await sb.from(t).select('*').range(from, to)
        if (error) { dump[t] = { error: error.message }; break }
        if (!data || data.length === 0) break
        all.push(...data)
        if (data.length < 1000) break
        from += 1000
      }
      dump[t] = all
      totalRows += all.length
    } catch (e) {
      dump[t] = { error: e instanceof Error ? e.message : String(e) }
    }
  }

  // Zorg dat de bucket bestaat
  const buckets = await sb.storage.listBuckets()
  if (!buckets.data?.find(b => b.name === 'db-backups')) {
    await sb.storage.createBucket('db-backups', { public: false })
  }

  const dateStr = new Date().toISOString().slice(0, 10)
  const path = `${dateStr}/backup-${Date.now()}.json`
  const json = JSON.stringify(dump)
  const bytes = Buffer.byteLength(json, 'utf-8')

  const { error: upErr } = await sb.storage.from('db-backups').upload(path, json, {
    contentType: 'application/json',
    upsert: true,
  })
  if (upErr) return NextResponse.json({ error: upErr.message }, { status: 500 })

  // Ruim oude backups op (> 14 dagen)
  try {
    const cutoff = Date.now() - 14 * 24 * 60 * 60 * 1000
    const { data: folders } = await sb.storage.from('db-backups').list('', { limit: 100 })
    for (const f of folders || []) {
      // folder-naam is datum (YYYY-MM-DD)
      const d = new Date(f.name).getTime()
      if (isNaN(d) || d > cutoff) continue
      const { data: files } = await sb.storage.from('db-backups').list(f.name)
      const paths = (files || []).map(x => `${f.name}/${x.name}`)
      if (paths.length > 0) await sb.storage.from('db-backups').remove(paths)
    }
  } catch (err) {
    console.warn('Oude backups opruimen mislukt:', err)
  }

  return NextResponse.json({ success: true, path, rows: totalRows, bytes })
}
