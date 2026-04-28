'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'
import { ChevronDown, LogOut, User, Menu } from 'lucide-react'
import { SearchBar } from './search-bar'

export function Header({ onMenuClick }: { onMenuClick?: () => void }) {
  const [userMenuOpen, setUserMenuOpen] = useState(false)
  const [userNaam, setUserNaam] = useState<string>('')
  const [userEmail, setUserEmail] = useState<string>('')
  const router = useRouter()
  const supabase = createClient()

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      const { data: { user } } = await supabase.auth.getUser()
      if (cancelled || !user) return
      setUserEmail(user.email || '')
      const { data: profiel } = await supabase.from('profielen').select('naam').eq('id', user.id).maybeSingle()
      if (!cancelled && profiel?.naam) setUserNaam(profiel.naam)
    })()
    return () => { cancelled = true }
  }, [supabase])

  async function handleLogout() {
    await supabase.auth.signOut()
    router.push('/login')
    router.refresh()
  }

  const displayNaam = userNaam || userEmail.split('@')[0] || 'Gebruiker'
  const initials = displayNaam.split(' ').map(w => w[0]).filter(Boolean).slice(0, 2).join('').toUpperCase()

  return (
    <header className="h-14 bg-white border-b border-gray-200 flex items-center justify-between px-3 sm:px-4 md:px-6 gap-2 sticky top-0 z-30">
      <div className="flex items-center gap-2">
        {onMenuClick && (
          <button
            type="button"
            onClick={onMenuClick}
            className="md:hidden p-2 -ml-2 text-gray-700 hover:bg-gray-100 rounded"
            aria-label="Menu openen"
          >
            <Menu className="h-5 w-5" />
          </button>
        )}
      </div>

      <div className="flex-1 max-w-md hidden sm:block">
        <SearchBar />
      </div>

      <div className="relative">
        <button
          onClick={() => setUserMenuOpen(!userMenuOpen)}
          className="flex items-center gap-2 text-sm text-gray-700 hover:text-gray-900 transition-colors"
        >
          <div className="h-8 w-8 bg-primary/10 text-primary rounded-full flex items-center justify-center text-xs font-semibold">
            {initials || <User className="h-4 w-4" />}
          </div>
          <span className="hidden sm:inline font-medium">{displayNaam}</span>
          <ChevronDown className="h-3 w-3" />
        </button>

        {userMenuOpen && (
          <>
            <div
              className="fixed inset-0 z-10"
              onClick={() => setUserMenuOpen(false)}
            />
            <div className="absolute right-0 top-full mt-1 w-56 bg-white border border-gray-200 rounded-md shadow-lg z-20 py-1">
              <div className="px-4 py-2 border-b border-gray-100">
                <p className="text-sm font-semibold text-gray-900">{displayNaam}</p>
                {userEmail && <p className="text-xs text-gray-500 truncate">{userEmail}</p>}
              </div>
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
