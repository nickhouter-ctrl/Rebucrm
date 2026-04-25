'use client'

import { useState, useMemo, useRef, useCallback, useEffect } from 'react'
import { ArrowLeft, ArrowRight, Loader2, Eye, EyeOff, Pencil, Trash2, MoreVertical, Percent, Sparkles, Undo2, X, FileText, RefreshCw } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { saveOfferte, uploadLeverancierTekening, saveLeverancierTekeningen, saveConceptState, loadConceptState, approveConceptState, saveLeverancierWipeTemplate, saveLeverancierPrijsCorrecties, processLeverancierPdf } from '@/lib/actions'
import type { ParsedPdfResult, RenderedTekening, WipedRegion } from './stap-tekeningen'
import { PdfViewer, type PdfViewerHandle } from './preview/pdf-viewer'
import { PreviewChecklist } from './preview/checklist'
import { PreviewContextMenu, CorrectieBadge, type ContextMenuState, type CorrectieType } from './preview/context-menu'
import { RegionEditor, rerenderPageWithRegions, type EditableRegion } from './preview/region-editor'

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

// Toont 1 gerenderde tekening uit de blob — prijzen weggewist, tekening + specs intact.
function TekeningPreview({ tek, idx, onEdit }: { tek: RenderedTekening; idx: number; onEdit?: () => void }) {
  const [url, setUrl] = useState<string>('')
  useEffect(() => {
    const u = URL.createObjectURL(tek.blob)
    setUrl(u)
    return () => URL.revokeObjectURL(u)
  }, [tek.blob])
  return (
    <div className="border border-gray-200 rounded overflow-hidden bg-white group relative">
      <div className="px-2 py-1 bg-gray-50 border-b border-gray-100 flex items-center justify-between text-[10px]">
        <span className="font-medium text-gray-700 truncate">
          {tek.naam}{tek.totalPages > 1 && <span className="text-gray-400 ml-1">({tek.pageIndex + 1}/{tek.totalPages})</span>}
        </span>
        <span className="text-gray-400">p{tek.pageNum}</span>
      </div>
      {url ? (
        <img src={url} alt={`Tekening ${idx + 1}`} className="w-full h-auto block" />
      ) : (
        <div className="aspect-[4/3] bg-gray-100" />
      )}
      {onEdit && (
        <button
          type="button"
          onClick={onEdit}
          className="absolute top-7 right-1 opacity-0 group-hover:opacity-100 transition-opacity bg-white border border-gray-200 hover:border-blue-400 rounded p-1 text-blue-600 shadow-sm"
          title="Wis-regio's bewerken op deze pagina"
        >
          <Pencil className="h-3 w-3" />
        </button>
      )}
    </div>
  )
}

