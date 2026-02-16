'use client'

import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { useState } from 'react'
import { saveProject, deleteProject } from '@/lib/actions'
import { PageHeader } from '@/components/ui/page-header'
import { Card, CardContent, CardFooter } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Select } from '@/components/ui/select'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { formatCurrency, formatDateShort } from '@/lib/utils'
import { Save, Trash2, ArrowLeft, Plus, FileText, FolderKanban } from 'lucide-react'

interface Offerte {
  id: string
  offertenummer: string
  versie_nummer: number | null
  datum: string
  status: string
  totaal: number
  relatie: { bedrijfsnaam: string } | null
}

export function ProjectDetail({ project, relaties, offertes, isNew }: {
  project: Record<string, unknown> | null
  relaties: { id: string; bedrijfsnaam: string }[]
  offertes: Offerte[]
  isNew: boolean
}) {
  const router = useRouter()
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  async function handleSubmit(formData: FormData) {
    setLoading(true); setError('')
    if (project) formData.set('id', project.id as string)
    const result = await saveProject(formData)
    if (result.error) { setError(result.error); setLoading(false) }
    else router.push('/projecten')
  }

  async function handleDelete() {
    if (!project || !confirm('Weet u zeker dat u dit project wilt verwijderen?')) return
    const result = await deleteProject(project.id as string)
    if (result.error) setError(result.error)
    else router.push('/projecten')
  }

  // Groepeer offertes per offertenummer
  const offerteGroups = offertes.reduce<Record<string, Offerte[]>>((acc, o) => {
    const key = o.offertenummer
    if (!acc[key]) acc[key] = []
    acc[key].push(o)
    return acc
  }, {})

  if (isNew) {
    // Nieuw project: toon alleen het formulier
    return (
      <div>
        <PageHeader title="Nieuw project" actions={<Button variant="ghost" onClick={() => router.push('/projecten')}><ArrowLeft className="h-4 w-4" />Terug</Button>} />
        {error && <div className="bg-red-50 text-red-600 text-sm p-3 rounded-md mb-4">{error}</div>}
        <form action={handleSubmit}>
          <Card>
            <CardContent className="space-y-4 pt-6">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <Input id="naam" name="naam" label="Projectnaam *" required />
                <Select id="relatie_id" name="relatie_id" label="Klant" placeholder="Selecteer klant..." options={relaties.map(r => ({ value: r.id, label: r.bedrijfsnaam }))} />
                <Select id="status" name="status" label="Status" defaultValue="actief" options={[
                  { value: 'actief', label: 'Actief' }, { value: 'afgerond', label: 'Afgerond' },
                  { value: 'on_hold', label: 'On hold' }, { value: 'geannuleerd', label: 'Geannuleerd' },
                ]} />
                <Input id="budget" name="budget" label="Budget" type="number" step="0.01" />
                <Input id="uurtarief" name="uurtarief" label="Uurtarief" type="number" step="0.01" />
                <Input id="startdatum" name="startdatum" label="Startdatum" type="date" />
                <Input id="einddatum" name="einddatum" label="Einddatum" type="date" />
              </div>
              <div>
                <label htmlFor="omschrijving" className="block text-sm font-medium text-gray-700 mb-1">Omschrijving</label>
                <textarea id="omschrijving" name="omschrijving" rows={3} className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent" />
              </div>
            </CardContent>
            <CardFooter className="flex justify-end">
              <Button type="submit" disabled={loading}><Save className="h-4 w-4" />{loading ? 'Opslaan...' : 'Opslaan'}</Button>
            </CardFooter>
          </Card>
        </form>
      </div>
    )
  }

  // Bestaand project: detail pagina
  const projectNaam = (project?.naam as string) || 'Project'
  const projectStatus = (project?.status as string) || 'actief'
  const relatieNaam = (project?.relatie as { bedrijfsnaam: string } | null)?.bedrijfsnaam

  return (
    <div>
      <PageHeader
        title={projectNaam}
        description={relatieNaam ? `Klant: ${relatieNaam}` : undefined}
        actions={
          <div className="flex gap-2">
            <Button variant="ghost" onClick={() => router.push('/projecten')}>
              <ArrowLeft className="h-4 w-4" />
              Terug
            </Button>
            <Button onClick={() => router.push(`/offertes/nieuw?project_id=${project?.id}&relatie_id=${project?.relatie_id}`)}>
              <Plus className="h-4 w-4" />
              Nieuwe offerte
            </Button>
          </div>
        }
      />

      {error && <div className="bg-red-50 text-red-600 text-sm p-3 rounded-md mb-4">{error}</div>}

      <div className="space-y-6">
        {/* Project status banner */}
        <div className="flex items-center gap-3">
          <Badge status={projectStatus} />
          {project?.startdatum && (
            <span className="text-sm text-gray-500">
              Start: {formatDateShort(project.startdatum as string)}
            </span>
          )}
          {project?.einddatum && (
            <span className="text-sm text-gray-500">
              Eind: {formatDateShort(project.einddatum as string)}
            </span>
          )}
          {project?.budget && (
            <span className="text-sm text-gray-500">
              Budget: {formatCurrency(project.budget as number)}
            </span>
          )}
        </div>

        {/* Offertes sectie */}
        <Card>
          <div className="px-6 py-4 border-b border-gray-200 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <FileText className="h-4 w-4 text-gray-500" />
              <h2 className="font-semibold text-gray-900">Offertes</h2>
              <span className="text-sm text-gray-500">({offertes.length})</span>
            </div>
          </div>
          <CardContent>
            {offertes.length === 0 ? (
              <div className="py-8 text-center">
                <FileText className="h-8 w-8 text-gray-300 mx-auto mb-2" />
                <p className="text-sm text-gray-500 mb-3">Nog geen offertes voor dit project</p>
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => router.push(`/offertes/nieuw?project_id=${project?.id}&relatie_id=${project?.relatie_id}`)}
                >
                  <Plus className="h-3 w-3" />
                  Eerste offerte aanmaken
                </Button>
              </div>
            ) : (
              <div className="space-y-4">
                {Object.entries(offerteGroups).map(([nummer, versies]) => (
                  <div key={nummer}>
                    <div className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-2">
                      {nummer}
                    </div>
                    <div className="space-y-1">
                      {versies.map(o => (
                        <Link
                          key={o.id}
                          href={`/offertes/${o.id}`}
                          className="flex items-center justify-between p-3 rounded-lg hover:bg-gray-50 transition-colors border border-gray-100"
                        >
                          <div className="flex items-center gap-3">
                            <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-gray-100 text-gray-700">
                              v{o.versie_nummer || 1}
                            </span>
                            <span className="text-sm text-gray-900">
                              {formatDateShort(o.datum)}
                            </span>
                            <Badge status={o.status} />
                          </div>
                          <span className="text-sm font-medium text-gray-900">
                            {formatCurrency(o.totaal || 0)}
                          </span>
                        </Link>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Project gegevens bewerken */}
        <Card>
          <div className="px-6 py-4 border-b border-gray-200 flex items-center gap-2">
            <FolderKanban className="h-4 w-4 text-gray-500" />
            <h2 className="font-semibold text-gray-900">Projectgegevens</h2>
          </div>
          <form action={handleSubmit}>
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
              <Button type="button" variant="danger" onClick={handleDelete}>
                <Trash2 className="h-4 w-4" />
                Verwijderen
              </Button>
              <Button type="submit" disabled={loading}>
                <Save className="h-4 w-4" />
                {loading ? 'Opslaan...' : 'Opslaan'}
              </Button>
            </CardFooter>
          </form>
        </Card>
      </div>
    </div>
  )
}
