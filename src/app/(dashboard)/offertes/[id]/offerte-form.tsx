'use client'

import { useRouter } from 'next/navigation'
import { useState, useEffect, useCallback } from 'react'
import { saveOfferte, deleteOfferte, duplicateOfferte, createRelatieInline, sendOfferteEmail, convertToFactuur, getProjectenByRelatie, getLastOfferteForProject, createProjectInline } from '@/lib/actions'
import { PageHeader } from '@/components/ui/page-header'
import { Card, CardContent, CardFooter } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Select } from '@/components/ui/select'
import { Button } from '@/components/ui/button'
import { formatCurrency } from '@/lib/utils'
import { Save, Trash2, ArrowLeft, Plus, X, Copy, Download, Building2, User, Search, UserPlus, Send, Receipt, Link2, FolderKanban, Loader2 } from 'lucide-react'

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

const BEZORGKOSTEN_DREMPEL = 1750
const BEZORGKOSTEN_BEDRAG = 150
const BEZORGKOSTEN_LABEL = 'Bezorgkosten'

const PARTICULIER_REGELS: Regel[] = [
  { omschrijving: 'Leveren kunststof kozijnen', aantal: 1, prijs: 0, btw_percentage: 21 },
  { omschrijving: 'Oude kozijn slopen', aantal: 1, prijs: 25, btw_percentage: 21 },
  { omschrijving: 'Stelkozijnen plaatsen', aantal: 1, prijs: 25, btw_percentage: 21 },
  { omschrijving: 'Kunststofkozijn voorbereiden', aantal: 1, prijs: 100, btw_percentage: 21 },
  { omschrijving: 'Kunststof kozijn plaatsen', aantal: 1, prijs: 120, btw_percentage: 21 },
  { omschrijving: 'Afwerking met kunststof en afkitten aan de binnenzijde rondom nieuw kozijn', aantal: 1, prijs: 30, btw_percentage: 21 },
  { omschrijving: 'Vloer afdekken met primacover', aantal: 1, prijs: 10, btw_percentage: 21 },
  { omschrijving: 'Reax bouwbak 6 kuub', aantal: 1, prijs: 350, btw_percentage: 21 },
]

const ZAKELIJK_REGELS: Regel[] = [
  { omschrijving: 'Kunststof kozijnen leveren', aantal: 1, prijs: 0, btw_percentage: 21 },
]

