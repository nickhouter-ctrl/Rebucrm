import { Sidebar } from '@/components/layout/sidebar'
import { Header } from '@/components/layout/header'
import { createClient } from '@/lib/supabase/server'

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
    <div className="min-h-screen">
      <Sidebar rol={rol} />
      <div className="ml-60">
        <Header />
        <main className="p-6">{children}</main>
      </div>
    </div>
  )
}
