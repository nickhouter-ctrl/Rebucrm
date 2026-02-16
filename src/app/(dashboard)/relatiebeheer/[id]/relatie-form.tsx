'use client'

import { useRouter } from 'next/navigation'
import { useState } from 'react'
import { saveRelatie, deleteRelatie } from '@/lib/actions'
import { PageHeader } from '@/components/ui/page-header'
import { Card, CardContent, CardFooter } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Select } from '@/components/ui/select'
import { Button } from '@/components/ui/button'
import { Save, Trash2, ArrowLeft } from 'lucide-react'

interface RelatieData {
  id: string
  bedrijfsnaam: string
  type: string
  contactpersoon: string | null
  email: string | null
  telefoon: string | null
  adres: string | null
  postcode: string | null
  plaats: string | null
  kvk_nummer: string | null
  btw_nummer: string | null
  iban: string | null
  opmerkingen: string | null
}

export function RelatieForm({ relatie }: { relatie: RelatieData | null }) {
  const router = useRouter()
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const isNew = !relatie

  async function handleSubmit(formData: FormData) {
    setLoading(true)
    setError('')
    if (relatie) formData.set('id', relatie.id)
    const result = await saveRelatie(formData)
    if (result.error) {
      setError(result.error)
      setLoading(false)
    } else {
      router.push('/relatiebeheer')
    }
  }

  async function handleDelete() {
    if (!relatie || !confirm('Weet u zeker dat u deze relatie wilt verwijderen?')) return
    const result = await deleteRelatie(relatie.id)
    if (result.error) {
      setError(result.error)
    } else {
      router.push('/relatiebeheer')
    }
  }

  return (
    <div>
      <PageHeader
        title={isNew ? 'Nieuwe relatie' : 'Relatie bewerken'}
        actions={
          <Button variant="ghost" onClick={() => router.push('/relatiebeheer')}>
            <ArrowLeft className="h-4 w-4" />
            Terug
          </Button>
        }
      />

      {error && (
        <div className="bg-red-50 text-red-600 text-sm p-3 rounded-md mb-4">{error}</div>
      )}

      <form action={handleSubmit}>
        <Card>
          <CardContent className="space-y-4 pt-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <Input id="bedrijfsnaam" name="bedrijfsnaam" label="Bedrijfsnaam *" defaultValue={relatie?.bedrijfsnaam || ''} required />
              <Select
                id="type"
                name="type"
                label="Type *"
                defaultValue={relatie?.type || 'particulier'}
                options={[
                  { value: 'particulier', label: 'Particulier' },
                  { value: 'zakelijk', label: 'Zakelijk' },
                ]}
              />
              <Input id="contactpersoon" name="contactpersoon" label="Contactpersoon" defaultValue={relatie?.contactpersoon || ''} />
              <Input id="email" name="email" label="E-mail" type="email" defaultValue={relatie?.email || ''} />
              <Input id="telefoon" name="telefoon" label="Telefoon" defaultValue={relatie?.telefoon || ''} />
              <Input id="adres" name="adres" label="Adres" defaultValue={relatie?.adres || ''} />
              <Input id="postcode" name="postcode" label="Postcode" defaultValue={relatie?.postcode || ''} />
              <Input id="plaats" name="plaats" label="Plaats" defaultValue={relatie?.plaats || ''} />
              <Input id="kvk_nummer" name="kvk_nummer" label="KVK-nummer" defaultValue={relatie?.kvk_nummer || ''} />
              <Input id="btw_nummer" name="btw_nummer" label="BTW-nummer" defaultValue={relatie?.btw_nummer || ''} />
              <Input id="iban" name="iban" label="IBAN" defaultValue={relatie?.iban || ''} />
            </div>
            <div>
              <label htmlFor="opmerkingen" className="block text-sm font-medium text-gray-700 mb-1">Opmerkingen</label>
              <textarea
                id="opmerkingen"
                name="opmerkingen"
                rows={3}
                defaultValue={relatie?.opmerkingen || ''}
                className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent"
              />
            </div>
          </CardContent>
          <CardFooter className="flex justify-between">
            <div>
              {!isNew && (
                <Button type="button" variant="danger" onClick={handleDelete}>
                  <Trash2 className="h-4 w-4" />
                  Verwijderen
                </Button>
              )}
            </div>
            <Button type="submit" disabled={loading}>
              <Save className="h-4 w-4" />
              {loading ? 'Opslaan...' : 'Opslaan'}
            </Button>
          </CardFooter>
        </Card>
      </form>
    </div>
  )
}