export function OfferteForm({ offerte, relaties, producten }: {
  offerte: Record<string, unknown> | null
  relaties: { id: string; bedrijfsnaam: string; contactpersoon?: string | null; email?: string | null; telefoon?: string | null; plaats?: string | null }[]
  producten: { id: string; naam: string; prijs: number; btw_percentage: number }[]
}) {
  const router = useRouter()
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const isNew = !offerte

  // Wizard state: 1=klant kiezen, 2=project kiezen, 3=formulier
  const [step, setStep] = useState(isNew ? 1 : 3)
  const [selectedRelatieId, setSelectedRelatieId] = useState<string>((offerte?.relatie_id as string) || '')
  const [selectedRelatieName, setSelectedRelatieName] = useState<string>('')
  const [selectedProjectId, setSelectedProjectId] = useState<string>((offerte?.project_id as string) || '')
  const [selectedProjectName, setSelectedProjectName] = useState<string>('')
  const [offerteType, setOfferteType] = useState<'particulier' | 'zakelijk' | null>(isNew ? null : 'zakelijk')
  const [showNewRelatie, setShowNewRelatie] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const [relatiesList, setRelatiesList] = useState(relaties)

  // Project state
  const [projecten, setProjecten] = useState<Project[]>([])
  const [loadingProjecten, setLoadingProjecten] = useState(false)
  const [showNewProject, setShowNewProject] = useState(false)
  const [newProjectName, setNewProjectName] = useState('')
  const [newProjectType, setNewProjectType] = useState<'particulier' | 'zakelijk' | null>(null)

  // Email / factuur conversie state
  const [showEmailResult, setShowEmailResult] = useState<{ link?: string; message?: string } | null>(null)
  const [showFactuurDialog, setShowFactuurDialog] = useState(false)

  // Inline nieuwe relatie
  const [nieuwRelatieData, setNieuwRelatieData] = useState({
    bedrijfsnaam: '', contactpersoon: '', email: '', telefoon: '', adres: '', postcode: '', plaats: '',
  })

  const [regels, setRegels] = useState<Regel[]>(
    (offerte?.regels as Regel[]) || []
  )

  // Set relatie/project naam voor bestaande offertes
  useEffect(() => {
    if (offerte?.relatie_id) {
      const rel = relaties.find(r => r.id === offerte.relatie_id)
      if (rel) setSelectedRelatieName(rel.bedrijfsnaam)
    }
    if (offerte?.project_id) {
      const proj = offerte.project as { id: string; naam: string } | null
      if (proj) setSelectedProjectName(proj.naam)
    }
  }, [offerte, relaties])

  function selectRelatie(id: string, naam: string) {
    setSelectedRelatieId(id)
    setSelectedRelatieName(naam)
    // Laad projecten voor deze klant
    setLoadingProjecten(true)
    getProjectenByRelatie(id).then(data => {
      setProjecten(data)
      setLoadingProjecten(false)
    })
    setStep(2)
  }

  async function selectProject(project: Project) {
    setSelectedProjectId(project.id)
    setSelectedProjectName(project.naam)
    // Laad laatste offerte voor dit project om regels te pre-fillen
    setLoading(true)
    const lastOfferte = await getLastOfferteForProject(project.id)
    if (lastOfferte && lastOfferte.regels && (lastOfferte.regels as Regel[]).length > 0) {
      setRegels((lastOfferte.regels as Regel[]).map((r: Record<string, unknown>) => ({
        omschrijving: r.omschrijving as string,
        aantal: r.aantal as number,
        prijs: r.prijs as number,
        btw_percentage: r.btw_percentage as number,
        product_id: (r.product_id as string) || undefined,
      })))
      // Auto-detect type op basis van regels
      const hasParticulierRegels = (lastOfferte.regels as Record<string, unknown>[]).some(
        (r) => (r.omschrijving as string).toLowerCase().includes('slopen') || (r.omschrijving as string).toLowerCase().includes('plaatsen')
      )
      setOfferteType(hasParticulierRegels ? 'particulier' : 'zakelijk')
    } else {
      // Geen eerdere offerte - laat type kiezen
      setOfferteType(null)
    }
    setLoading(false)
    setStep(3)
  }

  async function handleNewProject() {
    if (!newProjectName || !newProjectType) return
    setLoading(true)
    const result = await createProjectInline({
      naam: newProjectName,
      relatie_id: selectedRelatieId,
    })
    if (result.error) {
      setError(result.error)
      setLoading(false)
      return
    }
    setSelectedProjectId(result.id!)
    setSelectedProjectName(result.naam!)
    // Stel regels in op basis van gekozen type
    if (newProjectType === 'particulier') {
      setRegels([...PARTICULIER_REGELS])
    } else {
      setRegels([...ZAKELIJK_REGELS])
    }
    setOfferteType(newProjectType)
    setShowNewProject(false)
    setLoading(false)
    setStep(3)
  }

  async function handleNieuweRelatie() {
    if (!nieuwRelatieData.bedrijfsnaam) return
    setLoading(true)
    const result = await createRelatieInline(nieuwRelatieData)
    if (result.error) {
      setError(result.error)
      setLoading(false)
      return
    }
    const newRelatie = { id: result.id!, bedrijfsnaam: result.bedrijfsnaam!, contactpersoon: nieuwRelatieData.contactpersoon || null, email: nieuwRelatieData.email || null, telefoon: nieuwRelatieData.telefoon || null, plaats: nieuwRelatieData.plaats || null }
    setRelatiesList(prev => [...prev, newRelatie])
    setShowNewRelatie(false)
    setLoading(false)
    selectRelatie(result.id!, result.bedrijfsnaam!)
  }

  // Auto-bezorgkosten logica
  const updateBezorgkosten = useCallback((currentRegels: Regel[]) => {
    const kozijnenRegel = currentRegels.find(r =>
      r.omschrijving.toLowerCase().includes('kunststof kozijnen leveren') ||
      r.omschrijving.toLowerCase().includes('leveren kunststof kozijnen')
    )
    if (!kozijnenRegel) return currentRegels

    const kozijnenTotaal = kozijnenRegel.aantal * kozijnenRegel.prijs
    const bezorgIndex = currentRegels.findIndex(r => r.omschrijving === BEZORGKOSTEN_LABEL)
    const heeftBezorgkosten = bezorgIndex !== -1

    if (kozijnenTotaal < BEZORGKOSTEN_DREMPEL && kozijnenTotaal > 0) {
      if (!heeftBezorgkosten) {
        return [...currentRegels, { omschrijving: BEZORGKOSTEN_LABEL, aantal: 1, prijs: BEZORGKOSTEN_BEDRAG, btw_percentage: 21 }]
      }
    } else {
      if (heeftBezorgkosten) {
        return currentRegels.filter((_, i) => i !== bezorgIndex)
      }
    }
    return currentRegels
  }, [])

  useEffect(() => {
    if (!offerteType) return
    const updated = updateBezorgkosten(regels)
    if (updated !== regels) setRegels(updated)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [regels.find(r =>
    r.omschrijving.toLowerCase().includes('kunststof kozijnen leveren') ||
    r.omschrijving.toLowerCase().includes('leveren kunststof kozijnen')
  )?.prijs, regels.find(r =>
    r.omschrijving.toLowerCase().includes('kunststof kozijnen leveren') ||
    r.omschrijving.toLowerCase().includes('leveren kunststof kozijnen')
  )?.aantal])

  function addRegel() {
    setRegels([...regels, { omschrijving: '', aantal: 1, prijs: 0, btw_percentage: 21 }])
  }

  function removeRegel(index: number) {
    setRegels(regels.filter((_, i) => i !== index))
  }

  function updateRegel(index: number, field: keyof Regel, value: string | number) {
    const updated = [...regels]
    updated[index] = { ...updated[index], [field]: value }
    setRegels(updated)
  }

  function selectProduct(index: number, productId: string) {
    const product = producten.find(p => p.id === productId)
    if (product) {
      const updated = [...regels]
      updated[index] = {
        ...updated[index],
        product_id: productId,
        omschrijving: product.naam,
        prijs: product.prijs,
        btw_percentage: product.btw_percentage,
      }
      setRegels(updated)
    }
  }

  const subtotaal = regels.reduce((sum, r) => sum + r.aantal * r.prijs, 0)
  const btwTotaal = regels.reduce((sum, r) => sum + (r.aantal * r.prijs * r.btw_percentage) / 100, 0)
  const totaal = subtotaal + btwTotaal

  async function handleSubmit(formData: FormData) {
    setLoading(true)
    setError('')
    if (offerte) formData.set('id', offerte.id as string)
    formData.set('relatie_id', selectedRelatieId)
    formData.set('regels', JSON.stringify(regels))
    if (selectedProjectId) formData.set('project_id', selectedProjectId)
    const result = await saveOfferte(formData)
    if (result.error) {
      setError(result.error)
      setLoading(false)
    } else {
      router.push('/offertes')
    }
  }

  async function handleDelete() {
    if (!offerte || !confirm('Weet u zeker dat u deze offerte wilt verwijderen?')) return
    const result = await deleteOfferte(offerte.id as string)
    if (result.error) setError(result.error)
    else router.push('/offertes')
  }

  async function handleNieuweVersie() {
    if (!offerte) return
    setLoading(true)
    const result = await duplicateOfferte(offerte.id as string)
    if (result.error) {
      setError(result.error)
      setLoading(false)
    } else {
      router.push(`/offertes/${result.id}`)
    }
  }

  async function handleSendEmail() {
    if (!offerte) return
    setLoading(true)
    const result = await sendOfferteEmail(offerte.id as string)
    if (result.error) {
      setShowEmailResult({ link: result.link, message: result.error })
    } else {
      setShowEmailResult({ link: result.link, message: 'Offerte verstuurd!' })
    }
    setLoading(false)
  }

  async function handleConvertToFactuur(splitType: 'volledig' | 'split') {
    if (!offerte) return
    setLoading(true)
    const result = await convertToFactuur(offerte.id as string, splitType)
    if (result.error) {
      setError(result.error)
      setLoading(false)
    } else {
      setShowFactuurDialog(false)
      router.push(`/facturatie/${result.factuurIds![0]}`)
    }
  }

  const versieNummer = (offerte?.versie_nummer as number) || 1
  const offerteStatus = (offerte?.status as string) || 'concept'

  const filteredRelaties = relatiesList.filter(r =>
    r.bedrijfsnaam.toLowerCase().includes(searchQuery.toLowerCase()) ||
    (r.contactpersoon && r.contactpersoon.toLowerCase().includes(searchQuery.toLowerCase())) ||
    (r.plaats && r.plaats.toLowerCase().includes(searchQuery.toLowerCase()))
  )

  // ===== STAP 1: KLANT KIEZEN =====
  if (isNew && step === 1) {
    return (
      <div>
        <PageHeader
          title="Nieuwe offerte"
          description="Stap 1 van 3 - Selecteer klant"
          actions={
            <Button variant="ghost" onClick={() => router.push('/offertes')}>
              <ArrowLeft className="h-4 w-4" />
              Terug
            </Button>
          }
        />

        <div className="max-w-3xl mx-auto mt-4">
          {error && <div className="bg-red-50 text-red-600 text-sm p-3 rounded-md mb-4">{error}</div>}

          <div className="flex items-center gap-3 mb-4">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
              <input
                type="text"
                placeholder="Zoek klant op naam, contactpersoon of plaats..."
                className="w-full pl-10 pr-4 py-2.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent"
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                autoFocus
              />
            </div>
            <Button variant="secondary" onClick={() => setShowNewRelatie(true)}>
              <UserPlus className="h-4 w-4" />
              Nieuwe klant
            </Button>
          </div>

          {showNewRelatie && (
            <Card className="mb-4">
              <CardContent className="pt-6 space-y-3">
                <h3 className="font-semibold text-gray-900 mb-2">Nieuwe klant aanmaken</h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <Input
                    id="n_bedrijfsnaam"
                    label="Naam / Bedrijfsnaam *"
                    value={nieuwRelatieData.bedrijfsnaam}
                    onChange={e => setNieuwRelatieData(d => ({ ...d, bedrijfsnaam: e.target.value }))}
                    required
                  />
                  <Input
                    id="n_contactpersoon"
                    label="Contactpersoon"
                    value={nieuwRelatieData.contactpersoon}
                    onChange={e => setNieuwRelatieData(d => ({ ...d, contactpersoon: e.target.value }))}
                  />
                  <Input
                    id="n_email"
                    label="E-mail"
                    type="email"
                    value={nieuwRelatieData.email}
                    onChange={e => setNieuwRelatieData(d => ({ ...d, email: e.target.value }))}
                  />
                  <Input
                    id="n_telefoon"
                    label="Telefoon"
                    value={nieuwRelatieData.telefoon}
                    onChange={e => setNieuwRelatieData(d => ({ ...d, telefoon: e.target.value }))}
                  />
                  <Input
                    id="n_adres"
                    label="Adres"
                    value={nieuwRelatieData.adres}
                    onChange={e => setNieuwRelatieData(d => ({ ...d, adres: e.target.value }))}
                  />
                  <div className="grid grid-cols-2 gap-2">
                    <Input
                      id="n_postcode"
                      label="Postcode"
                      value={nieuwRelatieData.postcode}
                      onChange={e => setNieuwRelatieData(d => ({ ...d, postcode: e.target.value }))}
                    />
                    <Input
                      id="n_plaats"
                      label="Plaats"
                      value={nieuwRelatieData.plaats}
                      onChange={e => setNieuwRelatieData(d => ({ ...d, plaats: e.target.value }))}
                    />
                  </div>
                </div>
                <div className="flex gap-2 justify-end pt-2">
                  <Button variant="ghost" onClick={() => setShowNewRelatie(false)}>Annuleren</Button>
                  <Button onClick={handleNieuweRelatie} disabled={loading || !nieuwRelatieData.bedrijfsnaam}>
                    {loading ? 'Aanmaken...' : 'Aanmaken & selecteren'}
                  </Button>
                </div>
              </CardContent>
            </Card>
          )}

          <div className="space-y-2">
            {filteredRelaties.length === 0 ? (
              <div className="text-center py-8 text-gray-500 text-sm">
                {searchQuery ? 'Geen klanten gevonden' : 'Nog geen klanten'}
              </div>
            ) : (
              filteredRelaties.map(r => (
                <button
                  key={r.id}
                  onClick={() => selectRelatie(r.id, r.bedrijfsnaam)}
                  className="w-full text-left p-4 rounded-lg border border-gray-200 hover:border-primary hover:bg-blue-50/50 transition-all flex items-center justify-between group"
                >
                  <div>
                    <p className="font-medium text-gray-900">{r.bedrijfsnaam}</p>
                    <p className="text-sm text-gray-500">
                      {[r.contactpersoon, r.email, r.plaats].filter(Boolean).join(' · ')}
                    </p>
                  </div>
                  <ArrowLeft className="h-4 w-4 text-gray-400 group-hover:text-primary rotate-180" />
                </button>
              ))
            )}
          </div>
        </div>
      </div>
    )
  }

  // ===== STAP 2: PROJECT KIEZEN =====
  if (isNew && step === 2) {
    return (
      <div>
        <PageHeader
          title="Nieuwe offerte"
          description="Stap 2 van 3 - Selecteer project"
          actions={
            <Button variant="ghost" onClick={() => { setStep(1); setShowNewProject(false); setNewProjectName(''); setNewProjectType(null) }}>
              <ArrowLeft className="h-4 w-4" />
              Klant wijzigen
            </Button>
          }
        />

        <div className="max-w-3xl mx-auto mt-4">
          {error && <div className="bg-red-50 text-red-600 text-sm p-3 rounded-md mb-4">{error}</div>}

          <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 mb-6 flex items-center gap-2">
            <User className="h-4 w-4 text-blue-600" />
            <span className="text-sm text-blue-800">Klant: <strong>{selectedRelatieName}</strong></span>
          </div>

          {loadingProjecten ? (
            <div className="flex items-center justify-center py-12 text-gray-500">
              <Loader2 className="h-5 w-5 animate-spin mr-2" />
              Projecten laden...
            </div>
          ) : (
            <>
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-lg font-semibold text-gray-900">
                  {projecten.length > 0 ? 'Kies een bestaand project of maak een nieuw project' : 'Maak een nieuw project aan'}
                </h2>
              </div>

              {/* Nieuw project knop/formulier */}
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

                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">Type offerte</label>
                      <div className="grid grid-cols-2 gap-3">
                        <button
                          type="button"
                          onClick={() => setNewProjectType('particulier')}
                          className={`flex items-center gap-3 p-4 rounded-lg border-2 transition-all ${
                            newProjectType === 'particulier'
                              ? 'border-primary bg-blue-50'
                              : 'border-gray-200 hover:border-gray-300'
                          }`}
                        >
                          <User className={`h-5 w-5 ${newProjectType === 'particulier' ? 'text-primary' : 'text-gray-400'}`} />
                          <div className="text-left">
                            <p className="font-medium text-sm">Particulier</p>
                            <p className="text-xs text-gray-500">Incl. montage & sloop</p>
                          </div>
                        </button>
                        <button
                          type="button"
                          onClick={() => setNewProjectType('zakelijk')}
                          className={`flex items-center gap-3 p-4 rounded-lg border-2 transition-all ${
                            newProjectType === 'zakelijk'
                              ? 'border-primary bg-blue-50'
                              : 'border-gray-200 hover:border-gray-300'
                          }`}
                        >
                          <Building2 className={`h-5 w-5 ${newProjectType === 'zakelijk' ? 'text-primary' : 'text-gray-400'}`} />
                          <div className="text-left">
                            <p className="font-medium text-sm">Zakelijk</p>
                            <p className="text-xs text-gray-500">Alleen levering</p>
                          </div>
                        </button>
                      </div>
                    </div>

                    <div className="flex gap-2 justify-end pt-2">
                      <Button variant="ghost" onClick={() => { setShowNewProject(false); setNewProjectName(''); setNewProjectType(null) }}>
                        Annuleren
                      </Button>
                      <Button onClick={handleNewProject} disabled={loading || !newProjectName || !newProjectType}>
                        {loading ? 'Aanmaken...' : 'Project aanmaken'}
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              )}

              {/* Bestaande projecten */}
              {projecten.length > 0 && (
                <div className="space-y-2">
                  <h3 className="text-sm font-medium text-gray-500 uppercase tracking-wide mb-2">Bestaande projecten</h3>
                  {projecten.map(p => (
                    <button
                      key={p.id}
                      onClick={() => selectProject(p)}
                      disabled={loading}
                      className="w-full text-left p-4 rounded-lg border border-gray-200 hover:border-primary hover:bg-blue-50/50 transition-all flex items-center justify-between group"
                    >
                      <div className="flex items-center gap-3">
                        <div className="p-2 rounded-full bg-gray-100 text-gray-600 group-hover:bg-blue-50 group-hover:text-primary">
                          <FolderKanban className="h-4 w-4" />
                        </div>
                        <div>
                          <p className="font-medium text-gray-900">{p.naam}</p>
                          <p className="text-xs text-gray-500">
                            Nieuwe versie aanmaken op basis van laatste offerte
                          </p>
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
      </div>
    )
  }

  // ===== STAP 3: FORMULIER =====
  // Als we in stap 3 komen zonder regels en zonder type (bestaand project zonder eerdere offerte)
  // Laat dan alsnog type kiezen
  if (isNew && step === 3 && regels.length === 0 && !offerteType) {
    return (
      <div>
        <PageHeader
          title="Nieuwe offerte"
          description="Kies type offerte"
          actions={
            <Button variant="ghost" onClick={() => setStep(2)}>
              <ArrowLeft className="h-4 w-4" />
              Project wijzigen
            </Button>
          }
        />

        <div className="max-w-2xl mx-auto mt-4">
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 mb-6 flex items-center gap-2">
            <FolderKanban className="h-4 w-4 text-blue-600" />
            <span className="text-sm text-blue-800">
              Klant: <strong>{selectedRelatieName}</strong> &middot; Project: <strong>{selectedProjectName}</strong>
            </span>
          </div>

          <h2 className="text-lg font-semibold text-gray-900 text-center mb-6">
            Wat voor type offerte?
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <button
              onClick={() => { setOfferteType('particulier'); setRegels([...PARTICULIER_REGELS]) }}
              className="flex flex-col items-center gap-4 p-8 rounded-xl border-2 border-gray-200 hover:border-primary hover:bg-blue-50/50 transition-all group"
            >
              <div className="p-4 rounded-full bg-blue-50 text-primary group-hover:bg-primary group-hover:text-white transition-colors">
                <User className="h-8 w-8" />
              </div>
              <div className="text-center">
                <h3 className="text-lg font-semibold text-gray-900">Particulier</h3>
                <p className="text-sm text-gray-500 mt-1">Inclusief montage, sloop, afwerking en bouwbak</p>
              </div>
            </button>

            <button
              onClick={() => { setOfferteType('zakelijk'); setRegels([...ZAKELIJK_REGELS]) }}
              className="flex flex-col items-center gap-4 p-8 rounded-xl border-2 border-gray-200 hover:border-primary hover:bg-blue-50/50 transition-all group"
            >
              <div className="p-4 rounded-full bg-blue-50 text-primary group-hover:bg-primary group-hover:text-white transition-colors">
                <Building2 className="h-8 w-8" />
              </div>
              <div className="text-center">
                <h3 className="text-lg font-semibold text-gray-900">Zakelijk</h3>
                <p className="text-sm text-gray-500 mt-1">Alleen levering kunststof kozijnen</p>
              </div>
            </button>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div>
      <PageHeader
        title={isNew ? `Nieuwe offerte` : `Offerte ${offerte?.offertenummer} v${versieNummer}`}
        actions={
          <div className="flex gap-2 flex-wrap">
            {isNew ? (
              <Button variant="ghost" onClick={() => setStep(2)}>
                <ArrowLeft className="h-4 w-4" />
                Project wijzigen
              </Button>
            ) : null}
            <Button variant="ghost" onClick={() => router.push('/offertes')}>
              <ArrowLeft className="h-4 w-4" />
              Terug
            </Button>
            {!isNew && (
              <>
                <Button variant="secondary" onClick={handleNieuweVersie} disabled={loading}>
                  <Copy className="h-4 w-4" />
                  Nieuwe versie
                </Button>
                <a href={`/api/pdf/offerte/${offerte?.id}`} target="_blank" rel="noopener noreferrer">
                  <Button variant="secondary">
                    <Download className="h-4 w-4" />
                    PDF
                  </Button>
                </a>
                <Button variant="secondary" onClick={handleSendEmail} disabled={loading}>
                  <Send className="h-4 w-4" />
                  Versturen
                </Button>
                {offerteStatus === 'geaccepteerd' && (
                  <Button onClick={() => setShowFactuurDialog(true)} disabled={loading}>
                    <Receipt className="h-4 w-4" />
                    Factureren
                  </Button>
                )}
              </>
            )}
          </div>
        }
      />

      {error && <div className="bg-red-50 text-red-600 text-sm p-3 rounded-md mb-4">{error}</div>}

      {/* Email resultaat */}
      {showEmailResult && (
        <div className={`${showEmailResult.message === 'Offerte verstuurd!' ? 'bg-green-50 border-green-200' : 'bg-yellow-50 border-yellow-200'} border p-4 rounded-lg mb-4`}>
          <p className={`text-sm font-medium ${showEmailResult.message === 'Offerte verstuurd!' ? 'text-green-800' : 'text-yellow-800'}`}>
            {showEmailResult.message}
          </p>
          {showEmailResult.link && (
            <div className="mt-2 flex items-center gap-2">
              <input
                readOnly
                value={showEmailResult.link}
                className="flex-1 text-xs bg-white border rounded px-2 py-1"
              />
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  navigator.clipboard.writeText(showEmailResult.link!)
                }}
              >
                <Link2 className="h-3 w-3" />
                Kopieer link
              </Button>
            </div>
          )}
          <button onClick={() => setShowEmailResult(null)} className="text-xs underline mt-1 text-gray-500">Sluiten</button>
        </div>
      )}

      {/* Factuur conversie dialog */}
      {showFactuurDialog && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="bg-white rounded-xl p-6 max-w-md w-full mx-4 shadow-xl">
            <h3 className="text-lg font-semibold mb-2">Offerte factureren</h3>
            <p className="text-sm text-gray-600 mb-6">Hoe wilt u deze offerte factureren?</p>
            <div className="space-y-3">
              <button
                onClick={() => handleConvertToFactuur('volledig')}
                disabled={loading}
                className="w-full text-left p-4 rounded-lg border-2 border-gray-200 hover:border-primary hover:bg-blue-50/50 transition-all"
              >
                <p className="font-medium">Volledig factureren</p>
                <p className="text-sm text-gray-500">1 factuur voor het volledige bedrag van {formatCurrency(totaal || (offerte?.totaal as number) || 0)}</p>
              </button>
              <button
                onClick={() => handleConvertToFactuur('split')}
                disabled={loading}
                className="w-full text-left p-4 rounded-lg border-2 border-gray-200 hover:border-primary hover:bg-blue-50/50 transition-all"
              >
                <p className="font-medium">70% / 30% splitsen</p>
                <p className="text-sm text-gray-500">
                  Aanbetaling: {formatCurrency(((offerte?.totaal as number) || 0) * 0.7)} &middot;
                  Restbetaling: {formatCurrency(((offerte?.totaal as number) || 0) * 0.3)}
                </p>
              </button>
            </div>
            <div className="flex justify-end mt-4">
              <Button variant="ghost" onClick={() => setShowFactuurDialog(false)}>Annuleren</Button>
            </div>
          </div>
        </div>
      )}

      {/* Project info banner */}
      {isNew && selectedProjectName && (
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 mb-4 flex items-center gap-2">
          <FolderKanban className="h-4 w-4 text-blue-600" />
          <span className="text-sm text-blue-800">
            Klant: <strong>{selectedRelatieName}</strong> &middot; Project: <strong>{selectedProjectName}</strong>
            {offerteType && <> &middot; {offerteType === 'particulier' ? 'Particulier' : 'Zakelijk'}</>}
          </span>
        </div>
      )}
      {!isNew && (offerte?.project as { naam: string } | null)?.naam && (
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 mb-4 flex items-center gap-2">
          <FolderKanban className="h-4 w-4 text-blue-600" />
          <span className="text-sm text-blue-800">
            Project: <strong>{(offerte?.project as { naam: string }).naam}</strong>
          </span>
        </div>
      )}

      <form action={handleSubmit} className="space-y-4">
        <Card>
          <CardContent className="space-y-4 pt-6">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {isNew ? (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Offertenummer</label>
                  <div className="px-3 py-2 border border-gray-200 rounded-md text-sm bg-gray-50 text-gray-500">
                    Wordt automatisch gegenereerd
                  </div>
                </div>
              ) : (
                <Input id="offertenummer" name="offertenummer" label="Offertenummer" defaultValue={(offerte?.offertenummer as string) || ''} readOnly />
              )}
              <Input id="datum" name="datum" label="Datum *" type="date" defaultValue={(offerte?.datum as string) || new Date().toISOString().split('T')[0]} required />
              <Input id="geldig_tot" name="geldig_tot" label="Geldig tot" type="date" defaultValue={(offerte?.geldig_tot as string) || ''} />
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {!isNew && (
                <Select
                  id="relatie_id"
                  name="relatie_id"
                  label="Relatie"
                  defaultValue={(offerte?.relatie_id as string) || ''}
                  placeholder="Selecteer relatie..."
                  options={relatiesList.map(r => ({ value: r.id, label: r.bedrijfsnaam }))}
                  onChange={e => setSelectedRelatieId(e.target.value)}
                />
              )}
              <Select
                id="status"
                name="status"
                label="Status"
                defaultValue={(offerte?.status as string) || 'concept'}
                options={[
                  { value: 'concept', label: 'Concept' },
                  { value: 'verzonden', label: 'Verzonden' },
                  { value: 'geaccepteerd', label: 'Geaccepteerd' },
                  { value: 'afgewezen', label: 'Afgewezen' },
                  { value: 'verlopen', label: 'Verlopen' },
                ]}
              />
            </div>
            <Input id="onderwerp" name="onderwerp" label="Onderwerp" defaultValue={(offerte?.onderwerp as string) || ''} />
          </CardContent>
        </Card>

        <Card>
          <div className="px-6 py-4 border-b border-gray-200 flex items-center justify-between">
            <div>
              <h3 className="font-semibold text-gray-900">Regelitems</h3>
              {regels.some(r => r.omschrijving === BEZORGKOSTEN_LABEL) && (
                <p className="text-xs text-orange-600 mt-0.5">
                  Bezorgkosten automatisch toegevoegd (kozijnen onder {formatCurrency(BEZORGKOSTEN_DREMPEL)})
                </p>
              )}
            </div>
            <Button type="button" variant="secondary" size="sm" onClick={addRegel}>
              <Plus className="h-3 w-3" />
              Regel toevoegen
            </Button>
          </div>
          <CardContent>
            <div className="space-y-3">
              {regels.map((regel, i) => {
                const isBezorgkosten = regel.omschrijving === BEZORGKOSTEN_LABEL
                return (
                  <div key={i} className={`grid grid-cols-12 gap-2 items-end ${isBezorgkosten ? 'opacity-60 bg-orange-50 -mx-2 px-2 py-1 rounded' : ''}`}>
                    <div className="col-span-1">
                      <select
                        className="w-full px-2 py-2 border border-gray-300 rounded-md text-xs"
                        value={regel.product_id || ''}
                        onChange={(e) => selectProduct(i, e.target.value)}
                        disabled={isBezorgkosten}
                      >
                        <option value="">--</option>
                        {producten.map(p => (
                          <option key={p.id} value={p.id}>{p.naam}</option>
                        ))}
                      </select>
                    </div>
                    <div className="col-span-4">
                      <input
                        placeholder="Omschrijving"
                        className="w-full px-2 py-2 border border-gray-300 rounded-md text-sm"
                        value={regel.omschrijving}
                        onChange={(e) => updateRegel(i, 'omschrijving', e.target.value)}
                        required
                        readOnly={isBezorgkosten}
                      />
                    </div>
                    <div className="col-span-2">
                      <input
                        type="number"
                        placeholder="Aantal"
                        step="0.01"
                        className="w-full px-2 py-2 border border-gray-300 rounded-md text-sm"
                        value={regel.aantal}
                        onChange={(e) => updateRegel(i, 'aantal', parseFloat(e.target.value) || 0)}
                        readOnly={isBezorgkosten}
                      />
                    </div>
                    <div className="col-span-2">
                      <input
                        type="number"
                        placeholder="Prijs"
                        step="0.01"
                        className="w-full px-2 py-2 border border-gray-300 rounded-md text-sm"
                        value={regel.prijs}
                        onChange={(e) => updateRegel(i, 'prijs', parseFloat(e.target.value) || 0)}
                        readOnly={isBezorgkosten}
                      />
                    </div>
                    <div className="col-span-1">
                      <select
                        className="w-full px-2 py-2 border border-gray-300 rounded-md text-xs"
                        value={regel.btw_percentage}
                        onChange={(e) => updateRegel(i, 'btw_percentage', parseInt(e.target.value))}
                        disabled={isBezorgkosten}
                      >
                        <option value={0}>0%</option>
                        <option value={9}>9%</option>
                        <option value={21}>21%</option>
                      </select>
                    </div>
                    <div className="col-span-1 text-right text-sm font-medium">
                      {formatCurrency(regel.aantal * regel.prijs)}
                    </div>
                    <div className="col-span-1">
                      {!isBezorgkosten && (
                        <button type="button" onClick={() => removeRegel(i)} className="p-1 text-gray-400 hover:text-red-500">
                          <X className="h-4 w-4" />
                        </button>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>

            <div className="mt-6 flex justify-end">
              <div className="w-64 space-y-1 text-sm">
                <div className="flex justify-between"><span>Subtotaal:</span><span>{formatCurrency(subtotaal)}</span></div>
                <div className="flex justify-between"><span>BTW:</span><span>{formatCurrency(btwTotaal)}</span></div>
                <div className="flex justify-between font-bold text-base border-t pt-1"><span>Totaal:</span><span>{formatCurrency(totaal)}</span></div>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <label htmlFor="opmerkingen" className="block text-sm font-medium text-gray-700 mb-1">Opmerkingen</label>
            <textarea
              id="opmerkingen"
              name="opmerkingen"
              rows={3}
              defaultValue={(offerte?.opmerkingen as string) || ''}
              className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent"
            />
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
