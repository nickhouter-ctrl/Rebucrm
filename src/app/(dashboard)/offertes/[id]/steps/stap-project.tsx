'use client'

import { useState, useEffect } from 'react'
import { getProjectenByRelatie, getLastOfferteForProject, createProjectInline } from '@/lib/actions'
import { Card, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { ArrowLeft, Plus, Loader2, FolderKanban } from 'lucide-react'

interface Regel {
  omschrijving: string
  aantal: number
  prijs: number
  btw_percentage: number
  product_id?: string
}

interface Project {
  id: string
  naam: string
  status: string
  omschrijving: string | null
}

export function StapProject({
  relatieId,
  relatieName,
  onSelectProject,
  onBack,
}: {
  relatieId: string
  relatieName: string
  onSelectProject: (project: { id: string; naam: string }, regels: Regel[] | null, type: 'particulier' | 'zakelijk' | null) => void
  onBack: () => void
}) {
  const [projecten, setProjecten] = useState<Project[]>([])
  const [loadingProjecten, setLoadingProjecten] = useState(true)
  const [showNewProject, setShowNewProject] = useState(false)
  const [newProjectName, setNewProjectName] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    setLoadingProjecten(true)
    getProjectenByRelatie(relatieId).then(data => {
      setProjecten(data)
      setLoadingProjecten(false)
    })
  }, [relatieId])

  async function handleSelectExisting(project: Project) {
    setLoading(true)
    const lastOfferte = await getLastOfferteForProject(project.id)
    if (lastOfferte && lastOfferte.regels && (lastOfferte.regels as Regel[]).length > 0) {
      const regels = (lastOfferte.regels as Regel[]).map((r) => ({
        omschrijving: r.omschrijving,
        aantal: r.aantal,
        prijs: r.prijs,
        btw_percentage: r.btw_percentage,
        product_id: r.product_id || undefined,
      }))
      const hasParticulierRegels = regels.some(
        r => r.omschrijving.toLowerCase().includes('slopen') || r.omschrijving.toLowerCase().includes('plaatsen')
      )
      onSelectProject({ id: project.id, naam: project.naam }, regels, hasParticulierRegels ? 'particulier' : 'zakelijk')
    } else {
      onSelectProject({ id: project.id, naam: project.naam }, null, null)
    }
    setLoading(false)
  }

  async function handleNewProject() {
    if (!newProjectName) return
    setLoading(true)
    const result = await createProjectInline({ naam: newProjectName, relatie_id: relatieId })
    if (result.error) {
      setError(result.error)
      setLoading(false)
      return
    }
    setLoading(false)
    onSelectProject({ id: result.id!, naam: result.naam! }, null, null)
  }

  return (
    <div className="max-w-3xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-xl font-semibold text-gray-900">Selecteer project</h2>
          <p className="text-sm text-gray-500 mt-1">Kies een bestaand project of maak een nieuw project aan</p>
        </div>
        <Button variant="ghost" onClick={onBack}>
          <ArrowLeft className="h-4 w-4" />
          Terug
        </Button>
      </div>

      {error && <div className="bg-red-50 text-red-600 text-sm p-3 rounded-md mb-4">{error}</div>}

      <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 mb-6 flex items-center gap-2">
        <span className="text-sm text-blue-800">Klant: <strong>{relatieName}</strong></span>
      </div>

      {loadingProjecten ? (
        <div className="flex items-center justify-center py-12 text-gray-500">
          <Loader2 className="h-5 w-5 animate-spin mr-2" />
          Projecten laden...
        </div>
      ) : (
        <>
          {!showNewProject ? (
            <button
              onClick={() => setShowNewProject(true)}
              className="w-full text-left p-4 rounded-lg border-2 border-dashed border-gray-300 hover:border-primary hover:bg-blue-50/50 transition-all flex items-center gap-3 mb-4"
            >
              <div className="p-2 rounded-full bg-blue-50 text-primary">
                <Plus className="h-5 w-5" />
              </div>
              <div>
                <p className="font-medium text-gray-900">Nieuw project</p>
                <p className="text-sm text-gray-500">Start een nieuw project voor deze klant</p>
              </div>
            </button>
          ) : (
            <Card className="mb-4">
              <CardContent className="pt-6 space-y-4">
                <h3 className="font-semibold text-gray-900">Nieuw project aanmaken</h3>
                <Input
                  id="project_naam"
                  label="Projectnaam *"
                  placeholder="Bijv. Kozijnen achtergevel, Dakkapel slaapkamer..."
                  value={newProjectName}
                  onChange={e => setNewProjectName(e.target.value)}
                  autoFocus
                />
                <div className="flex gap-2 justify-end pt-2">
                  <Button variant="ghost" onClick={() => { setShowNewProject(false); setNewProjectName('') }}>
                    Annuleren
                  </Button>
                  <Button onClick={handleNewProject} disabled={loading || !newProjectName}>
                    {loading ? 'Aanmaken...' : 'Project aanmaken'}
                  </Button>
                </div>
              </CardContent>
            </Card>
          )}

          {projecten.length > 0 && (
            <div className="space-y-2">
              <h3 className="text-sm font-medium text-gray-500 uppercase tracking-wide mb-2">Bestaande projecten</h3>
              {projecten.map(p => (
                <button
                  key={p.id}
                  onClick={() => handleSelectExisting(p)}
                  disabled={loading}
                  className="w-full text-left p-4 rounded-lg border border-gray-200 hover:border-primary hover:bg-blue-50/50 transition-all flex items-center justify-between group"
                >
                  <div className="flex items-center gap-3">
                    <div className="p-2 rounded-full bg-gray-100 text-gray-600 group-hover:bg-blue-50 group-hover:text-primary">
                      <FolderKanban className="h-4 w-4" />
                    </div>
                    <div>
                      <p className="font-medium text-gray-900">{p.naam}</p>
                      <p className="text-xs text-gray-500">Nieuwe versie aanmaken op basis van laatste offerte</p>
                    </div>
                  </div>
                  <ArrowLeft className="h-4 w-4 text-gray-400 group-hover:text-primary rotate-180" />
                </button>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  )
}
