'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Card, CardContent, CardHeader } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Select } from '@/components/ui/select'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Dialog } from '@/components/ui/dialog'
import { PageHeader } from '@/components/ui/page-header'
import { saveMedewerker, deleteMedewerker, createMedewerkerAccount } from '@/lib/actions'
import { ArrowLeft, Trash2, KeyRound, ExternalLink } from 'lucide-react'
import Link from 'next/link'

interface OrderToewijzing {
  id: string
  rol: string | null
  gepland_van: string | null
  gepland_tot: string | null
  geschatte_uren: number | null
  order: {
    id: string
    ordernummer: string
    onderwerp: string | null
    status: string
    relatie: { bedrijfsnaam: string } | null
  } | null
}

export function MedewerkerDetail({
  medewerker,
  orders,
}: {
  medewerker: Record<string, unknown> | null
  orders: OrderToewijzing[]
}) {
  const router = useRouter()
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [type, setType] = useState((medewerker?.type as string) || 'werknemer')
  const [accountDialogOpen, setAccountDialogOpen] = useState(false)
  const [accountLoading, setAccountLoading] = useState(false)
  const [accountError, setAccountError] = useState('')
  const isNew = !medewerker

  async function handleSubmit(formData: FormData) {
    setLoading(true)
    setError('')
    if (medewerker) formData.set('id', medewerker.id as string)
    const result = await saveMedewerker(formData)
    if (result.error) {
      setError(result.error)
      setLoading(false)
    } else {
      router.push('/medewerkers')
    }
  }

  async function handleDelete() {
    if (!medewerker || !confirm('Weet u zeker dat u deze medewerker wilt verwijderen?')) return
    const result = await deleteMedewerker(medewerker.id as string)
    if (result.error) setError(result.error)
    else router.push('/medewerkers')
  }

  async function handleCreateAccount(formData: FormData) {
    if (!medewerker) return
    setAccountLoading(true)
    setAccountError('')
    formData.set('naam', medewerker.naam as string)
    const result = await createMedewerkerAccount(medewerker.id as string, formData)
    if (result.error) {
      setAccountError(result.error)
      setAccountLoading(false)
    } else {
      setAccountDialogOpen(false)
      setAccountLoading(false)
      router.refresh()
    }
  }

  const hasProfiel = !!(medewerker?.profiel_id)

  return (
    <div>
      <PageHeader
        title={isNew ? 'Nieuwe medewerker' : (medewerker.naam as string)}
        actions={
          <Button variant="secondary" size="sm" onClick={() => router.back()}>
            <ArrowLeft className="h-4 w-4 mr-1" />
            Terug
          </Button>
        }
      />

      <form action={handleSubmit}>
        <Card>
          <CardHeader>
            <h2 className="text-lg font-semibold">Gegevens</h2>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <Input
                id="naam"
                name="naam"
                label="Naam *"
                defaultValue={(medewerker?.naam as string) || ''}
                required
              />
              <Select
                id="type"
                name="type"
                label="Type *"
                value={type}
                onChange={(e) => setType(e.target.value)}
                options={[
                  { value: 'werknemer', label: 'Werknemer' },
                  { value: 'zzp', label: "ZZP'er" },
                ]}
              />
              <Input
                id="functie"
                name="functie"
                label="Functie"
                defaultValue={(medewerker?.functie as string) || ''}
                placeholder="bijv. Monteur, Timmerman"
              />
              <Input
                id="uurtarief"
                name="uurtarief"
                label="Uurtarief"
                type="number"
                step="0.01"
                defaultValue={(medewerker?.uurtarief as number) || ''}
              />
              <Input
                id="email"
                name="email"
                label="E-mail"
                type="email"
                defaultValue={(medewerker?.email as string) || ''}
              />
              <Input
                id="telefoon"
                name="telefoon"
                label="Telefoon"
                defaultValue={(medewerker?.telefoon as string) || ''}
              />

              {type === 'zzp' && (
                <>
                  <Input
                    id="kvk_nummer"
                    name="kvk_nummer"
                    label="KVK-nummer"
                    defaultValue={(medewerker?.kvk_nummer as string) || ''}
                  />
                  <Input
                    id="btw_nummer"
                    name="btw_nummer"
                    label="BTW-nummer"
                    defaultValue={(medewerker?.btw_nummer as string) || ''}
                  />
                </>
              )}

              <Input
                id="startdatum"
                name="startdatum"
                label="Startdatum"
                type="date"
                defaultValue={(medewerker?.startdatum as string) || ''}
              />
              <div>
                <label htmlFor="kleur" className="block text-sm font-medium text-gray-700 mb-1">
                  Kleur (planning)
                </label>
                <input
                  id="kleur"
                  name="kleur"
                  type="color"
                  defaultValue={(medewerker?.kleur as string) || '#3b82f6'}
                  className="w-full h-10 rounded-md border border-gray-300 cursor-pointer"
                />
              </div>
              <div className="md:col-span-2">
                <Input
                  id="specialisaties"
                  name="specialisaties"
                  label="Specialisaties"
                  defaultValue={((medewerker?.specialisaties as string[]) || []).join(', ')}
                  placeholder="bijv. kozijnen, deuren, schuifpuien (kommagescheiden)"
                />
              </div>
              <div className="md:col-span-2">
                <label htmlFor="opmerkingen" className="block text-sm font-medium text-gray-700 mb-1">
                  Opmerkingen
                </label>
                <textarea
                  id="opmerkingen"
                  name="opmerkingen"
                  rows={3}
                  defaultValue={(medewerker?.opmerkingen as string) || ''}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent"
                />
              </div>
              <div className="flex items-center gap-2">
                <input
                  id="actief"
                  name="actief"
                  type="hidden"
                  value="false"
                />
                <input
                  id="actief_checkbox"
                  type="checkbox"
                  defaultChecked={medewerker?.actief !== false}
                  onChange={(e) => {
                    const hidden = document.getElementById('actief') as HTMLInputElement
                    hidden.value = e.target.checked ? 'true' : 'false'
                  }}
                  className="h-4 w-4 rounded border-gray-300 text-primary focus:ring-primary"
                />
                <label htmlFor="actief_checkbox" className="text-sm font-medium text-gray-700">
                  Actief
                </label>
              </div>
            </div>

            {error && (
              <div className="mt-4 p-3 bg-red-50 text-red-700 text-sm rounded-md">{error}</div>
            )}

            <div className="mt-6 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Button type="submit" disabled={loading}>
                  {loading ? 'Opslaan...' : 'Opslaan'}
                </Button>
                {!isNew && !hasProfiel && (
                  <Button
                    type="button"
                    variant="secondary"
                    onClick={() => setAccountDialogOpen(true)}
                  >
                    <KeyRound className="h-4 w-4 mr-1" />
                    Toegang geven
                  </Button>
                )}
                {!isNew && hasProfiel && (
                  <span className="text-sm text-green-600 flex items-center gap-1">
                    <KeyRound className="h-4 w-4" />
                    Heeft inlog-account
                  </span>
                )}
              </div>
              {!isNew && (
                <Button type="button" variant="secondary" onClick={handleDelete} className="text-red-600 hover:text-red-700">
                  <Trash2 className="h-4 w-4 mr-1" />
                  Verwijderen
                </Button>
              )}
            </div>
          </CardContent>
        </Card>
      </form>

      {/* Toegewezen klussen */}
      {!isNew && orders.length > 0 && (
        <Card className="mt-6">
          <CardHeader>
            <h2 className="text-lg font-semibold">Toegewezen klussen</h2>
          </CardHeader>
          <CardContent>
            <div className="divide-y divide-gray-100">
              {orders.map(toewijzing => {
                const order = toewijzing.order
                if (!order) return null
                return (
                  <div key={toewijzing.id} className="py-3 flex items-center justify-between">
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-medium text-sm">{order.ordernummer}</span>
                        <Badge status={order.status} />
                        {toewijzing.rol && (
                          <span className="text-xs text-gray-500">({toewijzing.rol})</span>
                        )}
                      </div>
                      <p className="text-sm text-gray-600">
                        {order.onderwerp || (order.relatie as { bedrijfsnaam: string } | null)?.bedrijfsnaam || '-'}
                      </p>
                      {(toewijzing.gepland_van || toewijzing.gepland_tot) && (
                        <p className="text-xs text-gray-400">
                          {toewijzing.gepland_van} — {toewijzing.gepland_tot}
                          {toewijzing.geschatte_uren && ` (${toewijzing.geschatte_uren}u)`}
                        </p>
                      )}
                    </div>
                    <Link href={`/offertes/orders/${order.id}`}>
                      <Button variant="secondary" size="sm">
                        <ExternalLink className="h-3 w-3" />
                      </Button>
                    </Link>
                  </div>
                )
              })}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Account aanmaken dialog */}
      <Dialog open={accountDialogOpen} onClose={() => setAccountDialogOpen(false)} title="Login-account aanmaken">
        <form action={handleCreateAccount}>
          <div className="space-y-4">
            <p className="text-sm text-gray-600">
              Maak een login-account aan zodat deze medewerker toegang krijgt tot een eigen dashboard.
            </p>
            <Input
              id="account_email"
              name="email"
              label="E-mailadres *"
              type="email"
              defaultValue={(medewerker?.email as string) || ''}
              required
            />
            <Input
              id="account_wachtwoord"
              name="wachtwoord"
              label="Wachtwoord *"
              type="password"
              minLength={6}
              required
            />
            <label className="flex items-center gap-2 text-sm text-gray-700">
              <input type="checkbox" name="stuur_email" value="true" defaultChecked className="rounded border-gray-300" />
              Stuur inloggegevens per e-mail
            </label>
            {accountError && (
              <div className="p-3 bg-red-50 text-red-700 text-sm rounded-md">{accountError}</div>
            )}
            <div className="flex justify-end gap-2">
              <Button type="button" variant="secondary" onClick={() => setAccountDialogOpen(false)}>
                Annuleren
              </Button>
              <Button type="submit" disabled={accountLoading}>
                {accountLoading ? 'Aanmaken...' : 'Account aanmaken'}
              </Button>
            </div>
          </div>
        </form>
      </Dialog>
    </div>
  )
}
