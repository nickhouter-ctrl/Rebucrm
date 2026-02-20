'use client'

import Link from 'next/link'
import Image from 'next/image'
import { usePathname, useRouter } from 'next/navigation'
import { LayoutDashboard, FileText, Receipt, Truck, LogOut, Settings } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { cn } from '@/lib/utils'

const portalNavItems = [
  { label: 'Dashboard', href: '/portaal', icon: LayoutDashboard },
  { label: 'Offertes', href: '/portaal/offertes', icon: FileText },
  { label: 'Facturen', href: '/portaal/facturen', icon: Receipt },
  { label: 'Leveringen', href: '/portaal/leveringen', icon: Truck },
  { label: 'Instellingen', href: '/portaal/instellingen', icon: Settings },
]

export function PortalSidebar() {
  const pathname = usePathname()
  const router = useRouter()
  const supabase = createClient()

  async function handleLogout() {
    await supabase.auth.signOut()
    router.push('/login')
    router.refresh()
  }

  return (
    <aside className="w-60 bg-sidebar text-white flex flex-col h-screen fixed left-0 top-0">
      <div className="p-4 border-b border-white/10">
        <Image src="/images/logo-rebu.png" alt="Rebu Kozijnen" width={140} height={45} className="h-9 w-auto brightness-0 invert" />
      </div>

      <nav className="flex-1 overflow-y-auto py-2">
        {portalNavItems.map((item) => {
          const isActive =
            item.href === '/portaal'
              ? pathname === '/portaal'
              : pathname.startsWith(item.href)

          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                'flex items-center gap-3 px-4 py-2.5 text-sm transition-colors',
                isActive
                  ? 'bg-sidebar-active text-white'
                  : 'text-white/70 hover:bg-sidebar-hover hover:text-white'
              )}
            >
              <item.icon className="h-4 w-4 flex-shrink-0" />
              {item.label}
            </Link>
          )
        })}
      </nav>

      <div className="p-4 border-t border-white/10">
        <button
          onClick={handleLogout}
          className="flex items-center gap-3 px-4 py-2.5 text-sm text-white/70 hover:text-white transition-colors w-full rounded-md hover:bg-sidebar-hover"
        >
          <LogOut className="h-4 w-4 flex-shrink-0" />
          Uitloggen
        </button>
      </div>
    </aside>
  )
}
