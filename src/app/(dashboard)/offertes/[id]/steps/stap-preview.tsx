'use client'

import { useState, useMemo, useRef, useCallback, useEffect } from 'react'
import { ArrowLeft, ArrowRight, Loader2, Eye, EyeOff, Pencil, Trash2, MoreVertical, Percent, Sparkles, Undo2, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { saveOfferte, uploadLeverancierTekening, saveLeverancierTekeningen, saveConceptState, loadConceptState, approveConceptState } from '@/lib/actions'
import type { ParsedPdfResult, RenderedTekening, WipedRegion } from './stap-tekeningen'
import { PdfViewer, type PdfViewerHandle } from './preview/pdf-viewer'
import { PreviewChecklist } from './preview/checklist'
import { PreviewContextMenu, CorrectieBadge, type ContextMenuState, type CorrectieType } from './preview/context-menu'

// Een stap-correctie die de gebruiker heeft aangewezen via klik of vrije tekst.
// Wordt verzameld tot "Toepassen" wordt geklikt, dan in 1 AI-call doorgevoerd.
interface PendingCorrectie {
  id: string
  type: CorrectieType
  target: string
  targetType: 'element' | 'regel' | 'tekening'
  detail?: string
}

// Snapshot van state na elke correctieronde, voor undo
interface CorrectieSnapshot {
  ronde: number
  toelichting: string
  warnings: string[]
  appliedAt: string
  before: {
    elementMarges: Record<string, number>
    zichtbaarheid: ElementZichtbaarheid
    regels: Regel[]
    verwijderdeElementen: string[]
  }
}

interface Regel {
  omschrijving: string
  aantal: number | string
  prijs: number | string
  btw_percentage: number
  product_id?: string
}

interface DetectedLev {
  leverancier: string
  display_naam: string
  profiel: string
  confidence: number
}

// Visibility state per element-naam: AI-aangepast (geel) of door gebruiker verborgen
type ElementZichtbaarheid = Record<string, { hidden?: boolean; userEdited?: boolean; aiEdited?: boolean }>

function formatCurrency(amount: number) {
  return new Intl.NumberFormat('nl-NL', { style: 'currency', currency: 'EUR' }).format(amount)
}

function BulkBtn({ label, onClick, danger }: { label: string; onClick: () => void; danger?: boolean }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`w-full text-left px-3 py-1.5 hover:bg-gray-50 ${danger ? 'text-red-600' : 'text-gray-700'}`}
    >
      {label}
    </button>
  )
}

function numVal(v: number | string) {
  return typeof v === 'number' ? v : parseFloat(v) || 0
}

