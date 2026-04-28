import { createAdminClient } from '@/lib/supabase/admin'
import { createClient } from '@/lib/supabase/server'

// Lichtgewicht audit-helper. Roep aan vanuit server-actions / route-handlers
// voor kritieke mutaties. Faalt nooit hard — een audit-log fout mag de
// werkelijke actie niet blokkeren.
export async function logAudit(input: {
  actie: string                 // 'offerte.delete', 'factuur.update', etc.
  entiteitType?: string         // 'offerte', 'factuur', 'relatie', ...
  entiteitId?: string
  details?: Record<string, unknown>
  ipAdres?: string
}) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    const admin = createAdminClient()

    let administratieId: string | null = null
    let userEmail: string | null = null
    if (user) {
      userEmail = user.email || null
      const { data: profiel } = await admin.from('profielen').select('administratie_id').eq('id', user.id).maybeSingle()
      administratieId = profiel?.administratie_id || null
    }

    await admin.from('audit_log').insert({
      administratie_id: administratieId,
      user_id: user?.id || null,
      user_email: userEmail,
      actie: input.actie,
      entiteit_type: input.entiteitType || null,
      entiteit_id: input.entiteitId || null,
      details: input.details || null,
      ip_adres: input.ipAdres || null,
    })
  } catch (err) {
    console.warn('audit-log fout (niet kritiek):', err)
  }
}
