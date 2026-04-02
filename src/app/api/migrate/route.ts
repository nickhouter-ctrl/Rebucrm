import { createAdminClient } from '@/lib/supabase/admin'
import { NextResponse } from 'next/server'

export async function POST() {
  const supabase = createAdminClient()

  // 1. Add project_id column
  const { error: err1 } = await supabase.rpc('exec_sql' as never, {
    sql: 'ALTER TABLE emails ADD COLUMN IF NOT EXISTS project_id UUID REFERENCES projecten(id) ON DELETE SET NULL'
  } as never)

  // If rpc doesn't exist, try direct approach - just test if column exists
  const { error: testErr } = await supabase.from('emails').select('project_id').limit(1)

  if (testErr?.code === '42703') {
    // Column doesn't exist - can't add via REST API
    return NextResponse.json({
      error: 'Column project_id does not exist. Run this SQL in Supabase Dashboard:',
      sql: 'ALTER TABLE emails ADD COLUMN IF NOT EXISTS project_id UUID REFERENCES projecten(id) ON DELETE SET NULL; CREATE INDEX IF NOT EXISTS emails_project_id_idx ON emails(project_id);'
    }, { status: 400 })
  }

  // 2. Backfill: link existing emails to projects via relatie_id
  // Find emails that have relatie_id but no project_id
  const { data: unlinkedEmails } = await supabase
    .from('emails')
    .select('id, relatie_id')
    .not('relatie_id', 'is', null)
    .is('project_id', null)
    .limit(1000)

  let linked = 0
  if (unlinkedEmails && unlinkedEmails.length > 0) {
    // Get unique relatie_ids
    const relatieIds = [...new Set(unlinkedEmails.map(e => e.relatie_id))]

    // Find most recent active project per relatie
    const { data: projecten } = await supabase
      .from('projecten')
      .select('id, relatie_id')
      .in('relatie_id', relatieIds)
      .eq('status', 'actief')
      .order('created_at', { ascending: false })

    const relatieProjectMap = new Map<string, string>()
    for (const p of projecten || []) {
      if (!relatieProjectMap.has(p.relatie_id)) {
        relatieProjectMap.set(p.relatie_id, p.id)
      }
    }

    // Update emails in batches
    for (const email of unlinkedEmails) {
      const projectId = relatieProjectMap.get(email.relatie_id)
      if (projectId) {
        await supabase.from('emails').update({ project_id: projectId }).eq('id', email.id)
        linked++
      }
    }
  }

  return NextResponse.json({ success: true, linked })
}
