'use client'

import { useRouter } from 'next/navigation'
import { useState } from 'react'
import { saveTaak, deleteTaak } from '@/lib/actions'
import { PageHeader } from '@/components/ui/page-header'
import { Card, CardContent, CardFooter } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Select } from '@/components/ui/select'
import { Button } from '@/components/ui/button'
import { Save, Trash2, ArrowLeft } from 'lucide-react'

export function TaakForm({ taak, projecten }: {
  taak: Record<string, unknown> | null
  projecten: { id: string; naam: string }[]
}) {
  const router = useRouter()
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const isNew = !taak

  async function handleSubmit(formData: FormData) {
    setLoading(true); setError('')
    if (taak) formData.set('id', taak.id as string)
    const result = await saveTaak(formData)
    if (result.error) { setError(result.error); setLoading(false) }
    else router.push('/taken')
  }

  async function handleDelete() {
    if (!taak || !confirm('Verwijderen?')) return
    const result = await deleteTaak(taak.id as string)
    if (result.error) setError(result.error)
    else router.push('/taken')
  }

  return (
    <div>
      <PageHeader title={isNew ? 'Nieuwe taak' : 'Taak bewerken'} actions={<Button variant="ghost" onClick={() => router.push('/taken')}><ArrowLeft className="h-4 w-4" />Terug</Button>} />
      {error && <div className="bg-red-50 text-red-600 text-sm p-3 rounded-md mb-4">{error}</div>}
      <form action={handleSubmit}>
        <Card>
          <CardContent className="space-y-4 pt-6">
            <Input id="titel" name="titel" label="Titel *" defaultValue={(taak?.titel as string) || ''} required />
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <Select id="status" name="status" label="Status" defaultValue={(taak?.status as string) || 'open'} options={[
                { value: 'open', label: 'Open' }, { value: 'in_uitvoering', label: 'In uitvoering' }, { value: 'afgerond', label: 'Afgerond' },
              ]} />
              <Select id="prioriteit" name="prioriteit" label="Prioriteit" defaultValue={(taak?.prioriteit as string) || 'normaal'} options={[
                { value: 'laag', label: 'Laag' }, { value: 'normaal', label: 'Normaal' }, { value: 'hoog', label: 'Hoog' }, { value: 'urgent', label: 'Urgent' },
              ]} />
              <Input id="deadline" name="deadline" label="Deadline" type="date" defaultValue={(taak?.deadline as string) || ''} />
            </div>
            <Select id="project_id" name="project_id" label="Project" defaultValue={(taak?.project_id as string) || ''} placeholder="Selecteer project..." options={projecten.map(p => ({ value: p.id, label: p.naam }))} />
            <div>
              <label htmlFor="omschrijving" className="block text-sm font-medium text-gray-700 mb-1">Omschrijving</label>
              <textarea id="omschrijving" name="omschrijving" rows={4} defaultValue={(taak?.omschrijving as string) || ''} className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent" />
            </div>
          </CardContent>
          <CardFooter className="flex justify-between">
            <div>{!isNew && <Button type="button" variant="danger" onClick={handleDelete}><Trash2 className="h-4 w-4" />Verwijderen</Button>}</div>
            <Button type="submit" disabled={loading}><Save className="h-4 w-4" />{loading ? 'Opslaan...' : 'Opslaan'}</Button>
          </CardFooter>
        </Card>
      </form>
    </div>
  )
}
