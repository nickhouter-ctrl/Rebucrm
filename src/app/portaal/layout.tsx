import { PortalSidebar } from '@/components/layout/portal-sidebar'
import { createClient } from '@/lib/supabase/server'

export const dynamic = 'force-dynamic'

export default async function PortaalLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  return (
    <div className="min-h-screen">
      <PortalSidebar />
      <div className="ml-60">
        <header className="h-14 bg-white border-b border-gray-200 flex items-center justify-between px-6">
          <span className="text-sm font-medium text-gray-900">Klantenportaal</span>
          {user && (
            <span className="text-sm text-gray-500">{user.email}</span>
          )}
        </header>
        <main className="p-6">{children}</main>
      </div>
    </div>
  )
}
