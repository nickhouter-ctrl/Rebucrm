'use client'

import { useRouter } from 'next/navigation'
import { useState, useEffect } from 'react'
import { deleteOfferte, duplicateOfferte, sendOfferteEmail, getOfferteEmailDefaults, convertToFactuur, acceptOfferte, getOfferteBerichten, sendBerichtAdmin, getLeverancierPdfData, deleteLeverancierPdf, updateMargePercentage, archiveerOfferte } from '@/lib/actions'
import { PageHeader } from '@/components/ui/page-header'
import { Card, CardContent, CardFooter } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Select } from '@/components/ui/select'
import { Button } from '@/components/ui/button'
import { Dialog } from '@/components/ui/dialog'
import { formatCurrency, formatDateShort } from '@/lib/utils'
import { Save, Trash2, ArrowLeft, Plus, X, Copy, Download, Send, Receipt, Link2, FolderKanban, Loader2, Paperclip, Mail, CheckCircle, MessageCircle, ChevronDown, ChevronRight, Upload, FileText, Percent, Building2 } from 'lucide-react'
import { RecentTracker } from '@/components/layout/recent-tracker'

import { WizardStepper } from './wizard-stepper'
import { StapKlant } from './steps/stap-klant'
import { StapProject } from './steps/stap-project'
import { StapType } from './steps/stap-type'
import { StapTekeningen, ParsedPdfResult, RenderedTekening } from './steps/stap-tekeningen'
import { StapMarge } from './steps/stap-marge'
import { StapControleren } from './steps/stap-controleren'
import { StapVersturen } from './steps/stap-versturen'

interface Regel {
  omschrijving: string
  aantal: number | string
  prijs: number | string
  btw_percentage: number
  product_id?: string
}

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

