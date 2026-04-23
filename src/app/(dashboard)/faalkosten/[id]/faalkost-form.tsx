'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Card, CardContent, CardFooter } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Select } from '@/components/ui/select'
import { Button } from '@/components/ui/button'
import { Save, Trash2, ArrowLeft } from 'lucide-react'
import { saveFaalkost, deleteFaalkost } from '@/lib/actions'
import { faalkostenCategorieen, faalkostenCategorieLabels } from '@/lib/constants'
import { useBackNav } from '@/lib/hooks/use-back-nav'

interface FaalkostFormProps {
  faalkost: Record<string, unknown> | null
  projecten: { id: string; naam: string }[]
  isNew: boolean
}

export function FaalkostForm({ faalkost, projecten, isNew }: FaalkostFormProps) {
  const router = useRouter()
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const { navigateBack } = useBackNav(`faalkost-${(faalkost?.id as string) || 'nieuw'}`)

  async function handleSubmit(formData: FormData) {
    setLoading(true)
    setError('')
    if (faalkost?.id) formData.set('id', faalkost.id as string)
    const result = await saveFaalkost(formData)
    if (result.error) {
      setError(result.error)
      setLoading(false)
      return
    }
    navigateBack('/faalkosten')
  }

  async function handleDelete() {
    if (!faalkost?.id || !confirm('Weet je zeker dat je deze faalkost wilt verwijderen?')) return
    await deleteFaalkost(faalkost.id as string)
    navigateBack('/faalkosten')
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-gray-900">
          {isNew ? 'Nieuwe faalkost' : 'Faalkost bewerken'}
        </h1>
        <Button variant="ghost" onClick={() => router.back()}>
              <ArrowLeft className="h-4 w-4" />
              Terug
        </Button>
      </div>

      {error && <div className="bg-red-50 text-red-600 text-sm p-3 rounded-md mb-4">{error}</div>}

      <form action={handleSubmit}>
        <Card>
          <CardContent className="space-y-4 pt-6">
            <Input
              id="omschrijving"
              name="omschrijving"
              label="Omschrijving *"
              defaultValue={(faalkost?.omschrijving as string) || ''}
              required
            />
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <Select
                id="categorie"
                name="categorie"
                label="Categorie"
                defaultValue={(faalkost?.categorie as string) || ''}
                options={[
                  { value: '', label: '-- Kies categorie --' },
                  ...faalkostenCategorieen.map(c => ({ value: c, label: faalkostenCategorieLabels[c] })),
                ]}
              />
              <Input
                id="bedrag"
                name="bedrag"
                label="Bedrag *"
                type="number"
                step="0.01"
                defaultValue={String(faalkost?.bedrag || '')}
                required
              />
              <Input
                id="datum"
                name="datum"
                label="Datum"
                type="date"
                defaultValue={(faalkost?.datum as string) || new Date().toISOString().split('T')[0]}
              />
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <Select
                id="project_id"
                name="project_id"
                label="Project"
                defaultValue={((faalkost?.project as { id: string } | null)?.id || (faalkost?.project_id as string) || '')}
                options={[
                  { value: '', label: '-- Geen project --' },
                  ...projecten.map(p => ({ value: p.id, label: p.naam })),
                ]}
              />
              <Input
                id="verantwoordelijke"
                name="verantwoordelijke"
                label="Verantwoordelijke"
                defaultValue={(faalkost?.verantwoordelijke as string) || ''}
              />
            </div>
            <div className="flex items-center gap-2">
              <input
                type="checkbox"
                id="opgelost"
                name="opgelost"
                value="true"
                defaultChecked={(faalkost?.opgelost as boolean) || false}
                className="h-4 w-4 rounded border-gray-300 text-primary focus:ring-primary"
              />
              <label htmlFor="opgelost" className="text-sm font-medium text-gray-700">Opgelost</label>
            </div>
            <div>
              <label htmlFor="notities" className="block text-sm font-medium text-gray-700 mb-1">Notities</label>
              <textarea
                id="notities"
                name="notities"
                rows={3}
                defaultValue={(faalkost?.notities as string) || ''}
                className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent"
              />
            </div>
          </CardContent>
          <CardFooter className="flex justify-between">
            {!isNew ? (
              <Button type="button" variant="danger" onClick={handleDelete}>
                <Trash2 className="h-4 w-4" />
                Verwijderen
              </Button>
            ) : <div />}
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
