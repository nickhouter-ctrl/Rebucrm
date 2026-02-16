'use client'

import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import Link from 'next/link'
import { Mail } from 'lucide-react'

export default function WachtwoordVergetenPage() {
  const [email, setEmail] = useState('')
  const [sent, setSent] = useState(false)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const supabase = createClient()

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    setLoading(true)

    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/login`,
    })

    if (error) {
      setError(error.message)
      setLoading(false)
      return
    }

    setSent(true)
    setLoading(false)
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-100 px-4">
      <div className="w-full max-w-md">
        <div className="bg-white rounded-lg shadow-md p-8">
          <div className="text-center mb-8">
            <h1 className="text-2xl font-bold text-gray-900">Rebu</h1>
            <p className="text-gray-500 mt-1">Wachtwoord herstellen</p>
          </div>

          {sent ? (
            <div className="text-center">
              <div className="bg-green-50 text-green-700 p-4 rounded-md mb-4">
                <Mail className="h-8 w-8 mx-auto mb-2" />
                <p className="font-medium">E-mail verzonden!</p>
                <p className="text-sm mt-1">
                  Controleer uw inbox voor de herstelinstructies.
                </p>
              </div>
              <Link href="/login" className="text-primary hover:underline text-sm">
                Terug naar inloggen
              </Link>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-4">
              {error && (
                <div className="bg-red-50 text-red-600 text-sm p-3 rounded-md">
                  {error}
                </div>
              )}

              <div>
                <label htmlFor="email" className="block text-sm font-medium text-gray-700 mb-1">
                  E-mailadres
                </label>
                <input
                  id="email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent"
                  placeholder="uw@email.nl"
                />
              </div>

              <button
                type="submit"
                disabled={loading}
                className="w-full bg-primary text-white py-2 px-4 rounded-md hover:bg-primary-hover transition-colors disabled:opacity-50"
              >
                {loading ? 'Verzenden...' : 'Herstel e-mail versturen'}
              </button>

              <div className="text-center">
                <Link href="/login" className="text-primary hover:underline text-sm">
                  Terug naar inloggen
                </Link>
              </div>
            </form>
          )}
        </div>
      </div>
    </div>
  )
}
