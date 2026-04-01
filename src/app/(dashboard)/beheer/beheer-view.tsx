'use client'

import { useState } from 'react'
import { saveAdministratie, saveNummering, createGebruiker, deleteGebruiker } from '@/lib/actions'
import { PageHeader } from '@/components/ui/page-header'
import { Card, CardContent, CardFooter } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Select } from '@/components/ui/select'
import { Button } from '@/components/ui/button'
import { Dialog } from '@/components/ui/dialog'
import { Badge } from '@/components/ui/badge'
import { Save, Plus, Trash2, UserPlus } from 'lucide-react'

interface Administratie {
  id: string
  naam: string
  kvk_nummer: string | null
  btw_nummer: string | null
  adres: string | null
  postcode: string | null
  plaats: string | null
  telefoon: string | null
  email: string | null
  website: string | null
  iban: string | null
}

interface Nummering {
  id: string
  type: string
  prefix: string
  volgend_nummer: number
}

interface Gebruiker {
  id: string
  naam: string
  email: string
  rol: string
}

export function BeheerView({ administratie, nummering, gebruikers }: {
  administratie: Administratie | null
  nummering: Nummering[]
  gebruikers: Gebruiker[]
}) {
  const [tab, setTab] = useState<'bedrijf' | 'nummering' | 'gebruikers'>('bedrijf')
  const [loading, setLoading] = useState(false)
  const [success, setSuccess] = useState('')
  const [error, setError] = useState('')
  const [showNewUser, setShowNewUser] = useState(false)

  async function handleSaveBedrijf(formData: FormData) {
    setLoading(true); setError(''); setSuccess('')
    const result = await saveAdministratie(formData)
    if (result.error) setError(result.error)
    else setSuccess('Bedrijfsgegevens opgeslagen')
    setLoading(false)
  }

  async function handleSaveNummering(formData: FormData) {
    setLoading(true); setError(''); setSuccess('')
    const result = await saveNummering(formData)
    if (result.error) setError(result.error)
    else setSuccess('Nummering opgeslagen')
    setLoading(false)
  }

  async function handleCreateGebruiker(formData: FormData) {
    setLoading(true); setError(''); setSuccess('')
    const result = await createGebruiker(formData)
    if (result.error) setError(result.error)
    else {
      setSuccess('Gebruiker aangemaakt')
      setShowNewUser(false)
    }
    setLoading(false)
  }

  async function handleDeleteGebruiker(id: string) {
    if (!confirm('Weet u zeker dat u deze gebruiker wilt verwijderen?')) return
    setLoading(true); setError(''); setSuccess('')
    const result = await deleteGebruiker(id)
    if (result.error) setError(result.error)
    else setSuccess('Gebruiker verwijderd')
    setLoading(false)
  }

  const typeLabels: Record<string, string> = {
    offerte: 'Offertes',
    order: 'Orders',
    factuur: 'Facturen',
    inkoopfactuur: 'Inkoopfacturen',
    boeking: 'Boekingen',
  }

  const rolLabels: Record<string, string> = {
    admin: 'Admin',
    gebruiker: 'Gebruiker',
    readonly: 'Alleen lezen',
  }

  const tabs = [
    { key: 'bedrijf' as const, label: 'Bedrijfsgegevens' },
    { key: 'gebruikers' as const, label: 'Gebruikers' },
    { key: 'nummering' as const, label: 'Nummering' },
  ]

  return (
    <div>
      <PageHeader title="Beheer" description="Instellingen en configuratie" />

      {success && <div className="bg-green-50 text-green-600 text-sm p-3 rounded-md mb-4">{success}</div>}
      {error && <div className="bg-red-50 text-red-600 text-sm p-3 rounded-md mb-4">{error}</div>}

      <div className="flex gap-2 mb-6">
        {tabs.map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`px-4 py-2 text-sm rounded-md transition-colors ${tab === t.key ? 'bg-primary text-white' : 'bg-white text-gray-700 border border-gray-300 hover:bg-gray-50'}`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === 'bedrijf' && (
        <form action={handleSaveBedrijf}>
          <Card>
            <CardContent className="space-y-4 pt-6">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <Input id="naam" name="naam" label="Bedrijfsnaam *" defaultValue={administratie?.naam || ''} required />
                <Input id="kvk_nummer" name="kvk_nummer" label="KVK-nummer" defaultValue={administratie?.kvk_nummer || ''} />
                <Input id="btw_nummer" name="btw_nummer" label="BTW-nummer" defaultValue={administratie?.btw_nummer || ''} />
                <Input id="email" name="email" label="E-mail" type="email" defaultValue={administratie?.email || ''} />
                <Input id="telefoon" name="telefoon" label="Telefoon" defaultValue={administratie?.telefoon || ''} />
                <Input id="website" name="website" label="Website" defaultValue={administratie?.website || ''} />
                <Input id="adres" name="adres" label="Adres" defaultValue={administratie?.adres || ''} />
                <Input id="postcode" name="postcode" label="Postcode" defaultValue={administratie?.postcode || ''} />
                <Input id="plaats" name="plaats" label="Plaats" defaultValue={administratie?.plaats || ''} />
                <Input id="iban" name="iban" label="IBAN" defaultValue={administratie?.iban || ''} />
              </div>
            </CardContent>
            <CardFooter className="flex justify-end">
              <Button type="submit" disabled={loading}>
                <Save className="h-4 w-4" />
                {loading ? 'Opslaan...' : 'Opslaan'}
              </Button>
            </CardFooter>
          </Card>
        </form>
      )}

      {tab === 'gebruikers' && (
        <div>
          <div className="flex justify-end mb-4">
            <Button onClick={() => setShowNewUser(true)}>
              <UserPlus className="h-4 w-4" />
              Nieuwe gebruiker
            </Button>
          </div>

          <Card>
            <CardContent className="p-0">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-gray-200 bg-gray-50">
                    <th className="text-left text-xs font-medium text-gray-500 uppercase px-6 py-3">Naam</th>
                    <th className="text-left text-xs font-medium text-gray-500 uppercase px-6 py-3">E-mail</th>
                    <th className="text-left text-xs font-medium text-gray-500 uppercase px-6 py-3">Rol</th>
                    <th className="text-right text-xs font-medium text-gray-500 uppercase px-6 py-3">Acties</th>
                  </tr>
                </thead>
                <tbody>
                  {gebruikers.map((g) => (
                    <tr key={g.id} className="border-b border-gray-100 hover:bg-gray-50">
                      <td className="px-6 py-3 text-sm font-medium text-gray-900">{g.naam}</td>
                      <td className="px-6 py-3 text-sm text-gray-600">{g.email}</td>
                      <td className="px-6 py-3"><Badge status={g.rol}>{rolLabels[g.rol] || g.rol}</Badge></td>
                      <td className="px-6 py-3 text-right">
                        <button
                          onClick={() => handleDeleteGebruiker(g.id)}
                          className="text-gray-400 hover:text-red-500 transition-colors"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </td>
                    </tr>
                  ))}
                  {gebruikers.length === 0 && (
                    <tr>
                      <td colSpan={4} className="px-6 py-8 text-center text-gray-500 text-sm">
                        Geen gebruikers gevonden
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </CardContent>
          </Card>

          <Dialog open={showNewUser} onClose={() => setShowNewUser(false)} title="Nieuwe gebruiker">
            <form action={handleCreateGebruiker}>
              <div className="space-y-4">
                <Input id="new-naam" name="naam" label="Naam *" required />
                <Input id="new-email" name="email" label="E-mail *" type="email" required />
                <Input id="new-wachtwoord" name="wachtwoord" label="Wachtwoord *" type="password" required />
                <Select
                  id="new-rol"
                  name="rol"
                  label="Rol"
                  defaultValue="gebruiker"
                  options={[
                    { value: 'admin', label: 'Admin' },
                    { value: 'gebruiker', label: 'Gebruiker' },
                    { value: 'readonly', label: 'Alleen lezen' },
                  ]}
                />
                <label className="flex items-center gap-2 text-sm text-gray-700">
                  <input type="checkbox" name="stuur_email" value="true" defaultChecked className="rounded border-gray-300" />
                  Stuur inloggegevens per e-mail
                </label>
              </div>
              <div className="flex justify-end gap-2 mt-6">
                <Button type="button" variant="secondary" onClick={() => setShowNewUser(false)}>
                  Annuleren
                </Button>
                <Button type="submit" disabled={loading}>
                  <Plus className="h-4 w-4" />
                  {loading ? 'Aanmaken...' : 'Aanmaken'}
                </Button>
              </div>
            </form>
          </Dialog>
        </div>
      )}

      {tab === 'nummering' && (
        <div className="space-y-4">
          {nummering.map((n) => (
            <form key={n.id} action={handleSaveNummering}>
              <input type="hidden" name="id" value={n.id} />
              <Card>
                <CardContent className="pt-6">
                  <h3 className="font-medium text-gray-900 mb-3">{typeLabels[n.type] || n.type}</h3>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <Input id={`prefix-${n.id}`} name="prefix" label="Prefix" defaultValue={n.prefix} />
                    <Input id={`nummer-${n.id}`} name="volgend_nummer" label="Volgend nummer" type="number" defaultValue={n.volgend_nummer} />
                    <div className="flex items-end">
                      <Button type="submit" size="sm" disabled={loading}>
                        <Save className="h-3 w-3" />
                        Opslaan
                      </Button>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </form>
          ))}
          {nummering.length === 0 && (
            <Card>
              <CardContent className="py-8 text-center text-gray-500">
                Geen nummeringinstellingen gevonden. Deze worden automatisch aangemaakt bij registratie.
              </CardContent>
            </Card>
          )}
        </div>
      )}
    </div>
  )
}