export function OfferteForm({ offerte, relaties, producten, initialRelatieId, initialRelatieName, wizardMode, linkedOrder }: {
  offerte: Record<string, unknown> | null
  relaties: { id: string; bedrijfsnaam: string; contactpersoon?: string | null; email?: string | null; telefoon?: string | null; plaats?: string | null; standaard_marge?: number | null }[]
  producten: { id: string; naam: string; prijs: number; btw_percentage: number }[]
  initialRelatieId?: string | null
  initialRelatieName?: string | null
  wizardMode?: boolean | 'concept'
  linkedOrder?: { id: string; ordernummer: string; status: string } | null
}) {
  const router = useRouter()
  const isNew = !offerte
  const isConceptWizard = wizardMode === 'concept'

  // ========== WIZARD STATE ==========
  // Steps: 0=klant, 1=project, 2=type, 3=tekeningen, 4=marge, 5=controleren, 6=versturen
  const [step, setStep] = useState(() => {
    if (isConceptWizard) return 2 // concept offerte: klant+project al ingevuld, start bij type
    if (!isNew && wizardMode) return 3 // nieuwe versie: start bij tekeningen
    if (!isNew) return -1 // edit mode
    if (initialRelatieId) return 1 // skip klant kiezen
    return 0
  })

  const [selectedRelatieId, setSelectedRelatieId] = useState<string>(initialRelatieId || (offerte?.relatie_id as string) || '')
  const [selectedRelatieName, setSelectedRelatieName] = useState<string>(initialRelatieName || '')
  const [selectedProjectId, setSelectedProjectId] = useState<string>((offerte?.project_id as string) || '')
  const [selectedProjectName, setSelectedProjectName] = useState<string>('')
  const [offerteType, setOfferteType] = useState<'particulier' | 'zakelijk' | null>(isNew && !wizardMode ? null : isConceptWizard ? null : 'zakelijk')
  const [regels, setRegels] = useState<Regel[]>(() => {
    const bestaandeRegels = (offerte?.regels as Regel[]) || []
    // Bij nieuwe versie wizard: als regels leeg zijn, vul met standaard regels
    if (bestaandeRegels.length === 0 && wizardMode) {
      return [...ZAKELIJK_REGELS]
    }
    return bestaandeRegels
  })
  const [pendingPdfFile, setPendingPdfFile] = useState<File | null>(null)
  const [parsedPdfResult, setParsedPdfResult] = useState<ParsedPdfResult | null>(null)
  const [renderedTekeningen, setRenderedTekeningen] = useState<RenderedTekening[]>([])
  const [margePercentage, setMargePercentage] = useState(() => {
    const relatieId = initialRelatieId || (offerte?.relatie_id as string)
    if (relatieId) {
      const rel = relaties.find(r => r.id === relatieId)
      if (rel?.standaard_marge != null) return rel.standaard_marge
    }
    return 0
  })
  const [elementMarges, setElementMarges] = useState<Record<string, number>>({})
  const [savedOfferteId, setSavedOfferteId] = useState<string | null>(offerte ? (offerte.id as string) : null)

  // Set relatie/project naam voor bestaande offertes
  useEffect(() => {
    if (offerte?.relatie_id && !selectedRelatieName) {
      const rel = relaties.find(r => r.id === offerte.relatie_id)
      if (rel) setSelectedRelatieName(rel.bedrijfsnaam)
    }
    if (offerte?.project_id) {
      const proj = offerte.project as { id: string; naam: string } | null
      if (proj) setSelectedProjectName(proj.naam)
    }
  }, [offerte, relaties, selectedRelatieName])

  // ========== WIZARD STEP HANDLERS ==========

  function handleSelectRelatie(id: string, naam: string) {
    setSelectedRelatieId(id)
    setSelectedRelatieName(naam)
    // Standaard marge van relatie voorvullen
    const rel = relaties.find(r => r.id === id)
    if (rel?.standaard_marge != null && margePercentage === 0) {
      setMargePercentage(rel.standaard_marge)
    }
    setStep(1) // project
  }

  function handleSelectProject(
    project: { id: string; naam: string },
    prefilledRegels: Regel[] | null,
    detectedType: 'particulier' | 'zakelijk' | null
  ) {
    setSelectedProjectId(project.id)
    setSelectedProjectName(project.naam)
    if (prefilledRegels) {
      setRegels(prefilledRegels)
      setOfferteType(detectedType)
      // Auto-skip type step if type was detected
      if (detectedType) {
        setStep(3) // tekeningen
        return
      }
    }
    setStep(2) // type
  }

  function handleSelectType(type: 'particulier' | 'zakelijk') {
    setOfferteType(type)
    // Altijd regels vullen als ze leeg zijn OF alleen de standaard zakelijk regel bevatten
    const isDefaultZakelijk = regels.length === 1 && regels[0].omschrijving === ZAKELIJK_REGELS[0].omschrijving && Number(regels[0].prijs) === 0
    if (regels.length === 0 || isDefaultZakelijk) {
      setRegels(type === 'particulier' ? [...PARTICULIER_REGELS] : [...ZAKELIJK_REGELS])
    }
    setStep(3) // tekeningen
  }

  function handlePdfProcessed(result: ParsedPdfResult, tekeningen: RenderedTekening[]) {
    setParsedPdfResult(result)
    setRenderedTekeningen(tekeningen)
  }

  function handleRemovePdf() {
    setPendingPdfFile(null)
    setParsedPdfResult(null)
    setRenderedTekeningen([])
    setMargePercentage(0)
  }

  // Zoek kozijnen regel met brede matching, of voeg toe als niet gevonden
  function findOrCreateKozijnRegel(currentRegels: Regel[], prijs: number): Regel[] {
    const updated = [...currentRegels]
    const roundedPrijs = Math.round(prijs * 100) / 100
    // Breed zoeken: kozijn, kunststof, leveren
    let idx = updated.findIndex(r => {
      const o = r.omschrijving.toLowerCase()
      return o.includes('kozijn') && (o.includes('lever') || o.includes('kunststof'))
    })
    // Fallback: eerste regel met prijs 0 (placeholder)
    if (idx === -1) idx = updated.findIndex(r => Number(r.prijs) === 0 && r.omschrijving)
    if (idx !== -1) {
      updated[idx] = { ...updated[idx], prijs: roundedPrijs }
    } else {
      // Geen kozijnen regel gevonden — voeg toe aan begin
      updated.unshift({ omschrijving: 'Kunststof kozijnen leveren', aantal: 1, prijs: roundedPrijs, btw_percentage: 21 })
    }
    return updated
  }

  function handleMargeNext(marges: Record<string, number>) {
    setElementMarges(marges)
    // Calculate verkoop totaal with per-element marges and fill kozijnen prijs
    if (parsedPdfResult) {
      const verkoopTotaal = parsedPdfResult.elementen.reduce((sum, e) => {
        const eMarge = marges[e.naam] ?? margePercentage
        return sum + e.prijs * (1 + eMarge / 100) * e.hoeveelheid
      }, 0)
      setRegels(findOrCreateKozijnRegel(regels, verkoopTotaal))
    }
    setStep(5) // controleren
  }

  function handleMargeSkip() {
    // Fill kozijnen prijs without marge — use element sum (not PDF total which may include discount)
    if (parsedPdfResult) {
      const elementSum = parsedPdfResult.elementen.reduce((sum, e) => sum + e.prijs * e.hoeveelheid, 0)
      setRegels(findOrCreateKozijnRegel(regels, elementSum))
    }
    setMargePercentage(0)
    setStep(5) // controleren
  }

  function handleSaved(offerteId: string) {
    setSavedOfferteId(offerteId)
    setStep(6) // versturen
  }

  // ========== WIZARD RENDERING ==========

  if ((isNew || wizardMode || isConceptWizard) && step >= 0) {
    return (
      <div>
        <PageHeader
          title={isConceptWizard ? `Offerte afmaken — ${offerte?.offertenummer || ''}` : wizardMode ? `Nieuwe versie ${offerte?.offertenummer || ''}` : 'Nieuwe offerte'}
          actions={
            <Button variant="ghost" onClick={() => router.push(isConceptWizard ? '/offertes/concepten' : '/offertes')}>
              <ArrowLeft className="h-4 w-4" />
              Annuleren
            </Button>
          }
        />
        <div className="mt-4">
          <WizardStepper currentStep={step} />

          {step === 0 && (
            <StapKlant
              relaties={relaties}
              onSelectRelatie={handleSelectRelatie}
              onBack={() => router.push('/offertes')}
            />
          )}

          {step === 1 && (
            <StapProject
              relatieId={selectedRelatieId}
              relatieName={selectedRelatieName}
              onSelectProject={handleSelectProject}
              onBack={() => {
                if (initialRelatieId) {
                  router.push('/offertes')
                } else {
                  setStep(0)
                }
              }}
            />
          )}

          {step === 2 && (
            <StapType
              relatieName={selectedRelatieName}
              projectName={selectedProjectName}
              onSelectType={handleSelectType}
              onBack={() => setStep(1)}
            />
          )}

          {step === 3 && (
            <StapTekeningen
              pendingPdfFile={pendingPdfFile}
              parsedPdfResult={parsedPdfResult}
              renderedTekeningen={renderedTekeningen}
              onUploadPdf={(file) => setPendingPdfFile(file)}
              onPdfProcessed={handlePdfProcessed}
              onRemovePdf={handleRemovePdf}
              onSkip={() => setStep(5)}
              onNext={() => setStep(4)}
              onBack={() => setStep(2)}
            />
          )}

          {step === 4 && (
            parsedPdfResult && parsedPdfResult.elementen.length > 0 ? (
              <StapMarge
                parsedPdfResult={parsedPdfResult}
                margePercentage={margePercentage}
                onMargeChange={setMargePercentage}
                onNext={(marges) => handleMargeNext(marges)}
                onSkip={handleMargeSkip}
                onBack={() => setStep(3)}
              />
            ) : (
              // Auto-skip marge als er geen PDF elementen zijn
              <div className="max-w-3xl mx-auto text-center py-16">
                <p className="text-gray-500 mb-4">Geen leverancier elementen gevonden om marge op toe te passen.</p>
                <div className="flex justify-center gap-3">
                  <Button variant="ghost" onClick={() => setStep(3)}>Terug</Button>
                  <Button onClick={() => setStep(5)}>Volgende</Button>
                </div>
              </div>
            )
          )}

          {step === 5 && offerteType && (
            <StapControleren
              offerte={(wizardMode || isConceptWizard) ? offerte : null}
              isNew={!wizardMode && !isConceptWizard}
              relatieName={selectedRelatieName}
              projectName={selectedProjectName}
              offerteType={offerteType}
              selectedRelatieId={selectedRelatieId}
              selectedProjectId={selectedProjectId}
              regels={regels}
              onRegelsChange={setRegels}
              producten={producten}
              pendingPdfFile={pendingPdfFile}
              parsedPdfResult={parsedPdfResult}
              renderedTekeningen={renderedTekeningen}
              margePercentage={margePercentage}
              elementMarges={elementMarges}
              onSaved={handleSaved}
              onBack={() => setStep(4)}
            />
          )}

          {step === 6 && savedOfferteId && (
            <StapVersturen
              offerteId={savedOfferteId}
              offerteType={offerteType}
              onBack={() => router.push(`/offertes/${savedOfferteId}`)}
              onDone={() => router.push('/offertes')}
            />
          )}
        </div>
      </div>
    )
  }

  // ========== EDIT MODE (bestaande offertes) ==========
  return (
    <EditOfferteView
      offerte={offerte!}
      relaties={relaties}
      producten={producten}
      initialRegels={regels}
      selectedRelatieId={selectedRelatieId}
      selectedProjectId={selectedProjectId}
      selectedRelatieName={selectedRelatieName}
      selectedProjectName={selectedProjectName}
      linkedOrder={linkedOrder}
    />
  )
}

