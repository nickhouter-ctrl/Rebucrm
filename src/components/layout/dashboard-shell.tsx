'use client'

import { useState } from 'react'
import { Sidebar } from './sidebar'
import { Header } from './header'
import { CommandPalette } from './command-palette'

// Wrapper rond Sidebar + Header + main-content. Beheert mobiele open/close state
// van de sidebar zodat hamburger in Header de drawer kan openen.
export function DashboardShell({ rol, children }: { rol?: string; children: React.ReactNode }) {
  const [mobileOpen, setMobileOpen] = useState(false)
  return (
    <div className="min-h-screen">
      <Sidebar rol={rol} mobileOpen={mobileOpen} onMobileClose={() => setMobileOpen(false)} />
      <div className="md:ml-60">
        <Header onMenuClick={() => setMobileOpen(true)} />
        <main className="p-3 sm:p-4 md:p-6 pb-20 md:pb-6">{children}</main>
      </div>
      <CommandPalette />
    </div>
  )
}
