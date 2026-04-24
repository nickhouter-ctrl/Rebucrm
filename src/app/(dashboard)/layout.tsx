import { Suspense } from 'react'
import { Sidebar } from '@/components/layout/sidebar'
import { Header } from '@/components/layout/header'
import { ToastContainer } from '@/components/ui/toast'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { NavHistoryProvider } from '@/lib/hooks/nav-history-provider'

// Geen 'force-dynamic' meer: Supabase's createClient leest cookies en maakt
// de layout automatisch dynamisch. Een expliciete flag geeft geen extra
// zekerheid maar voorkomt wel mogelijke render-optimalisaties.

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  let rol = 'gebruiker'
  if (user) {
    // Admin-client bypassed RLS en is daardoor merkbaar sneller dan de
    // user-client voor deze kleine lookup (geen policy-evaluatie nodig).
    const supabaseAdmin = createAdminClient()
    const { data: profiel } = await supabaseAdmin
      .from('profielen')
      .select('rol')
      .eq('id', user.id)
      .single()
    if (profiel?.rol) rol = profiel.rol
  }

  return (
    <Suspense fallback={null}>
      <NavHistoryProvider>
        <div className="min-h-screen">
          <Sidebar rol={rol} />
          <div className="ml-60">
            <Header />
            <main className="p-6">{children}</main>
          </div>
          <ToastContainer />
        </div>
      </NavHistoryProvider>
    </Suspense>
  )
}
