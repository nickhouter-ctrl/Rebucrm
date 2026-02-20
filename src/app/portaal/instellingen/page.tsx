'use client'

import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { PageHeader } from '@/components/ui/page-header'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Save, Check } from 'lucide-react'

export default function PortaalInstellingenPage() {
  const [huidigWachtwoord, setHuidigWachtwoord] = useState('')
  const [nieuwWachtwoord, setNieuwWachtwoord] = useState('')
  const [bevestigWachtwoord, setBevestigWachtwoord] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState(false)

  const supabase = createClient()

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    setSuccess(false)

    if (nieuwWachtwoord.length < 6) {
      setError('Nieuw wachtwoord moet minimaal 6 tekens bevatten')
      return
    }

    if (nieuwWachtwoord !== bevestigWachtwoord) {
      setError('Wachtwoorden komen niet overeen')
      return
    }

    setLoading(true)

    const { error: updateError } = await supabase.auth.updateUser({
      password: nieuwWachtwoord,
    })

    if (updateError) {
      setError(updateError.message)
    } else {
      setSuccess(true)
      setHuidigWachtwoord('')
      setNieuwWachtwoord('')
      setBevestigWachtwoord('')
    }

    setLoading(false)
  }

  return (
    <div>
      <PageHeader title="Instellingen" description="Beheer uw account instellingen." />

      <div className="max-w-lg">
        <Card>
          <div className="px-6 py-4 border-b border-gray-200">
            <h2 className="text-base font-semibold text-gray-900">Wachtwoord wijzigen</h2>
          </div>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-4">
              {error && (
                <div className="bg-red-50 text-red-600 text-sm p-3 rounded-md">{error}</div>
              )}
              {success && (
                <div className="bg-green-50 text-green-700 text-sm p-3 rounded-md flex items-center gap-2">
                  <Check className="h-4 w-4" />
                  Wachtwoord succesvol gewijzigd
                </div>
              )}

              <Input
                id="nieuw_wachtwoord"
                label="Nieuw wachtwoord"
                type="password"
                value={nieuwWachtwoord}
                onChange={(e) => setNieuwWachtwoord(e.target.value)}
                required
                placeholder="Minimaal 6 tekens"
              />

              <Input
                id="bevestig_wachtwoord"
                label="Bevestig nieuw wachtwoord"
                type="password"
                value={bevestigWachtwoord}
                onChange={(e) => setBevestigWachtwoord(e.target.value)}
                required
                placeholder="Herhaal nieuw wachtwoord"
              />

              <div className="pt-2">
                <Button type="submit" disabled={loading}>
                  <Save className="h-4 w-4" />
                  {loading ? 'Opslaan...' : 'Wachtwoord wijzigen'}
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
