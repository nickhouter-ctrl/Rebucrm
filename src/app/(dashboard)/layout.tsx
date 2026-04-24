import { Suspense } from 'react'
import { Sidebar } from '@/components/layout/sidebar'
import { Header } from '@/components/layout/header'
import { ToastContainer } from '@/components/ui/toast'
import { createClient } from '@/lib/supabase/server'
import { NavHistoryProvider } from '@/lib/hooks/nav-history-provider'

export const dynamic = 'force-dynamic'

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  let rol = 'gebruiker'
  if (user) {
    const { data: profiel } = await supabase
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