// Side-by-side preview: links de originele leverancier-PDF, rechts de concept-offerte.
// Gebruiker kan per element marge aanpassen, items verbergen, en pas op "Goedkeuren"
// wordt de offerte daadwerkelijk opgeslagen + bijlage aangemaakt.
export function StapPreview({
  offerte,
  isNew,
  relatieName,
  projectName,
  offerteType,
  selectedRelatieId,
  selectedProjectId,
  regels,
  onRegelsChange,
  pendingPdfFile,
  parsedPdfResult,
  renderedTekeningen,
  wipedRegions,
  margePercentage,
  elementMargesInitial,
  detectedLeverancier,
  onSaved,
  onBack,
}: {
  offerte: Record<string, unknown> | null
  isNew: boolean
  relatieName: string
  projectName: string
  offerteType: 'particulier' | 'zakelijk'
  selectedRelatieId: string
  selectedProjectId: string
  regels: Regel[]
  onRegelsChange: (regels: Regel[]) => void
  pendingPdfFile: File | null
  parsedPdfResult: ParsedPdfResult
  renderedTekeningen: RenderedTekening[]
  wipedRegions?: WipedRegion[]
  margePercentage: number
  elementMargesInitial: Record<string, number>
  detectedLeverancier: DetectedLev | null
  onSaved: (offerteId: string) => void
  onBack: () => void
}) {
  const viewerRef = useRef<PdfViewerHandle>(null)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [onderwerp, setOnderwerp] = useState((offerte?.onderwerp as string) || projectName || '')

  // Per-element marge override
  const [elementMarges, setElementMarges] = useState<Record<string, number>>(() => {
    const initial: Record<string, number> = {}
    parsedPdfResult.elementen.forEach(e => {
      initial[e.naam] = elementMargesInitial[e.naam] ?? margePercentage
    })
    return initial
  })

  const [zichtbaarheid, setZichtbaarheid] = useState<ElementZichtbaarheid>({})
  const [verwijderdeElementen, setVerwijderdeElementen] = useState<Set<string>>(new Set())
  const [vrijTekst, setVrijTekst] = useState('')

  // Correctie-stack: lijst pending correcties die de gebruiker heeft aangewezen
  // via contextmenu. Worden bij "Toepassen" gebundeld naar de AI gestuurd.
  const [pendingCorrecties, setPendingCorrecties] = useState<PendingCorrectie[]>([])
  const [contextMenu, setContextMenu] = useState<ContextMenuState | null>(null)
  const [applying, setApplying] = useState(false)
  const [history, setHistory] = useState<CorrectieSnapshot[]>([])
  const [aiToelichting, setAiToelichting] = useState<string>('')
  const [aiAangepast, setAiAangepast] = useState<Set<string>>(new Set())

  // Mapping element-naam → pagina(s) in originele PDF
  const naamToPages = useMemo(() => {
    const m = new Map<string, number[]>()
    for (const t of renderedTekeningen) {
      const arr = m.get(t.naam) ?? []
      if (!arr.includes(t.pageNum)) arr.push(t.pageNum)
      m.set(t.naam, arr)
    }
    return m
  }, [renderedTekeningen])

  // Verkoopprijs-totaal bij actuele marges (negeert verborgen elementen)
  const verkoopTotaal = useMemo(() => {
    return parsedPdfResult.elementen.reduce((sum, e) => {
      if (zichtbaarheid[e.naam]?.hidden) return sum
      const m = elementMarges[e.naam] ?? margePercentage
      return sum + e.prijs * (1 + m / 100) * e.hoeveelheid
    }, 0)
  }, [parsedPdfResult.elementen, elementMarges, margePercentage, zichtbaarheid])

  // Sync verkoopprijs naar de "Kunststof kozijnen leveren" regel
  function syncKozijnRegel() {
    const idx = regels.findIndex(r => {
      const o = r.omschrijving.toLowerCase()
      return o.includes('kozijn') && (o.includes('lever') || o.includes('kunststof'))
    })
    if (idx < 0) return
    const cur = numVal(regels[idx].prijs)
    const target = Math.round(verkoopTotaal * 100) / 100
    if (Math.abs(cur - target) > 0.01) {
      const updated = [...regels]
      updated[idx] = { ...updated[idx], prijs: target }
      onRegelsChange(updated)
    }
  }

  function setMargeFor(naam: string, value: string) {
    const v = parseFloat(value) || 0
    setElementMarges(prev => ({ ...prev, [naam]: v }))
  }

  function toggleHidden(naam: string) {
    setZichtbaarheid(prev => ({
      ...prev,
      [naam]: { ...prev[naam], hidden: !prev[naam]?.hidden, userEdited: true },
    }))
  }

  function bulkAlleMargesGelijk() {
    const target = parseFloat(prompt('Marge voor ALLE elementen in %:', String(margePercentage)) || '')
    if (isNaN(target)) return
    const updated: Record<string, number> = {}
    for (const e of parsedPdfResult.elementen) updated[e.naam] = target
    setElementMarges(updated)
  }

  function bulkVerbergPagina() {
    const p = parseInt(prompt('Verberg alle elementen op pagina (nummer):', '') || '')
    if (isNaN(p) || p < 1) return
    const updated = { ...zichtbaarheid }
    for (const t of renderedTekeningen) {
      if (t.pageNum === p) {
        updated[t.naam] = { ...updated[t.naam], hidden: true, userEdited: true }
      }
    }
    setZichtbaarheid(updated)
  }

  function bulkVerwijderPagina() {
    const p = parseInt(prompt('Verwijder alle elementen op pagina (nummer):', '') || '')
    if (isNaN(p) || p < 1) return
    if (!confirm(`Echt alle elementen op pagina ${p} verwijderen?`)) return
    const verwijderd = new Set(verwijderdeElementen)
    for (const t of renderedTekeningen) {
      if (t.pageNum === p) verwijderd.add(t.naam)
    }
    setVerwijderdeElementen(verwijderd)
  }

  function bulkResetMarges() {
    setElementMarges(() => {
      const empty: Record<string, number> = {}
      for (const e of parsedPdfResult.elementen) empty[e.naam] = margePercentage
      return empty
    })
  }

  function bulkAllesTonen() {
    setZichtbaarheid({})
    setVerwijderdeElementen(new Set())
  }

  const [bulkOpen, setBulkOpen] = useState(false)

  // ---- Contextmenu / correctie-stack ----
  function openContextMenu(e: React.MouseEvent, target: string, targetType: ContextMenuState['targetType']) {
    e.preventDefault()
    setContextMenu({ x: e.clientX, y: e.clientY, target, targetType })
  }

  function handleCorrectieAction(type: CorrectieType, target: string, targetType: ContextMenuState['targetType'], detail?: string) {
    // Voor verbergen/verwijderen: meteen visueel toepassen + ook in pending lijst
    // Aanpassen/verplaatsen: alleen in pending — pas bij Toepassen verwerkt door AI
    if (type === 'verbergen' && targetType === 'element') {
      setZichtbaarheid(prev => ({ ...prev, [target]: { ...prev[target], hidden: true, userEdited: true } }))
    }
    if (type === 'verwijderen' && targetType === 'element') {
      setVerwijderdeElementen(prev => new Set(prev).add(target))
    }
    if (type === 'verwijderen' && targetType === 'regel') {
      const idx = parseInt(target)
      if (!isNaN(idx)) {
        const updated = regels.filter((_, i) => i !== idx)
        onRegelsChange(updated)
      }
    }
    setPendingCorrecties(prev => [...prev, {
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      type, target, targetType, detail,
    }])
  }

  function removePendingCorrectie(id: string) {
    setPendingCorrecties(prev => prev.filter(c => c.id !== id))
  }

  function captureSnapshot(): CorrectieSnapshot['before'] {
    return {
      elementMarges: { ...elementMarges },
      zichtbaarheid: JSON.parse(JSON.stringify(zichtbaarheid)),
      regels: regels.map(r => ({ ...r })),
      verwijderdeElementen: Array.from(verwijderdeElementen),
    }
  }

  async function handleToepassen() {
    if (pendingCorrecties.length === 0 && !vrijTekst.trim()) return
    setApplying(true)
    setError('')
    setAiToelichting('')
    const snapshotBefore = captureSnapshot()

    try {
      const conceptState = {
        elementen: parsedPdfResult.elementen
          .filter(e => !verwijderdeElementen.has(e.naam))
          .map(e => ({
            naam: e.naam,
            hoeveelheid: e.hoeveelheid,
            prijs: e.prijs,
            marge: elementMarges[e.naam] ?? margePercentage,
            verborgen: !!zichtbaarheid[e.naam]?.hidden,
          })),
        regels: regels.map(r => ({
          omschrijving: r.omschrijving,
          aantal: numVal(r.aantal),
          prijs: numVal(r.prijs),
          btw_percentage: r.btw_percentage,
        })),
        margePercentage,
        onderwerp,
      }

      const res = await fetch('/api/ai/apply-corrections', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          conceptState,
          correcties: pendingCorrecties.map(c => ({ type: c.type, target: c.target, detail: c.detail })),
          vrijTekst: vrijTekst.trim() || undefined,
          leverancier: detectedLeverancier?.display_naam,
        }),
      })

      if (!res.ok) {
        const errBody = await res.json().catch(() => ({}))
        throw new Error(errBody.error || `AI-call faalde (status ${res.status})`)
      }

      const data = await res.json() as {
        element_updates?: Array<{ naam: string; hoeveelheid?: number; prijs?: number; marge_percentage?: number; verborgen?: boolean; verwijderd?: boolean }>
        regel_updates?: Array<{ index: number; actie: 'toevoegen' | 'aanpassen' | 'verwijderen'; omschrijving?: string; aantal?: number; prijs?: number; btw_percentage?: number }>
        toelichting?: string
        warnings?: string[]
      }

      const aangepasteNamen = new Set<string>()
      // Element updates toepassen
      const newMarges = { ...elementMarges }
      const newZicht = { ...zichtbaarheid }
      const newVerwijderd = new Set(verwijderdeElementen)
      for (const u of data.element_updates || []) {
        aangepasteNamen.add(u.naam)
        if (u.marge_percentage !== undefined) newMarges[u.naam] = u.marge_percentage
        if (u.verborgen !== undefined) newZicht[u.naam] = { ...newZicht[u.naam], hidden: u.verborgen, aiEdited: true }
        if (u.verwijderd) newVerwijderd.add(u.naam)
      }
      setElementMarges(newMarges)
      setZichtbaarheid(newZicht)
      setVerwijderdeElementen(newVerwijderd)

      // Regel updates toepassen
      let newRegels = [...regels]
      const updates = (data.regel_updates || []).slice().sort((a, b) => {
        // Verwijderen eerst (van hoog naar laag) zodat indexen kloppen
        if (a.actie === 'verwijderen' && b.actie !== 'verwijderen') return -1
        if (a.actie !== 'verwijderen' && b.actie === 'verwijderen') return 1
        if (a.actie === 'verwijderen' && b.actie === 'verwijderen') return b.index - a.index
        return 0
      })
      for (const u of updates) {
        if (u.actie === 'toevoegen') {
          newRegels.push({
            omschrijving: u.omschrijving || '(nieuwe regel)',
            aantal: u.aantal ?? 1,
            prijs: u.prijs ?? 0,
            btw_percentage: u.btw_percentage ?? 21,
          })
        } else if (u.actie === 'verwijderen') {
          if (u.index >= 0 && u.index < newRegels.length) newRegels.splice(u.index, 1)
        } else if (u.actie === 'aanpassen' && u.index >= 0 && u.index < newRegels.length) {
          newRegels[u.index] = {
            ...newRegels[u.index],
            omschrijving: u.omschrijving ?? newRegels[u.index].omschrijving,
            aantal: u.aantal ?? newRegels[u.index].aantal,
            prijs: u.prijs ?? newRegels[u.index].prijs,
            btw_percentage: u.btw_percentage ?? newRegels[u.index].btw_percentage,
          }
        }
      }
      onRegelsChange(newRegels)
      setAiAangepast(prev => new Set([...prev, ...aangepasteNamen]))
      setAiToelichting(data.toelichting || '')

      // Snapshot voor undo
      setHistory(prev => [...prev, {
        ronde: prev.length + 1,
        toelichting: data.toelichting || '(geen toelichting)',
        warnings: data.warnings || [],
        appliedAt: new Date().toISOString(),
        before: snapshotBefore,
      }])

      // Pending correcties zijn verwerkt
      setPendingCorrecties([])
      setVrijTekst('')
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Toepassen mislukt')
    } finally {
      setApplying(false)
    }
  }

  function undoLastRonde() {
    const last = history[history.length - 1]
    if (!last) return
    setElementMarges(last.before.elementMarges)
    setZichtbaarheid(last.before.zichtbaarheid)
    onRegelsChange(last.before.regels)
    setVerwijderdeElementen(new Set(last.before.verwijderdeElementen))
    setHistory(prev => prev.slice(0, -1))
    setAiToelichting('')
  }

  // Hover op element → highlight in originele PDF
  const hoverElement = useCallback((naam: string) => {
    const pages = naamToPages.get(naam)
    if (!pages || pages.length === 0) return
    viewerRef.current?.highlightPage(pages[0])
  }, [naamToPages])

  // Bedragen die in concept-regels staan — voor sanity-check op zichtbare leveranciersprijzen
  const conceptBedragen = useMemo(() => {
    return regels.map(r => numVal(r.aantal) * numVal(r.prijs)).filter(b => b > 0)
  }, [regels])

  // ---- Persistentie van concept-state ----
  // Load: bij mount eenmalig vanuit DB (alleen bij bestaande offerte)
  const offerteId = (offerte?.id as string) || ''
  useEffect(() => {
    if (!offerteId) return
    let cancelled = false
    loadConceptState(offerteId).then(saved => {
      if (cancelled || !saved) return
      const s = saved.state as Partial<{
        elementMarges: Record<string, number>
        zichtbaarheid: ElementZichtbaarheid
        verwijderdeElementen: string[]
        regels: Regel[]
        onderwerp: string
        history: CorrectieSnapshot[]
      }>
      if (s.elementMarges) setElementMarges(s.elementMarges)
      if (s.zichtbaarheid) setZichtbaarheid(s.zichtbaarheid)
      if (s.verwijderdeElementen) setVerwijderdeElementen(new Set(s.verwijderdeElementen))
      if (s.regels) onRegelsChange(s.regels)
      if (s.onderwerp) setOnderwerp(s.onderwerp)
      if (s.history) setHistory(s.history)
    })
    return () => { cancelled = true }
  }, [offerteId]) // eslint-disable-line react-hooks/exhaustive-deps

  // ---- Keyboard shortcuts ----
  // J / K  → pagina down/up
  // X      → verberg gefocust element (eerste low-confidence anders eerste)
  // ⌘Z     → ongedaan laatste ronde
  // ⌘Enter → AI toepassen
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      // Negeer als gebruiker in input/textarea typt
      const target = e.target as HTMLElement
      if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable)) return

      const cmd = e.metaKey || e.ctrlKey
      if (cmd && e.key === 'z') {
        e.preventDefault()
        if (history.length > 0) undoLastRonde()
        return
      }
      if (cmd && e.key === 'Enter') {
        e.preventDefault()
        if (!applying && (pendingCorrecties.length > 0 || vrijTekst.trim())) handleToepassen()
        return
      }
      if (e.key === 'j' || e.key === 'J') {
        e.preventDefault()
        viewerRef.current?.jumpToPage(Math.min(99, (pageHintRef.current || 1) + 1))
        pageHintRef.current = (pageHintRef.current || 1) + 1
      }
      if (e.key === 'k' || e.key === 'K') {
        e.preventDefault()
        const next = Math.max(1, (pageHintRef.current || 1) - 1)
        viewerRef.current?.jumpToPage(next)
        pageHintRef.current = next
      }
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [history.length, applying, pendingCorrecties.length, vrijTekst])

  const pageHintRef = useRef<number>(1)

  // Save: debounced bij elke wijziging
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  useEffect(() => {
    if (!offerteId) return
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current)
    saveTimerRef.current = setTimeout(() => {
      saveConceptState({
        offerteId,
        ronde: history.length,
        state: {
          elementMarges,
          zichtbaarheid,
          verwijderdeElementen: Array.from(verwijderdeElementen),
          regels,
          onderwerp,
          history,
        },
      }).catch(() => { /* niet kritiek */ })
    }, 1500)
    return () => { if (saveTimerRef.current) clearTimeout(saveTimerRef.current) }
  }, [offerteId, elementMarges, zichtbaarheid, verwijderdeElementen, regels, onderwerp, history])

  const inkoopprijzen = useMemo(() => parsedPdfResult.elementen.map(e => e.prijs), [parsedPdfResult.elementen])

  // Pas verkoopprijs door op kozijn-regel telkens als marges/zichtbaarheid wijzigen
  // (run als side-effect via memo + immediate apply)
  useMemo(() => syncKozijnRegel(), [verkoopTotaal]) // eslint-disable-line react-hooks/exhaustive-deps

  async function uploadPreProcessedPdf(offerteId: string) {
    if (!pendingPdfFile) return { ok: true }
    try {
      const fd = new FormData()
      fd.append('pdf', pendingPdfFile)
      fd.append('offerte_id', offerteId)
      // We hergebruiken niet de processLeverancierPdf server-action — die parsed
      // opnieuw. Hier gebruiken we de al uitgevoerde tekening-uploads + metadata.
      // Voor compatibiliteit: roep saveLeverancierTekeningen aan met de paths.
      // Tekeningen uploaden:
      const elementToPaths = new Map<string, { paths: string[]; pageNums: number[] }>()
      let i = 0
      for (const t of renderedTekeningen) {
        const fdFile = new FormData()
        const file = new File([t.blob], `tekening-${t.pageNum}.jpg`, { type: 'image/jpeg' })
        fdFile.append('image', file)
        const pageIdx = i++
        const r = await uploadLeverancierTekening(offerteId, pageIdx, fdFile)
        if ('error' in r && r.error) {
          throw new Error(r.error)
        }
        const cur = elementToPaths.get(t.naam) ?? { paths: [], pageNums: [] }
        if ('path' in r && r.path) {
          cur.paths.push(r.path)
          cur.pageNums.push(t.pageNum)
        }
        elementToPaths.set(t.naam, cur)
      }
      const tekeningenPayload = Array.from(elementToPaths.entries()).flatMap(([naam, info]) =>
        info.paths.map((p, idx) => ({ naam, tekeningPath: p, pageIndex: idx, totalPages: info.paths.length }))
      )
      const elementPrijzen: Record<string, { prijs: number; hoeveelheid: number }> = {}
      for (const e of parsedPdfResult.elementen) {
        if (zichtbaarheid[e.naam]?.hidden) continue
        elementPrijzen[e.naam] = { prijs: e.prijs, hoeveelheid: e.hoeveelheid }
      }
      await saveLeverancierTekeningen(offerteId, tekeningenPayload, margePercentage, elementMarges, elementPrijzen)
      // De PDF zelf moet ook nog naar storage — die was al via processLeverancierPdf
      // gegaan in het vorige scherm. Hier zou je `processLeverancierPdf` kunnen
      // aanroepen om de PDF apart te uploaden. Voor nu: skipping (PDF is al
      // in client memory, server kan opnieuw vragen).
      return { ok: true }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'PDF upload mislukt')
      return { ok: false }
    }
  }

  async function handleGoedkeuren() {
    setSaving(true)
    setError('')
    try {
      const fd = new FormData()
      if (offerte) fd.set('id', offerte.id as string)
      fd.set('relatie_id', selectedRelatieId)
      if (selectedProjectId) fd.set('project_id', selectedProjectId)
      fd.set('onderwerp', onderwerp || projectName || '')
      fd.set('regels', JSON.stringify(regels.map(r => ({ ...r, aantal: numVal(r.aantal), prijs: numVal(r.prijs) }))))
      const result = await saveOfferte(fd)
      if (result.error) { setError(result.error); setSaving(false); return }
      const offerteId = result.id!
      if (pendingPdfFile) {
        const up = await uploadPreProcessedPdf(offerteId)
        if (!up.ok) { setSaving(false); return }
      }
      // Concept-state markeren als goedgekeurd zodat hij bij nieuwe versie niet
      // opnieuw wordt geladen
      try { await approveConceptState(offerteId) } catch { /* niet kritiek */ }
      setSaving(false)
      onSaved(offerteId)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Opslaan mislukt')
      setSaving(false)
    }
  }

  return (
    <div className="max-w-[1600px] mx-auto">
      <div className="flex items-center justify-between mb-3">
        <div>
          <h2 className="text-xl font-semibold text-gray-900">Concept-offerte controleren</h2>
          <p className="text-sm text-gray-500 mt-0.5">
            Vergelijk de leveranciersofferte (links) met de gegenereerde concept-offerte (rechts). Pas waar nodig aan en klik <strong>Goedkeuren</strong>.
          </p>
          <p className="text-[11px] text-gray-400 mt-0.5">
            Sneltoetsen: <kbd className="px-1 bg-gray-100 border rounded">J</kbd>/<kbd className="px-1 bg-gray-100 border rounded">K</kbd> pagina,{' '}
            <kbd className="px-1 bg-gray-100 border rounded">⌘↵</kbd> AI toepassen,{' '}
            <kbd className="px-1 bg-gray-100 border rounded">⌘Z</kbd> ongedaan
          </p>
        </div>
        <Button variant="ghost" onClick={onBack}>
          <ArrowLeft className="h-4 w-4" />
          Terug
        </Button>
      </div>

      {error && <div className="bg-red-50 text-red-600 text-sm p-3 rounded-md mb-3">{error}</div>}

      <PreviewChecklist
        parsedPdfResult={parsedPdfResult}
        renderedTekeningen={renderedTekeningen}
        margePercentage={margePercentage}
        elementMarges={elementMarges}
        detectedLeverancierLabel={detectedLeverancier?.display_naam}
        conceptBedragen={conceptBedragen}
        inkoopprijzen={inkoopprijzen}
      />

      {/* Side-by-side */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3 mb-3">
        {/* LINKS: originele PDF */}
        <div className="bg-white border border-gray-200 rounded-xl overflow-hidden" style={{ height: 'calc(100vh - 380px)', minHeight: 500 }}>
          <PdfViewer ref={viewerRef} file={pendingPdfFile} wipedRegions={wipedRegions} className="h-full" />
        </div>

        {/* RECHTS: concept */}
        <div className="bg-white border border-gray-200 rounded-xl overflow-hidden flex flex-col" style={{ height: 'calc(100vh - 380px)', minHeight: 500 }}>
          <div className="px-3 py-2 bg-gray-50 border-b border-gray-200 flex items-center justify-between sticky top-0">
            <span className="text-xs font-medium text-gray-700">Concept-offerte</span>
            <div className="relative">
              <Button size="sm" variant="ghost" onClick={() => setBulkOpen(o => !o)}>
                <Percent className="h-3 w-3" />
                Bulk-acties
              </Button>
              {bulkOpen && (
                <div
                  className="absolute right-0 top-full mt-1 bg-white border border-gray-200 rounded-md shadow-lg py-1 text-xs z-20 min-w-[220px]"
                  onMouseLeave={() => setBulkOpen(false)}
                >
                  <BulkBtn label="Marge voor alle elementen…" onClick={() => { setBulkOpen(false); bulkAlleMargesGelijk() }} />
                  <BulkBtn label="Reset marges naar globaal" onClick={() => { setBulkOpen(false); bulkResetMarges() }} />
                  <div className="border-t border-gray-100 my-1" />
                  <BulkBtn label="Verberg alle elementen op pagina…" onClick={() => { setBulkOpen(false); bulkVerbergPagina() }} />
                  <BulkBtn label="Verwijder alle elementen op pagina…" danger onClick={() => { setBulkOpen(false); bulkVerwijderPagina() }} />
                  <div className="border-t border-gray-100 my-1" />
                  <BulkBtn label="Toon alles weer (reset)" onClick={() => { setBulkOpen(false); bulkAllesTonen() }} />
                </div>
              )}
            </div>
          </div>
          <div className="flex-1 overflow-y-auto p-3 space-y-3">
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Onderwerp</label>
              <input
                type="text"
                value={onderwerp}
                onChange={(e) => setOnderwerp(e.target.value)}
                className="w-full px-2 py-1.5 text-sm border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-primary"
              />
            </div>

            <div>
              <h3 className="text-xs font-medium text-gray-600 mb-1.5 uppercase tracking-wide">Elementen uit leveranciersofferte</h3>
              <div className="border border-gray-200 rounded-md overflow-hidden">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="bg-gray-50 border-b border-gray-200">
                      <th className="text-left px-2 py-1.5 font-medium text-gray-600">Element</th>
                      <th className="text-center px-1.5 py-1.5 font-medium text-gray-600 w-10">Hvh</th>
                      <th className="text-right px-2 py-1.5 font-medium text-gray-600">Inkoop</th>
                      <th className="text-center px-1.5 py-1.5 font-medium text-gray-600 w-16">Marge%</th>
                      <th className="text-right px-2 py-1.5 font-medium text-gray-600">Verkoop</th>
                      <th className="px-1 py-1.5 w-12"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {parsedPdfResult.elementen.filter(el => !verwijderdeElementen.has(el.naam)).map((el) => {
                      const m = elementMarges[el.naam] ?? margePercentage
                      const verkoop = el.prijs * (1 + m / 100) * el.hoeveelheid
                      const hidden = !!zichtbaarheid[el.naam]?.hidden
                      const aiHl = aiAangepast.has(el.naam)
                      const pages = naamToPages.get(el.naam) || []
                      const pendingForThis = pendingCorrecties.filter(c => c.targetType === 'element' && c.target === el.naam)
                      return (
                        <tr
                          key={el.naam}
                          className={`border-b border-gray-100 last:border-0 ${hidden ? 'opacity-40 bg-gray-50' : ''} ${aiHl ? 'bg-yellow-50' : ''} hover:bg-blue-50/50`}
                          onMouseEnter={() => hoverElement(el.naam)}
                          onContextMenu={(e) => openContextMenu(e, el.naam, 'element')}
                        >
                          <td className="px-2 py-1.5 font-medium text-gray-900">
                            <div className="flex items-start gap-1.5 flex-wrap">
                              {/* Confidence-bolletje: groen >= 0.9, geel 0.7-0.9, rood < 0.7 */}
                              {typeof el.confidence === 'number' && el.confidence < 1 && (
                                <span
                                  className={`inline-block w-2 h-2 rounded-full mt-1.5 flex-shrink-0 ${
                                    el.confidence < 0.7 ? 'bg-red-500' : el.confidence < 0.9 ? 'bg-amber-400' : 'bg-green-500'
                                  }`}
                                  title={`AI confidence: ${Math.round(el.confidence * 100)}%${el.confidence_reden ? ` — ${el.confidence_reden}` : ''}`}
                                />
                              )}
                              <button
                                type="button"
                                className="hover:underline text-left"
                                title={pages.length ? `Pagina ${pages.join(', ')} in origineel` : ''}
                                onClick={() => pages[0] && viewerRef.current?.highlightPage(pages[0])}
                              >
                                {el.naam}
                              </button>
                              {el.type && <span className="text-gray-500">({el.type})</span>}
                              {pages.length > 0 && <span className="text-[10px] text-gray-400">p{pages.join(',')}</span>}
                              {typeof el.confidence === 'number' && el.confidence < 0.7 && (
                                <span className="text-[10px] bg-red-100 text-red-700 px-1 rounded" title={el.confidence_reden}>
                                  controleer
                                </span>
                              )}
                              {pendingForThis.map(c => <CorrectieBadge key={c.id} type={c.type} />)}
                              {aiHl && <span className="text-[10px] bg-yellow-200 text-yellow-800 px-1 rounded">AI aangepast</span>}
                            </div>
                          </td>
                          <td className="text-center px-1.5 py-1.5 text-gray-600">{el.hoeveelheid}</td>
                          <td className="text-right px-2 py-1.5 text-gray-600">{formatCurrency(el.prijs)}</td>
                          <td className="text-center px-1.5 py-1.5">
                            <input
                              type="number"
                              step="0.1"
                              value={m || ''}
                              onChange={(e) => setMargeFor(el.naam, e.target.value)}
                              className="w-14 px-1 py-0.5 text-xs text-right border border-gray-200 rounded focus:outline-none focus:ring-1 focus:ring-primary"
                              disabled={hidden}
                            />
                          </td>
                          <td className="text-right px-2 py-1.5 font-medium text-gray-900">
                            {hidden ? '—' : formatCurrency(verkoop)}
                          </td>
                          <td className="px-1 py-1.5">
                            <button
                              type="button"
                              onClick={() => toggleHidden(el.naam)}
                              className="p-1 text-gray-400 hover:text-gray-700"
                              title={hidden ? 'Element opnemen' : 'Element verbergen'}
                            >
                              {hidden ? <Eye className="h-3.5 w-3.5" /> : <EyeOff className="h-3.5 w-3.5" />}
                            </button>
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            </div>

            <div>
              <h3 className="text-xs font-medium text-gray-600 mb-1.5 uppercase tracking-wide">Offerte-regels</h3>
              <div className="border border-gray-200 rounded-md overflow-hidden">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="bg-gray-50 border-b border-gray-200">
                      <th className="text-left px-2 py-1.5 font-medium text-gray-600">Omschrijving</th>
                      <th className="text-center px-1.5 py-1.5 font-medium text-gray-600 w-10">Aantal</th>
                      <th className="text-right px-2 py-1.5 font-medium text-gray-600 w-20">Prijs</th>
                      <th className="text-right px-2 py-1.5 font-medium text-gray-600 w-20">Totaal</th>
                    </tr>
                  </thead>
                  <tbody>
                    {regels.map((r, idx) => {
                      const totaal = numVal(r.aantal) * numVal(r.prijs)
                      const pendingForThis = pendingCorrecties.filter(c => c.targetType === 'regel' && c.target === String(idx))
                      return (
                        <tr
                          key={idx}
                          className="border-b border-gray-100 last:border-0 hover:bg-blue-50/50"
                          onContextMenu={(e) => openContextMenu(e, String(idx), 'regel')}
                        >
                          <td className="px-2 py-1.5 text-gray-900">
                            <div className="flex items-start gap-1.5 flex-wrap">
                              <span>{r.omschrijving}</span>
                              {pendingForThis.map(c => <CorrectieBadge key={c.id} type={c.type} />)}
                            </div>
                          </td>
                          <td className="text-center px-1.5 py-1.5 text-gray-600">{r.aantal}</td>
                          <td className="text-right px-2 py-1.5 text-gray-600">{formatCurrency(numVal(r.prijs))}</td>
                          <td className="text-right px-2 py-1.5 font-medium text-gray-900">{formatCurrency(totaal)}</td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Onderaan: correctie-stack + vrij tekst + Toepassen + Goedkeuren */}
      <div className="bg-white border border-gray-200 rounded-xl p-3 space-y-2">
        {/* AI toelichting van laatste ronde */}
        {aiToelichting && (
          <div className="bg-blue-50 border border-blue-200 rounded-md p-2 text-xs text-blue-800 flex items-start gap-2">
            <Sparkles className="h-3.5 w-3.5 mt-0.5 flex-shrink-0" />
            <div className="flex-1">
              <div className="font-medium mb-0.5">AI toelichting (ronde {history.length})</div>
              {aiToelichting}
            </div>
            {history.length > 0 && (
              <button type="button" onClick={undoLastRonde} className="flex items-center gap-1 text-xs text-blue-700 hover:underline">
                <Undo2 className="h-3 w-3" />
                Ongedaan
              </button>
            )}
          </div>
        )}

        {/* Pending correcties stack */}
        {pendingCorrecties.length > 0 && (
          <div className="border border-amber-200 bg-amber-50 rounded-md p-2 text-xs">
            <div className="font-medium text-amber-900 mb-1">Geplande correcties ({pendingCorrecties.length})</div>
            <div className="flex flex-wrap gap-1.5">
              {pendingCorrecties.map(c => (
                <span key={c.id} className="inline-flex items-center gap-1 bg-white border border-amber-300 rounded px-1.5 py-0.5 text-amber-900">
                  <CorrectieBadge type={c.type} />
                  <span className="text-[10px]">{c.target.length > 22 ? c.target.slice(0, 22) + '…' : c.target}</span>
                  {c.detail && <span className="text-[10px] text-gray-500">→ {c.detail}</span>}
                  <button type="button" onClick={() => removePendingCorrectie(c.id)} className="ml-0.5 hover:text-red-600">
                    <X className="h-3 w-3" />
                  </button>
                </span>
              ))}
            </div>
          </div>
        )}

        <div className="flex items-end gap-2">
          <div className="flex-1">
            <label className="block text-xs font-medium text-gray-600 mb-1">
              Aanvullende instructies <span className="text-gray-400 font-normal">(rechtsklik op een element/regel voor snelle correctie)</span>
            </label>
            <textarea
              value={vrijTekst}
              onChange={(e) => setVrijTekst(e.target.value)}
              placeholder="bv. voeg algemene voorwaarden toe / wijzig BTW naar 9%"
              rows={2}
              className="w-full px-2 py-1.5 text-sm border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-primary resize-none"
            />
          </div>
          <Button
            variant="secondary"
            onClick={handleToepassen}
            disabled={applying || (pendingCorrecties.length === 0 && !vrijTekst.trim())}
          >
            {applying ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
            AI toepassen
          </Button>
          <Button onClick={handleGoedkeuren} disabled={saving || applying}>
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <ArrowRight className="h-4 w-4" />}
            Goedkeuren &amp; opslaan
          </Button>
        </div>
      </div>

      {/* Contextmenu portal */}
      <PreviewContextMenu
        state={contextMenu}
        onAction={handleCorrectieAction}
        onClose={() => setContextMenu(null)}
      />

      {/* Visueel onbenutte hooks/icons stillen ESLint */}
      <span className="hidden"><Eye /><Pencil /><Trash2 /><MoreVertical /></span>
    </div>
  )
}
