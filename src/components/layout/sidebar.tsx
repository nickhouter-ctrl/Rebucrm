'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { navigationItems } from '@/lib/constants'
import { cn } from '@/lib/utils'

export function Sidebar() {
  const pathname = usePathname()

  return (
    <aside className="w-60 bg-sidebar text-white flex flex-col h-screen fixed left-0 top-0">
      <div className="p-4 border-b border-white/10">
        <h1 className="text-xl font-bold tracking-tight">Rebu</h1>
        <p className="text-xs text-white/50 mt-0.5">Bedrijfsmanagement</p>
      </div>

      <nav className="flex-1 overflow-y-auto py-2">
        {navigationItems.map((item) => {
          const isActive =
            item.href === '/'
              ? pathname === '/'
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

      <div className="p-4 border-t border-white/10 text-xs text-white/40">
        Rebu v1.0
      </div>
    </aside>
  )
}