// Compacte spec-lijst per element die straks in de offerte komt.
function ElementSpecs({ el }: { el: ParsedPdfResult['elementen'][0] }) {
  const items: { label: string; value: string }[] = []
  const push = (label: string, v?: string) => { if (v && v.trim()) items.push({ label, value: v.trim() }) }
  push('Systeem', el.systeem)
  push('Afmetingen', el.afmetingen)
  push('Kleur', el.kleur)
  push('Type', el.type)
  push('Glas', el.glasType)
  push('Beslag', el.beslag)
  push('Uw-waarde', el.uwWaarde)
  push('Dorpel', el.dorpel)
  push('Sluiting', el.sluiting)
  push('Scharnieren', el.scharnieren)
  push('Drairichting', el.drapirichting)
  push('Gewicht', el.gewicht)
  push('Omtrek', el.omtrek)
  if (items.length === 0) return null
  return (
    <details className="border border-gray-200 rounded text-xs">
      <summary className="px-2 py-1.5 cursor-pointer hover:bg-gray-50 font-medium text-gray-900 flex items-center justify-between">
        <span>{el.naam} <span className="text-gray-500 font-normal">— {items.length} specs</span></span>
        <span className="text-gray-400 text-[10px]">{el.hoeveelheid}× {formatCurrency(el.prijs)}</span>
      </summary>
      <div className="px-2 py-1.5 grid grid-cols-2 gap-x-3 gap-y-0.5 border-t border-gray-100">
        {items.map(it => (
          <div key={it.label} className="flex gap-1.5">
            <span className="text-gray-500 w-20 flex-shrink-0">{it.label}:</span>
            <span className="text-gray-900 truncate" title={it.value}>{it.value}</span>
          </div>
        ))}
      </div>
    </details>
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

  // Handmatige prijs-overrides per element (wanneer AI prijs 0 leest of fout heeft)
  const [prijsOverrides, setPrijsOverrides] = useState<Record<string, number>>({})
  // Welke prijs is er feitelijk voor een element (override of geparsed) — helper
  // beschikbaar voor toekomstige callsites.
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const getActualPrijs = useCallback((el: typeof parsedPdfResult.elementen[0]) => {
    return prijsOverrides[el.naam] ?? el.prijs
  }, [prijsOverrides, parsedPdfResult.elementen]) // eslint-disable-line react-hooks/exhaustive-deps

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

  // Verkoopprijs-totaal bij actuele marges (negeert verborgen elementen).
  // Gebruikt prijs-override als die is gezet, anders AI-geparsed prijs.
  const verkoopTotaal = useMemo(() => {
    return parsedPdfResult.elementen.reduce((sum, e) => {
      if (zichtbaarheid[e.naam]?.hidden || verwijderdeElementen.has(e.naam)) return sum
      const m = elementMarges[e.naam] ?? margePercentage
      const inkoop = prijsOverrides[e.naam] ?? e.prijs
      return sum + inkoop * (1 + m / 100) * e.hoeveelheid
    }, 0)
  }, [parsedPdfResult.elementen, elementMarges, margePercentage, zichtbaarheid, verwijderdeElementen, prijsOverrides])

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

  // ---- Region editor (per-pagina wis-regio's bewerken + AI leert) ----
  const [editorPage, setEditorPage] = useState<number | null>(null)
  // Mutable kopie van renderedTekeningen zodat we de blob per element kunnen vervangen
  const [tekeningenLocal, setTekeningenLocal] = useState<RenderedTekening[]>(renderedTekeningen)
  // Per-page actuele regio's: start vanuit prop wipedRegions, wordt bijgewerkt
  // wanneer de gebruiker er aan sleutelt. PDF native coords (scale=1).
  const [regionsByPage, setRegionsByPage] = useState<Map<number, EditableRegion[]>>(() => {
    const m = new Map<number, EditableRegion[]>()
    for (const r of (wipedRegions || [])) {
      const arr = m.get(r.pageNum) ?? []
      arr.push({ id: `init-${arr.length}`, x: r.x, y: r.y, w: r.w, h: r.h, reden: r.reden })
      m.set(r.pageNum, arr)
    }
    return m
  })
  useEffect(() => { setTekeningenLocal(renderedTekeningen) }, [renderedTekeningen])

  async function handleRegionEditorSave(pageNum: number, newRegions: EditableRegion[]) {
    // 1. Update state
    setRegionsByPage(prev => {
      const m = new Map(prev)
      m.set(pageNum, newRegions)
      return m
    })
    // 2. Re-render de tekening met nieuwe regio's en vervang de blob
    if (pendingPdfFile) {
      try {
        const newBlob = await rerenderPageWithRegions(
          pendingPdfFile,
          pageNum,
          newRegions.map(r => ({ x: r.x, y: r.y, w: r.w, h: r.h })),
          2,
          0,
        )
        setTekeningenLocal(prev => prev.map(t => t.pageNum === pageNum ? { ...t, blob: newBlob } : t))
      } catch (e) {
        console.error('Tekening her-renderen mislukt:', e)
      }
    }
    // 3. AI leert automatisch — sla regio's op als percentages voor deze leverancier
    if (detectedLeverancier?.leverancier && detectedLeverancier.leverancier !== 'onbekend') {
      try {
        // We hebben de page-size niet ter beschikking hier; reken in percentages via PDF.
        // Laat de region-editor zelf de page-grootte voor de huidige pagina opslaan
        // als gemeenschappelijke referentie — voor cache-key voldoet het.
        const pdfjsLib = await import('pdfjs-dist')
        pdfjsLib.GlobalWorkerOptions.workerSrc = `https://unpkg.com/pdfjs-dist@${pdfjsLib.version}/build/pdf.worker.min.mjs`
        const buf = await pendingPdfFile!.arrayBuffer()
        const doc = await pdfjsLib.getDocument({ data: buf }).promise
        const page = await doc.getPage(pageNum)
        const viewport = page.getViewport({ scale: 1 })
        const regionsPct = newRegions.map(r => ({
          x: r.x / viewport.width,
          y: r.y / viewport.height,
          w: r.w / viewport.width,
          h: r.h / viewport.height,
        }))
        await saveLeverancierWipeTemplate({
          leverancierSlug: detectedLeverancier.leverancier,
          regionsPct,
          pageWidth: viewport.width,
          pageHeight: viewport.height,
          validated: true,
        })
      } catch (e) {
        console.warn('Leverancier-template opslaan mislukt:', e)
      }
    }
    // 4. Triggert PDF preview re-build bij volgende toon
    setPdfPreviewUrl('')
  }

  // ---- Live offerte-PDF preview ----
  const [rightTab, setRightTab] = useState<'edit' | 'pdf'>('edit')
  const [pdfPreviewUrl, setPdfPreviewUrl] = useState<string>('')
  const [pdfLoading, setPdfLoading] = useState(false)
  const [pdfError, setPdfError] = useState('')
  const pdfUrlRef = useRef<string>('')

  async function buildPdfPreview() {
    setPdfLoading(true)
    setPdfError('')
    try {
      const fd = new FormData()
      // Per element: bouw lijst van tekening-file-keys en voeg de blobs toe
      const elementen = parsedPdfResult.elementen.map(el => {
        const tekeningen = tekeningenLocal.filter(t => t.naam === el.naam).sort((a, b) => a.pageIndex - b.pageIndex)
        const tekeningKeys: string[] = []
        for (let i = 0; i < tekeningen.length; i++) {
          const key = `tek_${el.naam.replace(/[^a-z0-9]/gi, '_')}_${i}`
          tekeningKeys.push(key)
          fd.append(key, tekeningen[i].blob, `${key}.jpg`)
        }
        return {
          naam: el.naam,
          hoeveelheid: el.hoeveelheid,
          systeem: el.systeem,
          kleur: el.kleur,
          afmetingen: el.afmetingen,
          type: el.type,
          prijs: (prijsOverrides[el.naam] ?? el.prijs) * (1 + ((elementMarges[el.naam] ?? margePercentage) / 100)),
          glasType: el.glasType,
          beslag: el.beslag,
          uwWaarde: el.uwWaarde,
          drapirichting: el.drapirichting,
          dorpel: el.dorpel,
          sluiting: el.sluiting,
          scharnieren: el.scharnieren,
          gewicht: el.gewicht,
          omtrek: el.omtrek,
          paneel: el.paneel,
          commentaar: el.commentaar,
          hoekverbinding: el.hoekverbinding,
          montageGaten: el.montageGaten,
          afwatering: el.afwatering,
          scharnierenKleur: el.scharnierenKleur,
          lakKleur: el.lakKleur,
          sluitcilinder: el.sluitcilinder,
          aantalSleutels: el.aantalSleutels,
          gelijksluitend: el.gelijksluitend,
          krukBinnen: el.krukBinnen,
          krukBuiten: el.krukBuiten,
          tekeningKeys,
          verborgen: !!zichtbaarheid[el.naam]?.hidden || verwijderdeElementen.has(el.naam),
        }
      })
      const meta = {
        offertenummer: (offerte?.offertenummer as string) || 'CONCEPT',
        datum: new Date().toISOString().slice(0, 10),
        geldig_tot: null,
        onderwerp: onderwerp || null,
        versie_nummer: (offerte?.versie_nummer as number) || 1,
        relatie: { bedrijfsnaam: relatieName || 'Klant' },
        regels: regels.map(r => ({
          omschrijving: r.omschrijving,
          aantal: numVal(r.aantal),
          prijs: numVal(r.prijs),
          btw_percentage: r.btw_percentage,
        })),
        elementen,
      }
      fd.append('meta', JSON.stringify(meta))

      const res = await fetch('/api/pdf/offerte-live-preview', { method: 'POST', body: fd })
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        throw new Error(err.error || `PDF render mislukt (${res.status})`)
      }
      const blob = await res.blob()
      // Cleanup vorige URL
      if (pdfUrlRef.current) URL.revokeObjectURL(pdfUrlRef.current)
      const url = URL.createObjectURL(blob)
      pdfUrlRef.current = url
      setPdfPreviewUrl(url)
    } catch (e) {
      setPdfError(e instanceof Error ? e.message : 'PDF render mislukt')
    } finally {
      setPdfLoading(false)
    }
  }

  // Bouw PDF zodra gebruiker naar pdf-tab schakelt en hij is leeg
  useEffect(() => {
    if (rightTab === 'pdf' && !pdfPreviewUrl && !pdfLoading) {
      buildPdfPreview()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rightTab])

  // Cleanup blob-url op unmount
  useEffect(() => () => {
    if (pdfUrlRef.current) URL.revokeObjectURL(pdfUrlRef.current)
  }, [])

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
        prijsOverrides: Record<string, number>
      }>
      if (s.elementMarges) setElementMarges(s.elementMarges)
      if (s.zichtbaarheid) setZichtbaarheid(s.zichtbaarheid)
      if (s.verwijderdeElementen) setVerwijderdeElementen(new Set(s.verwijderdeElementen))
      if (s.regels) onRegelsChange(s.regels)
      if (s.onderwerp) setOnderwerp(s.onderwerp)
      if (s.history) setHistory(s.history)
      if (s.prijsOverrides) setPrijsOverrides(s.prijsOverrides)
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
          prijsOverrides,
        },
      }).catch(() => { /* niet kritiek */ })
    }, 1500)
    return () => { if (saveTimerRef.current) clearTimeout(saveTimerRef.current) }
  }, [offerteId, elementMarges, zichtbaarheid, verwijderdeElementen, regels, onderwerp, history, prijsOverrides])

  const inkoopprijzen = useMemo(() => parsedPdfResult.elementen.map(e => e.prijs), [parsedPdfResult.elementen])

  // Pas verkoopprijs door op kozijn-regel telkens als marges/zichtbaarheid/overrides wijzigen.
  // useEffect i.p.v. useMemo — dit is een side-effect (setState op parent), geen memoized value.
  useEffect(() => { syncKozijnRegel() }, [verkoopTotaal]) // eslint-disable-line react-hooks/exhaustive-deps

  async function uploadPreProcessedPdf(offerteId: string) {
    if (!pendingPdfFile) return { ok: true }
    try {
      // STAP 1: leveranciers-PDF zelf uploaden naar storage + parsed data opslaan.
      // Zonder deze call vindt /api/pdf/offerte/[id] geen offerte_leverancier
      // record en bouwt hij de PDF zonder tekeningen + zonder kozijnElementen.
      const pdfFd = new FormData()
      pdfFd.append('pdf', pendingPdfFile)
      const pdfResult = await processLeverancierPdf(offerteId, pdfFd)
      if (pdfResult.error) {
        // Niet fataal — we hebben al tekening-blobs en metadata, maar log het
        console.warn('Leveranciers-PDF upload mislukt:', pdfResult.error)
      }
      // STAP 2: tekening-blobs + metadata + handmatige overrides opslaan.
      // Tekeningen uploaden:
      const elementToPaths = new Map<string, { paths: string[]; pageNums: number[] }>()
      let i = 0
      for (const t of tekeningenLocal) {
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
        if (zichtbaarheid[e.naam]?.hidden || verwijderdeElementen.has(e.naam)) continue
        // Gebruik handmatige override als die er is — anders AI-prijs
        const prijs = prijsOverrides[e.naam] ?? e.prijs
        elementPrijzen[e.naam] = { prijs, hoeveelheid: e.hoeveelheid }
      }
      await saveLeverancierTekeningen(offerteId, tekeningenPayload, margePercentage, elementMarges, elementPrijzen)
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
      // Vandaag als datum, geldig_tot 30 dagen — saveOfferte vereist datum (NOT NULL)
      const vandaag = new Date()
      const geldigTot = new Date(vandaag.getTime() + 30 * 24 * 60 * 60 * 1000)
      const isoDatum = (offerte?.datum as string | undefined) || vandaag.toISOString().split('T')[0]
      const isoGeldigTot = (offerte?.geldig_tot as string | undefined) || geldigTot.toISOString().split('T')[0]
      fd.set('datum', isoDatum)
      fd.set('geldig_tot', isoGeldigTot)
      fd.set('status', (offerte?.status as string | undefined) || 'concept')
      fd.set('regels', JSON.stringify(regels.map(r => ({ ...r, aantal: numVal(r.aantal), prijs: numVal(r.prijs) }))))
      const result = await saveOfferte(fd)
      if (result.error) { setError(result.error); setSaving(false); return }
      const offerteId = result.id!
      if (pendingPdfFile) {
        const up = await uploadPreProcessedPdf(offerteId)
        if (!up.ok) { setSaving(false); return }
      }
      // AI leert van handmatige prijs-correcties
      if (detectedLeverancier?.leverancier && detectedLeverancier.leverancier !== 'onbekend' && Object.keys(prijsOverrides).length > 0) {
        try {
          const correcties = Object.entries(prijsOverrides).map(([naam, handmatigePrijs]) => {
            const orig = parsedPdfResult.elementen.find(e => e.naam === naam)
            return {
              elementNaam: naam,
              aiPrijs: orig?.prijs ?? 0,
              handmatigePrijs,
            }
          })
          await saveLeverancierPrijsCorrecties({
            leverancierSlug: detectedLeverancier.leverancier,
            offerteId,
            correcties,
          })
        } catch { /* niet kritiek */ }
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
            <div className="flex items-center gap-1">
              <span className="text-[10px] font-semibold text-gray-500 uppercase tracking-wider mr-2">Onze offerte:</span>
              <button
                type="button"
                onClick={() => setRightTab('edit')}
                className={`px-2 py-1 text-xs font-medium rounded flex items-center gap-1 ${rightTab === 'edit' ? 'bg-white text-gray-900 shadow-sm border border-gray-200' : 'text-gray-500 hover:text-gray-700'}`}
              >
                <Pencil className="h-3 w-3" />
                Bewerken
              </button>
              <button
                type="button"
                onClick={() => setRightTab('pdf')}
                className={`px-2 py-1 text-xs font-medium rounded flex items-center gap-1 ${rightTab === 'pdf' ? 'bg-white text-gray-900 shadow-sm border border-gray-200' : 'text-gray-500 hover:text-gray-700'}`}
              >
                <FileText className="h-3 w-3" />
                Voorbeeld (PDF)
              </button>
            </div>
            <div className="relative">
              {rightTab === 'pdf' ? (
                <Button size="sm" variant="ghost" onClick={buildPdfPreview} disabled={pdfLoading}>
                  {pdfLoading ? <Loader2 className="h-3 w-3 animate-spin" /> : <RefreshCw className="h-3 w-3" />}
                  Vernieuwen
                </Button>
              ) : (
              <Button size="sm" variant="ghost" onClick={() => setBulkOpen(o => !o)}>
                <Percent className="h-3 w-3" />
                Bulk-acties
              </Button>
              )}
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
          {rightTab === 'pdf' ? (
            <div className="flex-1 bg-gray-100 relative flex flex-col">
              <div className="bg-blue-50 border-b border-blue-200 px-3 py-1.5 text-xs text-blue-800 flex items-center justify-between">
                <span>
                  <strong>Voorbeeld</strong> van wat de klant ontvangt. Wijzigingen?
                </span>
                <button
                  type="button"
                  onClick={() => setRightTab('edit')}
                  className="inline-flex items-center gap-1 px-2 py-0.5 bg-white border border-blue-300 rounded text-blue-700 hover:bg-blue-100"
                >
                  <Pencil className="h-3 w-3" />
                  Naar Bewerken
                </button>
              </div>
              <div className="flex-1 relative">
                {pdfLoading && (
                  <div className="absolute inset-0 flex items-center justify-center bg-gray-100/80 z-10">
                    <Loader2 className="h-6 w-6 animate-spin text-gray-500" />
                    <span className="ml-2 text-sm text-gray-600">Eigen offerte renderen…</span>
                  </div>
                )}
                {pdfError && (
                  <div className="absolute inset-x-3 top-3 bg-red-50 border border-red-200 text-red-700 text-xs p-2 rounded z-20">{pdfError}</div>
                )}
                {pdfPreviewUrl ? (
                  <iframe src={pdfPreviewUrl} className="w-full h-full border-0" title="Offerte preview" />
                ) : (
                  !pdfLoading && (
                    <div className="flex items-center justify-center h-full text-sm text-gray-400">
                      Klik <strong className="mx-1">Vernieuwen</strong> om de offerte te genereren
                    </div>
                  )
                )}
              </div>
            </div>
          ) : (
          <div className="flex-1 overflow-y-auto p-3 space-y-3">
            <div className="bg-green-50 border border-green-200 rounded-md px-2 py-1.5 text-[11px] text-green-800 flex items-start gap-1.5">
              <Pencil className="h-3 w-3 flex-shrink-0 mt-0.5" />
              <div>
                <strong>Dit is jouw offerte (gegenereerd door AI).</strong> Pas hier aan: marge, verbergen, regels, omschrijvingen. Rechts-klik op een element of regel voor extra acties. Klik op <kbd>Voorbeeld (PDF)</kbd> om te zien wat de klant ziet.
              </div>
            </div>
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
              <h3 className="text-xs font-medium text-gray-600 mb-1.5 uppercase tracking-wide flex items-center gap-2">
                <span>Elementen in onze offerte</span>
                <span className="text-[10px] font-normal text-gray-400 normal-case">— pas marge aan, verberg of rechtsklik voor meer</span>
              </h3>
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
                      const inkoop = prijsOverrides[el.naam] ?? el.prijs
                      const verkoop = inkoop * (1 + m / 100) * el.hoeveelheid
                      const hidden = !!zichtbaarheid[el.naam]?.hidden
                      const aiHl = aiAangepast.has(el.naam)
                      const pages = naamToPages.get(el.naam) || []
                      const pendingForThis = pendingCorrecties.filter(c => c.targetType === 'element' && c.target === el.naam)
                      const geenPrijs = inkoop === 0
                      const handmatigeprijs = prijsOverrides[el.naam] !== undefined
                      return (
                        <tr
                          key={el.naam}
                          className={`border-b border-gray-100 last:border-0 ${hidden ? 'opacity-40 bg-gray-50' : ''} ${aiHl ? 'bg-yellow-50' : ''} ${geenPrijs ? 'bg-orange-50/50' : ''} hover:bg-blue-50/50`}
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
                              {geenPrijs && (
                                <span
                                  className="inline-flex items-center gap-0.5 text-[10px] bg-orange-100 text-orange-700 px-1 rounded"
                                  title="AI heeft geen prijs gevonden — vul handmatig in of klik op pagina-nummer om naar het origineel te gaan"
                                >
                                  ⚠ geen prijs
                                </span>
                              )}
                              {handmatigeprijs && !geenPrijs && (
                                <span className="text-[10px] bg-blue-100 text-blue-700 px-1 rounded" title="Prijs handmatig aangepast — AI leert dit op">
                                  handmatig
                                </span>
                              )}
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
                          <td className="text-right px-2 py-1.5 text-gray-600">
                            <input
                              type="number"
                              step="0.01"
                              min="0"
                              value={inkoop || ''}
                              placeholder="0,00"
                              onChange={(e) => {
                                const v = parseFloat(e.target.value)
                                setPrijsOverrides(prev => {
                                  const next = { ...prev }
                                  if (isNaN(v)) delete next[el.naam]
                                  else next[el.naam] = v
                                  return next
                                })
                              }}
                              className={`w-20 px-1 py-0.5 text-xs text-right rounded focus:outline-none focus:ring-1 focus:ring-primary ${
                                geenPrijs
                                  ? 'border-2 border-orange-400 bg-orange-50 placeholder-orange-400 font-medium animate-pulse'
                                  : 'border border-gray-200 hover:border-gray-300 focus:border-primary'
                              }`}
                              title={geenPrijs ? 'Vul handmatig de inkoopprijs in' : 'Inkoopprijs (handmatig overschrijven)'}
                            />
                          </td>
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
                            {hidden ? '—' : geenPrijs ? <span className="text-orange-500 italic">—</span> : formatCurrency(verkoop)}
                          </td>
                          <td className="px-1 py-1.5">
                            <div className="flex items-center gap-0.5">
                              {geenPrijs && pages[0] && (
                                <button
                                  type="button"
                                  onClick={() => viewerRef.current?.highlightPage(pages[0])}
                                  className="p-1 text-orange-500 hover:text-orange-700"
                                  title="Toon pagina in origineel om prijs op te zoeken"
                                >
                                  →
                                </button>
                              )}
                              <button
                                type="button"
                                onClick={() => toggleHidden(el.naam)}
                                className="p-1 text-gray-400 hover:text-gray-700"
                                title={hidden ? 'Element opnemen' : 'Element verbergen'}
                              >
                                {hidden ? <Eye className="h-3.5 w-3.5" /> : <EyeOff className="h-3.5 w-3.5" />}
                              </button>
                            </div>
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            </div>

            <div>
              <div className="flex items-center justify-between mb-1.5">
                <h3 className="text-xs font-medium text-gray-600 uppercase tracking-wide">Offerte-regels <span className="text-[10px] font-normal text-gray-400 normal-case">— bewerk inline of klik op + voor nieuwe</span></h3>
                <button
                  type="button"
                  onClick={() => onRegelsChange([...regels, { omschrijving: 'Nieuwe regel', aantal: 1, prijs: 0, btw_percentage: 21 }])}
                  className="text-[11px] text-primary hover:underline"
                >
                  + Regel toevoegen
                </button>
              </div>
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
                      const updateRegel = (patch: Partial<Regel>) => {
                        const updated = [...regels]
                        updated[idx] = { ...updated[idx], ...patch }
                        onRegelsChange(updated)
                      }
                      return (
                        <tr
                          key={idx}
                          className="border-b border-gray-100 last:border-0 hover:bg-blue-50/50"
                          onContextMenu={(e) => openContextMenu(e, String(idx), 'regel')}
                        >
                          <td className="px-2 py-1.5 text-gray-900">
                            <div className="flex items-start gap-1.5 flex-wrap">
                              <input
                                type="text"
                                value={r.omschrijving}
                                onChange={(e) => updateRegel({ omschrijving: e.target.value })}
                                className="flex-1 min-w-[180px] bg-transparent hover:bg-white focus:bg-white border border-transparent hover:border-gray-200 focus:border-primary rounded px-1 py-0.5 text-xs focus:outline-none"
                              />
                              {pendingForThis.map(c => <CorrectieBadge key={c.id} type={c.type} />)}
                            </div>
                          </td>
                          <td className="text-center px-1.5 py-1.5 text-gray-600">
                            <input
                              type="number"
                              step="0.01"
                              value={r.aantal}
                              onChange={(e) => updateRegel({ aantal: e.target.value })}
                              className="w-12 bg-transparent hover:bg-white focus:bg-white border border-transparent hover:border-gray-200 focus:border-primary rounded px-1 py-0.5 text-xs text-right focus:outline-none"
                            />
                          </td>
                          <td className="text-right px-2 py-1.5 text-gray-600">
                            <input
                              type="number"
                              step="0.01"
                              value={r.prijs}
                              onChange={(e) => updateRegel({ prijs: e.target.value })}
                              className="w-20 bg-transparent hover:bg-white focus:bg-white border border-transparent hover:border-gray-200 focus:border-primary rounded px-1 py-0.5 text-xs text-right focus:outline-none"
                            />
                          </td>
                          <td className="text-right px-2 py-1.5 font-medium text-gray-900">{formatCurrency(totaal)}</td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Tekeningen-bijlage zoals klant hem ziet — gewist door regex+AI Vision */}
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <h3 className="text-xs font-medium text-gray-600 uppercase tracking-wide">
                  Tekeningen-bijlage <span className="text-[10px] text-green-700 normal-case">(zoals klant hem ziet — tekeningen + specs intact, alleen leverancier-prijzen verborgen)</span>
                </h3>
                <span className="text-[10px] text-gray-400">{renderedTekeningen.filter(t => !zichtbaarheid[t.naam]?.hidden && !verwijderdeElementen.has(t.naam)).length} stuks</span>
              </div>
              <div className="grid grid-cols-2 gap-2">
                {tekeningenLocal
                  .filter(t => !zichtbaarheid[t.naam]?.hidden && !verwijderdeElementen.has(t.naam))
                  .map((t, idx) => (
                    <TekeningPreview
                      key={`${t.naam}-${t.pageNum}`}
                      tek={t}
                      idx={idx}
                      onEdit={() => setEditorPage(t.pageNum)}
                    />
                  ))}
                {tekeningenLocal.length === 0 && (
                  <div className="col-span-2 text-center text-xs text-gray-400 py-4 border border-dashed border-gray-200 rounded">
                    Geen tekeningen geëxtraheerd
                  </div>
                )}
              </div>
            </div>

            {/* Specs per element die in de offerte komen */}
            <div>
              <h3 className="text-xs font-medium text-gray-600 mb-1.5 uppercase tracking-wide">
                Specificaties per element <span className="text-[10px] text-gray-400 normal-case">(zo verschijnen ze in de offerte)</span>
              </h3>
              <div className="space-y-1.5">
                {parsedPdfResult.elementen
                  .filter(el => !zichtbaarheid[el.naam]?.hidden && !verwijderdeElementen.has(el.naam))
                  .map(el => <ElementSpecs key={el.naam} el={el} />)}
              </div>
            </div>
          </div>
          )}
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

      {/* Region-editor: gebruiker past wis-rechthoeken aan op originele PDF-pagina,
          AI leert automatisch op voor deze leverancier */}
      <RegionEditor
        open={editorPage !== null}
        pdfFile={pendingPdfFile}
        pageNum={editorPage || 1}
        initialRegions={editorPage ? (regionsByPage.get(editorPage) || []) : []}
        leverancierLabel={detectedLeverancier?.display_naam}
        onClose={() => setEditorPage(null)}
        onSave={async (newRegions) => {
          if (editorPage !== null) await handleRegionEditorSave(editorPage, newRegions)
        }}
      />

      {/* Visueel onbenutte hooks/icons stillen ESLint */}
      <span className="hidden"><Eye /><Pencil /><Trash2 /><MoreVertical /></span>
    </div>
  )
}
