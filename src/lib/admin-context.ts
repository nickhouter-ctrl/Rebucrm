import { cache } from 'react'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

// React's cache() dedupliceert binnen één request. getAdministratieId wordt
// in praktisch elke server-action aangeroepen — zonder cache betekent dat
// 5-10× per pagina-load een auth.getUser() + profielen-query. Met cache
// wordt het 1× per request.
export const getAdministratieIdCached = cache(async (): Promise<string | null> => {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null

  const supabaseAdmin = createAdminClient()
  const { data: profiel } = await supabaseAdmin
    .from('profielen')
    .select('administratie_id')
    .eq('id', user.id)
    .single()

  return profiel?.administratie_id || null
})

// Idem voor de user-record zelf — wordt eveneens vaak los opgehaald.
export const getCurrentUserCached = cache(async () => {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  return user
})
