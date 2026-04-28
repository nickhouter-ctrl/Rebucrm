'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { Home, Users, CheckSquare, Mail, FolderKanban } from 'lucide-react'
import { cn } from '@/lib/utils'

// Bottom-tab navigation voor mobiel — 4 belangrijkste secties altijd binnen handbereik.
// Wordt automatisch verborgen op desktop (>= md).
export function MobileBottomNav({ rol }: { rol?: string }) {
  const pathname = usePathname()

  // Voor medewerker een andere set: Vandaag / Agenda / Taken / Uren
  const items = rol === 'medewerker' ? [
    { href: '/', label: 'Vandaag', icon: Home },
    { href: '/agenda', label: 'Agenda', icon: FolderKanban },
    { href: '/taken', label: 'Taken', icon: CheckSquare },
    { href: '/uren', label: 'Uren', icon: Users },
  ] : [
    { href: '/', label: 'Vandaag', icon: Home },
    { href: '/relatiebeheer', label: 'Klanten', icon: Users },
    { href: '/taken', label: 'Taken', icon: CheckSquare },
    { href: '/email', label: 'Mail', icon: Mail },
  ]

  return (
    <nav
      className="fixed bottom-0 inset-x-0 bg-white border-t border-gray-200 md:hidden z-30 grid grid-cols-4"
      style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
    >
      {items.map(item => {
        const isActive = item.href === '/' ? pathname === '/' : pathname.startsWith(item.href)
        const Icon = item.icon
        return (
          <Link
            key={item.href}
            href={item.href}
            className={cn(
              'flex flex-col items-center justify-center py-2 text-[10px] font-medium gap-0.5 transition-colors',
              isActive ? 'text-primary' : 'text-gray-500 hover:text-gray-900',
            )}
          >
            <Icon className="h-5 w-5" />
            <span>{item.label}</span>
          </Link>
        )
      })}
    </nav>
  )
}
