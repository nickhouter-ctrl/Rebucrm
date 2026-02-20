'use client'

import { useRouter } from 'next/navigation'
import { useState } from 'react'
import { saveProject, deleteProject } from '@/lib/actions'
import { PageHeader } from '@/components/ui/page-header'
import { Card, CardContent, CardFooter } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Select } from '@/components/ui/select'
import { Button } from '@/components/ui/button'
import { Save, Trash2, ArrowLeft } from 'lucide-react'

export function ProjectForm({ project, relaties }: {
  project: Record<string, unknown> | null
  relaties: { id: string; bedrijfsnaam: string }[]
}) {
  const router = useRouter()
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const isNew = !project

  async function handleSubmit(formData: FormData) {
    setLoading(true); setError('')
    if (project) formData.set('id', project.id as string)
    const result = await saveProject(formData)
    if (result.error) { setError(result.error); setLoading(false) }
    else router.push('/projecten')
  }

  async function handleDelete() {
    if (!project || !confirm('Verwijderen?')) return
    const result = await deleteProject(project.id as string)
    if (result.error) setError(result.error)
    else router.push('/projecten')
  }

  return (
    <div>
      <PageHeader title={isNew ? 'Nieuw project' : 'Project bewerken'} actions={<Button variant="ghost" onClick={() => router.push('/projecten')}><ArrowLeft className="h-4 w-4" />Terug</Button>} />
      {error && <div className="bg-red-50 text-red-600 text-sm p-3 rounded-md mb-4">{error}</div>}
      <form action={handleSubmit}>
        <Card>
          <CardContent className="space-y-4 pt-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <Input id="naam" name="naam" label="Projectnaam *" defaultValue={(project?.naam as string) || ''} required />
              <Select id="relatie_id" name="relatie_id" label="Klant" defaultValue={(project?.relatie_id as string) || ''} placeholder="Selecteer klant..." options={relaties.map(r => ({ value: r.id, label: r.bedrijfsnaam }))} />
              <Select id="status" name="status" label="Status" defaultValue={(project?.status as string) || 'actief'} options={[
                { value: 'actief', label: 'Actief' }, { value: 'afgerond', label: 'Afgerond' },
                { value: 'on_hold', label: 'On hold' }, { value: 'geannuleerd', label: 'Geannuleerd' },
              ]} />
              <Input id="budget" name="budget" label="Budget" type="number" step="0.01" defaultValue={(project?.budget as number) || ''} />
              <Input id="uurtarief" name="uurtarief" label="Uurtarief" type="number" step="0.01" defaultValue={(project?.uurtarief as number) || ''} />
              <Input id="startdatum" name="startdatum" label="Startdatum" type="date" defaultValue={(project?.startdatum as string) || ''} />
              <Input id="einddatum" name="einddatum" label="Einddatum" type="date" defaultValue={(project?.einddatum as string) || ''} />
            </div>
            <div>
              <label htmlFor="omschrijving" className="block text-sm font-medium text-gray-700 mb-1">Omschrijving</label>
              <textarea id="omschrijving" name="omschrijving" rows={3} defaultValue={(project?.omschrijving as string) || ''} className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent" />
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
