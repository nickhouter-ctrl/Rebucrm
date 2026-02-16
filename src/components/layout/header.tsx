'use client'

import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'
import { ChevronDown, LogOut, User } from 'lucide-react'

export function Header() {
  const [userMenuOpen, setUserMenuOpen] = useState(false)
  const [jaar, setJaar] = useState(new Date().getFullYear())
  const router = useRouter()
  const supabase = createClient()

  const jaren = Array.from({ length: 5 }, (_, i) => new Date().getFullYear() - i)

  async function handleLogout() {
    await supabase.auth.signOut()
    router.push('/login')
    router.refresh()
  }

  return (
    <header className="h-14 bg-white border-b border-gray-200 flex items-center justify-between px-6">
      <div className="flex items-center gap-4">
        <select
          value={jaar}
          onChange={(e) => setJaar(Number(e.target.value))}
          className="text-sm border border-gray-300 rounded-md px-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent"
        >
          {jaren.map((j) => (
            <option key={j} value={j}>
              Boekjaar {j}
            </option>
          ))}
        </select>
      </div>

      <div className="relative">
        <button
          onClick={() => setUserMenuOpen(!userMenuOpen)}
          className="flex items-center gap-2 text-sm text-gray-600 hover:text-gray-900 transition-colors"
        >
          <div className="h-8 w-8 bg-primary/10 text-primary rounded-full flex items-center justify-center">
            <User className="h-4 w-4" />
          </div>
          <ChevronDown className="h-3 w-3" />
        </button>

        {userMenuOpen && (
          <>
            <div
              className="fixed inset-0 z-10"
              onClick={() => setUserMenuOpen(false)}
            />
            <div className="absolute right-0 top-full mt-1 w-48 bg-white border border-gray-200 rounded-md shadow-lg z-20 py-1">
              <button
                onClick={handleLogout}
                className="w-full flex items-center gap-2 px-4 py-2 text-sm text-gray-700 hover:bg-gray-50"
              >
                <LogOut className="h-4 w-4" />
                Uitloggen
              </button>
            </div>
          </>
        )}
      </div>
    </header>
  )
}