// ========== EDIT MODE COMPONENT ==========
function EditOfferteView({
  offerte,
  relaties,
  producten,
  initialRegels,
  selectedRelatieId: initRelatieId,
  selectedProjectId: initProjectId,
  selectedRelatieName,
  selectedProjectName,
  linkedOrder,
}: {
  offerte: Record<string, unknown>
  relaties: { id: string; bedrijfsnaam: string; contactpersoon?: string | null; email?: string | null; telefoon?: string | null; plaats?: string | null; standaard_marge?: number | null }[]
  producten: { id: string; naam: string; prijs: number; btw_percentage: number }[]
  initialRegels: Regel[]
  selectedRelatieId: string
  selectedProjectId: string
  selectedRelatieName: string
  selectedProjectName: string
  linkedOrder?: { id: string; ordernummer: string; status: string } | null
}) {
  const router = useRouter()
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [selectedRelatieIdState, setSelectedRelatieIdState] = useState(initRelatieId)
  const [regels, setRegels] = useState<Regel[]>(initialRegels)

  // Email state
  const [showEmailResult, setShowEmailResult] = useState<{ link?: string; message?: string } | null>(null)
  const [showEmailDialog, setShowEmailDialog] = useState(false)
  const [emailTo, setEmailTo] = useState('')
  const [emailSubject, setEmailSubject] = useState('')
  const [emailBody, setEmailBody] = useState('')
  const [emailAttachments, setEmailAttachments] = useState<File[]>([])
  const [sending, setSending] = useState(false)
  const [showFactuurDialog, setShowFactuurDialog] = useState(false)

  // Chat state
  const [showChat, setShowChat] = useState(false)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [chatBerichten, setChatBerichten] = useState<any[]>([])
  const [chatTekst, setChatTekst] = useState('')
  const [chatLoading, setChatLoading] = useState(false)
  const [chatSending, setChatSending] = useState(false)

  // Leverancier PDF state
  const [leverancierPdf, setLeverancierPdf] = useState<{ bestandsnaam: string; aantalElementen: number } | null>(null)
  const [leverancierElementen, setLeverancierElementen] = useState<{ naam: string; hoeveelheid: number; prijs: number }[]>([])
  const [leverancierTotaal, setLeverancierTotaal] = useState(0)
  const [pdfUploading, setPdfUploading] = useState(false)
  const [pdfProgress, setPdfProgress] = useState('')
  const [margePercentage, setMargePercentage] = useState(0)
  const [margeSaving, setMargeSaving] = useState(false)

  useEffect(() => {
    getLeverancierPdfData(offerte.id as string).then(data => {
      if (data) {
        setLeverancierPdf({ bestandsnaam: data.bestandsnaam, aantalElementen: data.elementen.length })
        setMargePercentage(data.margePercentage || 0)
        if (data.leverancierTotaal) setLeverancierTotaal(data.leverancierTotaal)
        if (data.parsedElementen && data.parsedElementen.length > 0) {
          setLeverancierElementen(data.parsedElementen)
        }
      }
    })
  }, [offerte.id])

  // Auto-update kozijnen leveren prijs when marge or elementen change
  useEffect(() => {
    if (leverancierElementen.length === 0 && leverancierTotaal === 0) return
    const elementSum = leverancierElementen.reduce((sum, e) => sum + e.prijs * e.hoeveelheid, 0)
    const verkoopTotaal = elementSum * (1 + margePercentage / 100)
    const kozijnRegelIndex = regels.findIndex(r =>
      r.omschrijving.toLowerCase().includes('kunststof kozijnen leveren') ||
      r.omschrijving.toLowerCase().includes('leveren kunststof kozijnen')
    )
    if (kozijnRegelIndex !== -1) {
      const currentPrijs = regels[kozijnRegelIndex].prijs
      const newPrijs = Math.round(verkoopTotaal * 100) / 100
      if (currentPrijs !== newPrijs) {
        const updated = [...regels]
        updated[kozijnRegelIndex] = { ...updated[kozijnRegelIndex], prijs: newPrijs }
        setRegels(updated)
      }
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [margePercentage, leverancierElementen, leverancierTotaal])

  async function handleSaveMarge() {
    setMargeSaving(true)
    const result = await updateMargePercentage(offerte.id as string, margePercentage)
    if (result.error) setError(result.error)
    setMargeSaving(false)
  }

  const versieNummer = (offerte.versie_nummer as number) || 1
  const offerteStatus = (offerte.status as string) || 'concept'
  const isReadOnly = offerteStatus !== 'concept'

  // --- Actions ---
  async function handleDelete() {
    if (!confirm('Weet u zeker dat u deze offerte wilt verwijderen?')) return
    const result = await deleteOfferte(offerte.id as string)
    if (result.error) setError(result.error)
    else router.push('/offertes')
  }

  async function handleNieuweVersie() {
    setLoading(true)
    const result = await duplicateOfferte(offerte.id as string)
    if (result.error) { setError(result.error); setLoading(false) }
    else router.push(`/offertes/${result.id}?wizard=true`)
  }

  async function openEmailDialog() {
    setLoading(true)
    const defaults = await getOfferteEmailDefaults(offerte.id as string)
    if (defaults.error) { setError(defaults.error); setLoading(false); return }
    setEmailTo(defaults.to || '')
    setEmailSubject(defaults.subject || '')
    setEmailBody(defaults.body || '')
    setEmailAttachments([])
    setShowEmailDialog(true)
    setLoading(false)
  }

  async function handleSendEmail() {
    setSending(true)
    const extraBijlagen: { filename: string; content: string }[] = []
    for (const file of emailAttachments) {
      const base64 = await new Promise<string>((resolve) => {
        const reader = new FileReader()
        reader.onload = () => resolve((reader.result as string).split(',')[1])
        reader.readAsDataURL(file)
      })
      extraBijlagen.push({ filename: file.name, content: base64 })
    }
    const result = await sendOfferteEmail(offerte.id as string, {
      to: emailTo, subject: emailSubject, body: emailBody,
      extraBijlagen: extraBijlagen.length > 0 ? extraBijlagen : undefined,
    })
    setSending(false)
    setShowEmailDialog(false)
    if (result.error) setShowEmailResult({ link: result.link, message: result.error })
    else setShowEmailResult({ link: result.link, message: 'Offerte verstuurd!' })
  }

  const [customSplitPercentage, setCustomSplitPercentage] = useState(50)

  async function handleConvertToFactuur(splitType: 'volledig' | 'split', percentage = 70) {
    setLoading(true)
    const result = await convertToFactuur(offerte.id as string, splitType, percentage)
    if (result.error) { setError(result.error); setLoading(false) }
    else { setShowFactuurDialog(false); router.push(`/facturatie/${result.factuurIds![0]}`) }
  }

  // Chat
  async function loadBerichten() {
    setChatLoading(true)
    const data = await getOfferteBerichten(offerte.id as string)
    setChatBerichten(data)
    setChatLoading(false)
  }

  async function toggleChat() {
    if (!showChat) await loadBerichten()
    setShowChat(!showChat)
  }

  async function handleSendChat() {
    if (!chatTekst.trim() || chatSending) return
    setChatSending(true)
    const result = await sendBerichtAdmin(offerte.id as string, chatTekst)
    if (result.success) { setChatTekst(''); await loadBerichten() }
    setChatSending(false)
  }

  useEffect(() => {
    if (!showChat) return
    const interval = setInterval(loadBerichten, 15000)
    return () => clearInterval(interval)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showChat])

  async function handleDeleteLeverancierPdf() {
    if (!confirm('Leverancier PDF verwijderen?')) return
    setPdfUploading(true)
    await deleteLeverancierPdf(offerte.id as string)
    setLeverancierPdf(null)
    setPdfUploading(false)
  }

  const subtotaal = regels.reduce((sum, r) => sum + (parseFloat(String(r.aantal)) || 0) * (parseFloat(String(r.prijs)) || 0), 0)
  const btwTotaal = regels.reduce((sum, r) => sum + ((parseFloat(String(r.aantal)) || 0) * (parseFloat(String(r.prijs)) || 0) * r.btw_percentage) / 100, 0)
  const totaal = subtotaal + btwTotaal

  return (
    <div>
      {Boolean(offerte?.id) && (
        <RecentTracker
          type="offerte"
          id={offerte!.id as string}
          label={(offerte!.offertenummer as string) || 'Offerte'}
          sub={selectedRelatieName || ((offerte!.onderwerp as string) ?? null)}
          status={(offerte!.status as string) || null}
          bedrag={typeof totaal === 'number' ? totaal : null}
          href={`/offertes/${offerte!.id}`}
        />
      )}
      {selectedRelatieIdState && selectedRelatieName && (
        <button
          onClick={() => router.push(`/relatiebeheer/${selectedRelatieIdState}`)}
          className="flex items-center gap-2 text-sm text-gray-500 hover:text-primary mb-1 transition-colors"
        >
          <Building2 className="h-4 w-4" />
          <span>{selectedRelatieName}</span>
        </button>
      )}
      <PageHeader
        title={`Offerte ${offerte.offertenummer} v${versieNummer}`}
        actions={
          <div className="flex gap-2 flex-wrap">
            <Button variant="ghost" onClick={() => router.back()}>
              <ArrowLeft className="h-4 w-4" />
              Terug
            </Button>
            <Button variant="secondary" onClick={handleNieuweVersie} disabled={loading}>
              <Copy className="h-4 w-4" />
              Nieuwe versie
            </Button>
            <a href={`/api/pdf/offerte/${offerte.id}`} target="_blank" rel="noopener noreferrer">
              <Button variant="secondary">
                <Download className="h-4 w-4" />
                PDF
              </Button>
            </a>
            <a href={`/api/pdf/offerte/${offerte.id}?hidePrices=1`} target="_blank" rel="noopener noreferrer">
              <Button variant="secondary">
                <Download className="h-4 w-4" />
                PDF zonder prijzen
              </Button>
            </a>
            <Button variant="secondary" onClick={openEmailDialog} disabled={loading}>
              <Send className="h-4 w-4" />
              Versturen
            </Button>
            {(offerteStatus === 'verzonden' || offerteStatus === 'concept') && (
              <Button
                variant="secondary"
                onClick={async () => {
                  if (!confirm('Weet u zeker dat u deze offerte wilt accepteren? Er wordt automatisch een order aangemaakt.')) return
                  setLoading(true)
                  const result = await acceptOfferte(offerte.id as string)
                  if (result.error) { setError(result.error); setLoading(false) }
                  else { router.refresh(); setLoading(false) }
                }}
                disabled={loading}
              >
                <CheckCircle className="h-4 w-4" />
                Accepteren
              </Button>
            )}
            {offerteStatus === 'geaccepteerd' && (
              <Button onClick={() => setShowFactuurDialog(true)} disabled={loading}>
                <Receipt className="h-4 w-4" />
                Factureren
              </Button>
            )}
            <Button variant="ghost" onClick={async () => {
              const huidigGearchiveerd = !!(offerte as Record<string, unknown>)?.gearchiveerd
              if (!confirm(huidigGearchiveerd ? 'Terug naar actieve lijst?' : 'Offerte naar archief verplaatsen?')) return
              await archiveerOfferte(offerte!.id as string, !huidigGearchiveerd)
              router.push('/offertes')
            }} disabled={loading}>
              {(offerte as Record<string, unknown>)?.gearchiveerd ? 'Terug naar actief' : 'Archiveren'}
            </Button>
            <Button variant="danger" onClick={handleDelete} disabled={loading}>
              <Trash2 className="h-4 w-4" />
              Verwijderen
            </Button>
          </div>
        }
      />

      {error && <div className="bg-red-50 text-red-600 text-sm p-3 rounded-md mb-4">{error}</div>}

      {/* Read-only banner voor verzonden offertes */}
      {isReadOnly && (
        <div className="bg-amber-50 border border-amber-200 rounded-lg p-4 mb-4 flex items-center justify-between">
          <p className="text-sm text-amber-800">
            Deze offerte is <strong>{offerteStatus}</strong> en kan niet meer worden aangepast.
          </p>
          <Button variant="secondary" size="sm" onClick={handleNieuweVersie} disabled={loading}>
            <Copy className="h-3.5 w-3.5" />
            Nieuwe versie aanmaken
          </Button>
        </div>
      )}

      {/* Link naar order */}
      {linkedOrder && (
        <div className="bg-green-50 border border-green-200 rounded-lg p-4 mb-4 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <FolderKanban className="h-4 w-4 text-green-600" />
            <p className="text-sm text-green-800">
              Klus <strong>{linkedOrder.ordernummer}</strong> aangemaakt
            </p>
          </div>
          <Button variant="secondary" size="sm" onClick={() => router.push(`/offertes/orders/${linkedOrder.id}`)}>
            <FolderKanban className="h-3.5 w-3.5" />
            Bekijk klus
          </Button>
        </div>
      )}

      {/* Email resultaat */}
      {showEmailResult && (
        <div className={`${showEmailResult.message === 'Offerte verstuurd!' ? 'bg-green-50 border-green-200' : 'bg-yellow-50 border-yellow-200'} border p-4 rounded-lg mb-4`}>
          <p className={`text-sm font-medium ${showEmailResult.message === 'Offerte verstuurd!' ? 'text-green-800' : 'text-yellow-800'}`}>{showEmailResult.message}</p>
          {showEmailResult.link && (
            <div className="mt-2 flex items-center gap-2">
              <input readOnly value={showEmailResult.link} className="flex-1 text-xs bg-white border rounded px-2 py-1" />
              <Button variant="ghost" size="sm" onClick={() => navigator.clipboard.writeText(showEmailResult.link!)}>
                <Link2 className="h-3 w-3" /> Kopieer link
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
              <button onClick={() => handleConvertToFactuur('volledig')} disabled={loading} className="w-full text-left p-4 rounded-lg border-2 border-gray-200 hover:border-primary hover:bg-blue-50/50 transition-all">
                <p className="font-medium">100% factureren</p>
                <p className="text-sm text-gray-500">1 factuur voor het volledige bedrag van {formatCurrency(totaal || (offerte.totaal as number) || 0)}</p>
              </button>
              <button onClick={() => handleConvertToFactuur('split', 70)} disabled={loading} className="w-full text-left p-4 rounded-lg border-2 border-gray-200 hover:border-primary hover:bg-blue-50/50 transition-all">
                <p className="font-medium">70% / 30% splitsen</p>
                <p className="text-sm text-gray-500">Aanbetaling: {formatCurrency(((offerte.totaal as number) || 0) * 0.7)} &middot; Restbetaling: {formatCurrency(((offerte.totaal as number) || 0) * 0.3)}</p>
              </button>
              <div className="p-4 rounded-lg border-2 border-gray-200">
                <p className="font-medium mb-3">Eigen percentage splitsen</p>
                <div className="flex items-center gap-3">
                  <div className="flex items-center gap-2 flex-1">
                    <input
                      type="number"
                      min="1"
                      max="99"
                      value={customSplitPercentage}
                      onChange={(e) => setCustomSplitPercentage(Math.min(99, Math.max(1, parseInt(e.target.value) || 50)))}
                      className="w-20 px-3 py-2 border border-gray-300 rounded-md text-sm text-right focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent"
                    />
                    <span className="text-sm text-gray-500">% / {100 - customSplitPercentage}%</span>
                  </div>
                  <Button size="sm" onClick={() => handleConvertToFactuur('split', customSplitPercentage)} disabled={loading}>
                    Factureren
                  </Button>
                </div>
                <p className="text-xs text-gray-400 mt-2">
                  Aanbetaling: {formatCurrency(((offerte.totaal as number) || 0) * customSplitPercentage / 100)} &middot; Rest: {formatCurrency(((offerte.totaal as number) || 0) * (100 - customSplitPercentage) / 100)}
                </p>
              </div>
            </div>
            <div className="flex justify-end mt-4"><Button variant="ghost" onClick={() => setShowFactuurDialog(false)}>Annuleren</Button></div>
          </div>
        </div>
      )}

      {/* Email compose dialog */}
      <Dialog open={showEmailDialog} onClose={() => setShowEmailDialog(false)} title="Offerte versturen" className="max-w-2xl">
        <div className="space-y-4">
          <div>
            <label htmlFor="email_to" className="block text-sm font-medium text-gray-700 mb-1"><Mail className="h-3.5 w-3.5 inline mr-1" />Aan</label>
            <input id="email_to" type="email" value={emailTo} onChange={e => setEmailTo(e.target.value)} className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent" placeholder="E-mailadres ontvanger" />
          </div>
          <div>
            <label htmlFor="email_subject" className="block text-sm font-medium text-gray-700 mb-1">Onderwerp</label>
            <input id="email_subject" type="text" value={emailSubject} onChange={e => setEmailSubject(e.target.value)} className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent" />
          </div>
          <div>
            <label htmlFor="email_body" className="block text-sm font-medium text-gray-700 mb-1">Bericht</label>
            <textarea id="email_body" value={emailBody} onChange={e => setEmailBody(e.target.value)} rows={12} className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent font-mono leading-relaxed" />
            <p className="text-xs text-gray-400 mt-1">De acceptatielink en handtekening worden automatisch onder het bericht geplaatst.</p>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2"><Paperclip className="h-3.5 w-3.5 inline mr-1" />Bijlagen</label>
            <div className="space-y-2">
              <div className="flex items-center gap-2 px-3 py-2 bg-blue-50 border border-blue-200 rounded-md text-sm">
                <Download className="h-4 w-4 text-blue-600 flex-shrink-0" />
                <span className="text-blue-800 flex-1">Offerte-{String(offerte.offertenummer)}.pdf</span>
                <span className="text-xs text-blue-500">Automatisch bijgevoegd</span>
              </div>
              {emailAttachments.map((file, i) => (
                <div key={i} className="flex items-center gap-2 px-3 py-2 bg-gray-50 border border-gray-200 rounded-md text-sm">
                  <Paperclip className="h-4 w-4 text-gray-500 flex-shrink-0" />
                  <span className="text-gray-700 flex-1 truncate">{file.name}</span>
                  <span className="text-xs text-gray-400">{(file.size / 1024).toFixed(0)} KB</span>
                  <button type="button" onClick={() => setEmailAttachments(prev => prev.filter((_, idx) => idx !== i))} className="text-gray-400 hover:text-red-500"><X className="h-4 w-4" /></button>
                </div>
              ))}
              <label className="flex items-center gap-2 px-3 py-2 border-2 border-dashed border-gray-300 rounded-md text-sm text-gray-500 hover:border-primary hover:text-primary cursor-pointer transition-colors">
                <Plus className="h-4 w-4" /><span>Tekening of document toevoegen (PDF)</span>
                <input type="file" accept=".pdf,.png,.jpg,.jpeg" multiple onChange={(e) => { setEmailAttachments(prev => [...prev, ...Array.from(e.target.files || [])]); e.target.value = '' }} className="hidden" />
              </label>
            </div>
          </div>
          <div className="flex justify-end gap-2 pt-2 border-t border-gray-200">
            <Button variant="ghost" onClick={() => setShowEmailDialog(false)} disabled={sending}>Annuleren</Button>
            <Button onClick={handleSendEmail} disabled={sending || !emailTo}>
              {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
              {sending ? 'Verzenden...' : 'Versturen'}
            </Button>
          </div>
        </div>
      </Dialog>

      {/* Project info */}
      {(offerte.project as { naam: string } | null)?.naam && (
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 mb-4 flex items-center gap-2">
          <FolderKanban className="h-4 w-4 text-blue-600" />
          <span className="text-sm text-blue-800">Project: <strong>{(offerte.project as { naam: string }).naam}</strong></span>
        </div>
      )}

      {/* Leverancier PDF + marge */}
      {leverancierPdf && (
        <Card className="mb-4">
          <div className="px-6 py-4 border-b border-gray-200 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <FileText className="h-5 w-5 text-gray-500" />
              <div>
                <p className="text-sm font-medium text-gray-900">Leverancier tekeningen</p>
                <p className="text-xs text-gray-500">{leverancierPdf.bestandsnaam} — {leverancierPdf.aantalElementen} elementen</p>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <label className="text-sm font-medium text-gray-700">Marge</label>
              <div className="relative w-24">
                <input
                  type="number"
                  value={margePercentage || ''}
                  onChange={e => setMargePercentage(parseFloat(e.target.value) || 0)}
                  placeholder="0"
                  className="w-full px-3 py-1.5 pr-8 border border-gray-300 rounded-md text-sm text-right focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent"
                  step="0.1"
                  min="0"
                />
                <Percent className="absolute right-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-gray-400" />
              </div>
              <Button size="sm" variant="secondary" onClick={handleSaveMarge} disabled={margeSaving}>
                {margeSaving ? <Loader2 className="h-3 w-3 animate-spin" /> : <Save className="h-3 w-3" />}
                Marge opslaan
              </Button>
            </div>
          </div>
          {leverancierElementen.length > 0 && (
            <CardContent>
              <div className="border border-gray-200 rounded-lg overflow-hidden">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-gray-50 border-b border-gray-200">
                      <th className="text-left px-4 py-2.5 font-medium text-gray-600">Element</th>
                      <th className="text-center px-3 py-2.5 font-medium text-gray-600 w-16">Hvh</th>
                      <th className="text-right px-4 py-2.5 font-medium text-gray-600">Inkoop/stuk</th>
                      {margePercentage > 0 && (
                        <>
                          <th className="text-right px-4 py-2.5 font-medium text-gray-600">Marge</th>
                          <th className="text-right px-4 py-2.5 font-medium text-gray-600">Verkoop/stuk</th>
                        </>
                      )}
                      <th className="text-right px-4 py-2.5 font-medium text-gray-600">Totaal</th>
                    </tr>
                  </thead>
                  <tbody>
                    {leverancierElementen.map((element, i) => {
                      const elementMarge = element.prijs * (margePercentage / 100)
                      const verkoopPerStuk = element.prijs + elementMarge
                      const regelTotaal = verkoopPerStuk * element.hoeveelheid
                      return (
                        <tr key={i} className="border-b border-gray-100 last:border-0">
                          <td className="px-4 py-2.5 font-medium text-gray-900">{element.naam}</td>
                          <td className="text-center px-3 py-2.5 text-gray-600">{element.hoeveelheid}</td>
                          <td className="text-right px-4 py-2.5 text-gray-600">{formatCurrency(element.prijs)}</td>
                          {margePercentage > 0 && (
                            <>
                              <td className="text-right px-4 py-2.5 text-green-600">+{formatCurrency(elementMarge)}</td>
                              <td className="text-right px-4 py-2.5 font-medium text-gray-900">{formatCurrency(verkoopPerStuk)}</td>
                            </>
                          )}
                          <td className="text-right px-4 py-2.5 font-medium text-gray-900">{formatCurrency(regelTotaal)}</td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
              <div className="mt-3 flex justify-end">
                <div className="w-72 space-y-1.5 text-sm">
                  {(() => {
                    const elementSum = leverancierElementen.reduce((sum, e) => sum + e.prijs * e.hoeveelheid, 0)
                    const inkoopTotaal = elementSum
                    const margeBedrag = inkoopTotaal * (margePercentage / 100)
                    const verkoopTotaal = inkoopTotaal + margeBedrag
                    return (
                      <>
                        <div className="flex justify-between text-gray-600">
                          <span>Inkoop totaal:</span>
                          <span>{formatCurrency(inkoopTotaal)}</span>
                        </div>
                        {margePercentage > 0 && (
                          <div className="flex justify-between text-green-600">
                            <span>Marge ({margePercentage}%):</span>
                            <span>+{formatCurrency(margeBedrag)}</span>
                          </div>
                        )}
                        <div className="flex justify-between font-bold text-base border-t border-gray-200 pt-1.5">
                          <span>Verkoop totaal:</span>
                          <span>{formatCurrency(verkoopTotaal)}</span>
                        </div>
                      </>
                    )
                  })()}
                </div>
              </div>
            </CardContent>
          )}
        </Card>
      )}

      {/* Use StapControleren for edit mode */}
      <StapControleren
        offerte={offerte}
        isNew={false}
        readOnly={isReadOnly}
        relatieName={selectedRelatieName}
        projectName={selectedProjectName}
        offerteType="zakelijk"
        selectedRelatieId={selectedRelatieIdState}
        selectedProjectId={initProjectId}
        regels={regels}
        onRegelsChange={setRegels}
        producten={producten}
        pendingPdfFile={null}
        onSaved={(id) => router.push('/offertes')}
        onBack={() => router.push('/offertes')}
      />

      {/* Chat panel */}
      <Card className="mt-4">
        <button type="button" onClick={toggleChat} className="w-full px-6 py-4 flex items-center justify-between hover:bg-gray-50 transition-colors">
          <div className="flex items-center gap-2">
            <MessageCircle className="h-4 w-4 text-gray-500" />
            <h3 className="font-semibold text-gray-900">Klantberichten</h3>
            {chatBerichten.filter((b: { afzender_type: string; gelezen: boolean }) => b.afzender_type === 'klant' && !b.gelezen).length > 0 && (
              <span className="bg-red-500 text-white text-xs px-2 py-0.5 rounded-full">
                {chatBerichten.filter((b: { afzender_type: string; gelezen: boolean }) => b.afzender_type === 'klant' && !b.gelezen).length}
              </span>
            )}
          </div>
          {showChat ? <ChevronDown className="h-4 w-4 text-gray-400" /> : <ChevronRight className="h-4 w-4 text-gray-400" />}
        </button>

        {showChat && (
          <CardContent className="pt-0">
            {chatLoading && chatBerichten.length === 0 ? (
              <div className="flex items-center justify-center py-8 text-gray-500">
                <Loader2 className="h-4 w-4 animate-spin mr-2" />
                Berichten laden...
              </div>
            ) : (
              <>
                <div className="space-y-3 max-h-80 overflow-y-auto mb-4">
                  {chatBerichten.length === 0 ? (
                    <p className="text-sm text-gray-500 text-center py-6">Nog geen berichten van klanten.</p>
                  ) : (
                    chatBerichten.map((bericht: { id: string; afzender_type: string; afzender_naam: string; tekst: string; created_at: string; afzender?: { naam: string } | null }) => (
                      <div key={bericht.id} className={`flex ${bericht.afzender_type === 'medewerker' ? 'justify-end' : 'justify-start'}`}>
                        <div className={`max-w-[75%] rounded-lg px-4 py-2.5 ${bericht.afzender_type === 'medewerker' ? 'bg-blue-100 text-blue-900' : 'bg-gray-100 text-gray-900'}`}>
                          <p className="text-xs font-medium mb-1 opacity-70">{bericht.afzender_naam || bericht.afzender?.naam || (bericht.afzender_type === 'klant' ? 'Klant' : 'Medewerker')}</p>
                          <p className="text-sm whitespace-pre-wrap">{bericht.tekst}</p>
                          <p className="text-[10px] mt-1 opacity-50">{formatDateShort(bericht.created_at)}</p>
                        </div>
                      </div>
                    ))
                  )}
                </div>
                <div className="flex gap-2">
                  <textarea value={chatTekst} onChange={(e) => setChatTekst(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSendChat() } }} placeholder="Typ uw antwoord..." rows={2} className="flex-1 border border-gray-300 rounded-md px-3 py-2 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent" />
                  <Button type="button" onClick={handleSendChat} disabled={chatSending || !chatTekst.trim()}>
                    <Send className="h-4 w-4" />
                  </Button>
                </div>
              </>
            )}
          </CardContent>
        )}
      </Card>
    </div>
  )
}
