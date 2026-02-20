'use client'

import { useState } from 'react'
import Link from 'next/link'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { formatCurrency } from '@/lib/utils'
import { Users, UserPlus, CheckSquare, AlertCircle, FileText, Clock, Truck, CalendarDays, Package, MessageCircle, CheckCircle, Receipt, GripVertical, Settings2, X, Eye, EyeOff, BarChart3 } from 'lucide-react'
import { format } from 'date-fns'
import { nl } from 'date-fns/locale'
import { useRouter } from 'next/navigation'
import { convertToFactuur } from '@/lib/actions'
import { DeliveryPlanningDialog } from './delivery-planning-dialog'

interface TePlannenOrder {
  id: string
  ordernummer: string
  relatie_bedrijfsnaam: string
  relatie_contactpersoon: string | null
  relatie_email: string | null
  offerte_nummer: string | null
  onderwerp: string | null
  totaal: number
  datum: string
}

interface DashboardData {
  omzet: number
  openstaand: number
  openOffertes: number
  openTaken: number
  ongelezenBerichten: number
  maandOmzet: { maand: string; bedrag: number }[]
  gefactureerdPerMaand: { maand: string; bedrag: number; aantal: number }[]
  totaalGefactureerd: number
  totaalFacturen: number
  offertesPerMaand: { maand: string; aantal: number; bedrag: number }[]
  totaalOffertes: number
  organisaties: { totaal: number; particulier: number; zakelijk: number }
  offertesPerFase: { status: string; aantal: number; bedrag: number }[]
  facturenPerFase: { status: string; aantal: number; bedrag: number }[]
  takenPerCollega: { naam: string; aantal: number }[]
  mijnTaken: { id: string; titel: string; deadline: string | null; prioriteit: string }[]
  openOffertesList: {
    id: string
    offertenummer: string
    relatie_bedrijfsnaam: string
    project_naam: string | null
    totaal: number
    datum: string
    dagen_open: number
  }[]
  tePlannenOrders: TePlannenOrder[]
  geplandeLeveringen: {
    id: string
    ordernummer: string
    leverdatum: string
    status: string
    onderwerp: string | null
    totaal: number
    relatie_bedrijfsnaam: string
  }[]
  geaccepteerdeOffertes: {
    id: string
    offertenummer: string
    relatie_bedrijfsnaam: string
    onderwerp: string | null
    totaal: number
    datum: string
  }[]
  openstaandeFacturen: {
    id: string
    factuurnummer: string
    relatie_bedrijfsnaam: string
    totaal: number
    betaald_bedrag: number
    openstaand_bedrag: number
    vervaldatum: string | null
    status: string
  }[]
}

const statusLabels: Record<string, string> = {
  concept: 'Concept',
  verzonden: 'Verzonden',
  geaccepteerd: 'Geaccepteerd',
  afgewezen: 'Afgewezen',
  verlopen: 'Verlopen',
  betaald: 'Betaald',
  deels_betaald: 'Deels betaald',
  vervallen: 'Vervallen',
  gecrediteerd: 'Gecrediteerd',
}

const CARD_LABELS: Record<string, string> = {
  gefactureerd: 'Gefactureerd',
  klanten: 'Klanten',
  berichten: 'Berichten',
  offertesPerFase: 'Offertes per fase',
  facturenPerFase: 'Facturen per fase',
  tePlannen: 'Te plannen leveringen',
  takenPerCollega: 'Taken per collega',
  geplandeLeveringen: 'Geplande leveringen',
  openOffertes: 'Open offertes',
  geaccepteerdeOffertes: 'Geaccepteerde offertes',
  openstaandeFacturen: 'Openstaande facturen',
  mijnTaken: 'Mijn taken',
  aangemaakteOffertes: 'Aangemaakte offertes',
}

type PeriodFilter = 'week' | 'maand' | 'kwartaal' | 'jaar'

function filterChartData<T extends { maand: string }>(data: T[], period: PeriodFilter): T[] {
  if (period === 'jaar') return data
  if (period === 'kwartaal') return data.slice(-3)
  if (period === 'maand') return data.slice(-1)
  // week = last 1 month too (we only have monthly data)
  return data.slice(-1)
}

export function DashboardView({ data }: { data: DashboardData | null }) {
  const router = useRouter()
  const [planningOrder, setPlanningOrder] = useState<TePlannenOrder | null>(null)
  const [factuurLoading, setFactuurLoading] = useState<string | null>(null)
  const [factuurDialogOfferte, setFactuurDialogOfferte] = useState<{ id: string; totaal: number } | null>(null)
  const [customSplitPercentage, setCustomSplitPercentage] = useState(50)
  const [showSettings, setShowSettings] = useState(false)

  // Period filters
  const [gefactureerdPeriod, setGefactureerdPeriod] = useState<PeriodFilter>('jaar')
  const [offertesPeriod, setOffertesPeriod] = useState<PeriodFilter>('jaar')

  // Dashboard card order & visibility (drag & drop)
  const CARD_STORAGE_KEY = 'rebu-dashboard-card-order'
  const VISIBILITY_STORAGE_KEY = 'rebu-dashboard-visible-cards'
  const DEFAULT_CARD_ORDER = ['gefactureerd', 'klanten', 'berichten', 'offertesPerFase', 'facturenPerFase', 'tePlannen', 'takenPerCollega', 'geplandeLeveringen', 'openOffertes', 'geaccepteerdeOffertes', 'openstaandeFacturen', 'mijnTaken', 'aangemaakteOffertes']
  const [cardOrder, setCardOrder] = useState<string[]>(() => {
    if (typeof window === 'undefined') return DEFAULT_CARD_ORDER
    try {
      const saved = localStorage.getItem(CARD_STORAGE_KEY)
      if (saved) {
        const parsed = JSON.parse(saved) as string[]
        // Remove old 'maandomzet' key, replace with 'gefactureerd' if not present
        const cleaned = parsed.filter(id => id !== 'maandomzet' && DEFAULT_CARD_ORDER.includes(id))
        for (const id of DEFAULT_CARD_ORDER) { if (!cleaned.includes(id)) cleaned.push(id) }
        return cleaned
      }
    } catch { /* ignore */ }
    return DEFAULT_CARD_ORDER
  })
  const [hiddenCards, setHiddenCards] = useState<Set<string>>(() => {
    if (typeof window === 'undefined') return new Set()
    try {
      const saved = localStorage.getItem(VISIBILITY_STORAGE_KEY)
      if (saved) return new Set(JSON.parse(saved) as string[])
    } catch { /* ignore */ }
    return new Set()
  })
  const [draggedCard, setDraggedCard] = useState<string | null>(null)
  const [dragOverCard, setDragOverCard] = useState<string | null>(null)

  function handleCardDragStart(e: React.DragEvent, cardId: string) {
    setDraggedCard(cardId)
    e.dataTransfer.effectAllowed = 'move'
  }
  function handleCardDragOver(e: React.DragEvent, cardId: string) {
    e.preventDefault()
    e.dataTransfer.dropEffect = 'move'
    if (dragOverCard !== cardId) setDragOverCard(cardId)
  }
  function handleCardDrop(cardId: string) {
    if (!draggedCard || draggedCard === cardId) { setDraggedCard(null); setDragOverCard(null); return }
    const newOrder = [...cardOrder]
    const from = newOrder.indexOf(draggedCard)
    const to = newOrder.indexOf(cardId)
    if (from === -1 || to === -1) { setDraggedCard(null); setDragOverCard(null); return }
    newOrder.splice(from, 1)
    newOrder.splice(to, 0, draggedCard)
    setCardOrder(newOrder)
    localStorage.setItem(CARD_STORAGE_KEY, JSON.stringify(newOrder))
    setDraggedCard(null)
    setDragOverCard(null)
  }
  function handleCardDragEnd() { setDraggedCard(null); setDragOverCard(null) }

  function toggleCardVisibility(cardId: string) {
    const next = new Set(hiddenCards)
    if (next.has(cardId)) next.delete(cardId)
    else next.add(cardId)
    setHiddenCards(next)
    localStorage.setItem(VISIBILITY_STORAGE_KEY, JSON.stringify([...next]))
  }

  async function handleConvertToFactuur(offerteId: string, splitType: 'volledig' | 'split', percentage = 70) {
    setFactuurLoading(offerteId)
    const result = await convertToFactuur(offerteId, splitType, percentage)
    if (result.factuurIds?.[0]) {
      router.push(`/facturatie/${result.factuurIds[0]}`)
    }
    setFactuurLoading(null)
    setFactuurDialogOfferte(null)
  }

  if (!data) {
    return <div className="p-8 text-center text-gray-500">Dashboard laden...</div>
  }

  const maxTaken = Math.max(...data.takenPerCollega.map(t => t.aantal), 1)

  const WIDE_CARDS = new Set(['gefactureerd', 'aangemaakteOffertes'])

  // Period filter component
  function PeriodButtons({ value, onChange }: { value: PeriodFilter; onChange: (p: PeriodFilter) => void }) {
    const options: { label: string; value: PeriodFilter }[] = [
      { label: 'Maand', value: 'maand' },
      { label: 'Kwartaal', value: 'kwartaal' },
      { label: 'Dit jaar', value: 'jaar' },
    ]
    return (
      <div className="flex gap-1">
        {options.map(o => (
          <button
            key={o.value}
            onClick={() => onChange(o.value)}
            className={`px-2.5 py-1 text-xs rounded-md font-medium transition-colors ${
              value === o.value ? 'bg-primary text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
            }`}
          >
            {o.label}
          </button>
        ))}
      </div>
    )
  }

  // Chart bar renderer
  function ChartBars({ data: chartData, valueKey, formatValue }: {
    data: { maand: string; [key: string]: string | number }[]
    valueKey: string
    formatValue: (v: number) => string
  }) {
    const maxVal = Math.max(...chartData.map(d => Number(d[valueKey]) || 0), 1)
    return (
      <div className="flex items-end gap-1.5 h-40">
        {chartData.map((d, i) => {
          const val = Number(d[valueKey]) || 0
          return (
            <div key={i} className="flex-1 flex flex-col items-center gap-1 min-w-0">
              <div className="w-full flex flex-col items-center justify-end h-28">
                {val > 0 && (
                  <span className="text-[9px] text-gray-500 mb-0.5 truncate max-w-full">
                    {formatValue(val)}
                  </span>
                )}
                <div
                  className="w-full max-w-[36px] bg-primary rounded-t transition-all"
                  style={{ height: `${Math.max((val / maxVal) * 100, val > 0 ? 4 : 0)}%` }}
                />
              </div>
              <span className="text-[9px] text-gray-500 truncate max-w-full">{d.maand}</span>
            </div>
          )
        })}
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900">Dashboard</h1>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => setShowSettings(!showSettings)}
          className="text-gray-500"
        >
          <Settings2 className="h-4 w-4" />
          Instellingen
        </Button>
      </div>

      {/* Dashboard instellingen panel */}
      {showSettings && (
        <Card>
          <div className="px-6 py-4 border-b border-gray-200 flex items-center justify-between">
            <h2 className="font-semibold text-gray-900">Dashboard instellingen</h2>
            <button onClick={() => setShowSettings(false)} className="text-gray-400 hover:text-gray-600">
              <X className="h-4 w-4" />
            </button>
          </div>
          <CardContent>
            <p className="text-sm text-gray-500 mb-4">Kies welke kaarten zichtbaar zijn op je dashboard. Sleep kaarten om de volgorde aan te passen.</p>
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-2">
              {cardOrder.map(cardId => {
                const isVisible = !hiddenCards.has(cardId)
                return (
                  <button
                    key={cardId}
                    onClick={() => toggleCardVisibility(cardId)}
                    className={`flex items-center gap-2 px-3 py-2.5 rounded-lg border text-sm font-medium transition-all text-left ${
                      isVisible
                        ? 'border-primary/30 bg-primary/5 text-gray-900'
                        : 'border-gray-200 bg-gray-50 text-gray-400'
                    }`}
                  >
                    {isVisible ? <Eye className="h-3.5 w-3.5 text-primary shrink-0" /> : <EyeOff className="h-3.5 w-3.5 shrink-0" />}
                    <span className="truncate">{CARD_LABELS[cardId] || cardId}</span>
                  </button>
                )
              })}
            </div>
          </CardContent>
        </Card>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {cardOrder.map(cardId => {
          if (hiddenCards.has(cardId)) return null

          let cardContent: React.ReactNode = null

          if (cardId === 'gefactureerd') {
            const chartData = filterChartData(data.gefactureerdPerMaand, gefactureerdPeriod)
            const periodTotal = chartData.reduce((sum, d) => sum + d.bedrag, 0)
            const periodCount = chartData.reduce((sum, d) => sum + d.aantal, 0)
            cardContent = (
              <Card>
                <div className="px-6 py-4 border-b border-gray-200">
                  <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-2">
                      <BarChart3 className="h-4 w-4 text-primary" />
                      <h2 className="font-semibold text-gray-900">Gefactureerd</h2>
                      <span className="inline-flex items-center justify-center px-2 py-0.5 rounded-full bg-gray-100 text-gray-600 text-xs font-bold">
                        {periodCount}
                      </span>
                    </div>
                    <PeriodButtons value={gefactureerdPeriod} onChange={setGefactureerdPeriod} />
                  </div>
                  <p className="text-2xl font-bold text-gray-900">{formatCurrency(periodTotal)}</p>
                </div>
                <CardContent>
                  <ChartBars
                    data={chartData}
                    valueKey="bedrag"
                    formatValue={(v) => {
                      if (v >= 1000000) return `${(v / 1000000).toFixed(1)}M`
                      if (v >= 1000) return `${(v / 1000).toFixed(0)}K`
                      return `€${v}`
                    }}
                  />
                </CardContent>
              </Card>
            )
          } else if (cardId === 'aangemaakteOffertes') {
            const chartData = filterChartData(data.offertesPerMaand, offertesPeriod)
            const periodCount = chartData.reduce((sum, d) => sum + d.aantal, 0)
            const periodBedrag = chartData.reduce((sum, d) => sum + d.bedrag, 0)
            cardContent = (
              <Card>
                <div className="px-6 py-4 border-b border-gray-200">
                  <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-2">
                      <FileText className="h-4 w-4 text-green-600" />
                      <h2 className="font-semibold text-gray-900">Aangemaakte offertes</h2>
                      <span className="inline-flex items-center justify-center px-2 py-0.5 rounded-full bg-gray-100 text-gray-600 text-xs font-bold">
                        {periodCount}
                      </span>
                    </div>
                    <PeriodButtons value={offertesPeriod} onChange={setOffertesPeriod} />
                  </div>
                  <p className="text-2xl font-bold text-gray-900">{formatCurrency(periodBedrag)}</p>
                </div>
                <CardContent>
                  <ChartBars
                    data={chartData}
                    valueKey="aantal"
                    formatValue={(v) => String(v)}
                  />
                </CardContent>
              </Card>
            )
          } else if (cardId === 'klanten') {
            cardContent = (
              <Card>
                <div className="px-6 py-4 border-b border-gray-200 flex items-center justify-between">
                  <h2 className="font-semibold text-gray-900">Organisaties</h2>
                  <span className="inline-flex items-center justify-center px-2 py-0.5 rounded-full bg-gray-100 text-gray-600 text-xs font-bold">
                    {data.organisaties.totaal}
                  </span>
                </div>
                <CardContent>
                  <div className="grid grid-cols-3 divide-x divide-gray-100">
                    <Link href="/relatiebeheer" className="text-center p-3 hover:bg-gray-50 transition-colors rounded-l-lg">
                      <p className="text-xs text-gray-500 mb-1">Totaal</p>
                      <p className="text-2xl font-bold text-blue-600">{data.organisaties.totaal}</p>
                    </Link>
                    <Link href="/relatiebeheer" className="text-center p-3 hover:bg-gray-50 transition-colors">
                      <p className="text-xs text-gray-500 mb-1">Particulier</p>
                      <p className="text-2xl font-bold text-green-600">{data.organisaties.particulier}</p>
                    </Link>
                    <Link href="/relatiebeheer" className="text-center p-3 hover:bg-gray-50 transition-colors rounded-r-lg">
                      <p className="text-xs text-gray-500 mb-1">Zakelijk</p>
                      <p className="text-2xl font-bold text-purple-600">{data.organisaties.zakelijk}</p>
                    </Link>
                  </div>
                </CardContent>
              </Card>
            )
          } else if (cardId === 'offertesPerFase') {
            cardContent = (
              <Card>
                <div className="px-6 py-4 border-b border-gray-200 flex items-center justify-between">
                  <h2 className="font-semibold text-gray-900">Offertes per fase</h2>
                  <span className="inline-flex items-center justify-center px-2 py-0.5 rounded-full bg-gray-100 text-gray-600 text-xs font-bold">
                    {data.totaalOffertes}
                  </span>
                </div>
                <CardContent>
                  <div className="grid grid-cols-2 gap-px bg-gray-100 rounded-lg overflow-hidden">
                    {data.offertesPerFase.filter(f => f.aantal > 0).map(f => (
                      <div key={f.status} className="bg-white p-3">
                        <div className="flex items-center justify-between mb-1">
                          <span className="text-xs text-gray-500">{statusLabels[f.status] || f.status}</span>
                          <span className="text-xs font-medium text-gray-400">{f.aantal}</span>
                        </div>
                        <p className="text-lg font-bold text-primary">{formatCurrency(f.bedrag)}</p>
                      </div>
                    ))}
                  </div>
                  {data.offertesPerFase.every(f => f.aantal === 0) && (
                    <p className="text-sm text-gray-500 py-4 text-center">Geen offertes</p>
                  )}
                </CardContent>
              </Card>
            )
          } else if (cardId === 'facturenPerFase') {
            cardContent = (
              <Card>
                <div className="px-6 py-4 border-b border-gray-200 flex items-center justify-between">
                  <h2 className="font-semibold text-gray-900">Facturen per fase</h2>
                  <span className="inline-flex items-center justify-center px-2 py-0.5 rounded-full bg-gray-100 text-gray-600 text-xs font-bold">
                    {data.totaalFacturen}
                  </span>
                </div>
                <CardContent>
                  <div className="grid grid-cols-2 gap-px bg-gray-100 rounded-lg overflow-hidden">
                    {data.facturenPerFase.filter(f => f.aantal > 0).map(f => (
                      <div key={f.status} className="bg-white p-3">
                        <div className="flex items-center justify-between mb-1">
                          <span className="text-xs text-gray-500">{statusLabels[f.status] || f.status}</span>
                          <span className="text-xs font-medium text-gray-400">{f.aantal}</span>
                        </div>
                        <p className="text-lg font-bold text-primary">{formatCurrency(f.bedrag)}</p>
                      </div>
                    ))}
                  </div>
                  {data.facturenPerFase.every(f => f.aantal === 0) && (
                    <p className="text-sm text-gray-500 py-4 text-center">Geen facturen</p>
                  )}
                </CardContent>
              </Card>
            )
          } else if (cardId === 'takenPerCollega') {
            cardContent = (
              <Card>
                <div className="px-6 py-4 border-b border-gray-200 flex items-center justify-between">
                  <h2 className="font-semibold text-gray-900">Open taken per collega</h2>
                  <span className="inline-flex items-center justify-center px-2 py-0.5 rounded-full bg-gray-100 text-gray-600 text-xs font-bold">
                    {data.takenPerCollega.reduce((sum, t) => sum + t.aantal, 0)}
                  </span>
                </div>
                <CardContent>
                  {data.takenPerCollega.length === 0 ? (
                    <p className="text-sm text-gray-500 py-4 text-center">Geen open taken</p>
                  ) : (
                    <div className="grid grid-cols-2 gap-px bg-gray-100 rounded-lg overflow-hidden">
                      {data.takenPerCollega.map(t => (
                        <div key={t.naam} className="bg-white p-3">
                          <p className="text-xs text-gray-500 truncate mb-1">{t.naam}</p>
                          <p className="text-2xl font-bold text-primary">{t.aantal}</p>
                        </div>
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>
            )
          } else if (cardId === 'berichten' && data.ongelezenBerichten > 0) {
            cardContent = (
              <Card>
                <Link href="/offertes" className="block px-6 py-4 hover:bg-gray-50 transition-colors">
                  <div className="flex items-center gap-3">
                    <div className="p-2 rounded-lg bg-red-50 text-red-600"><MessageCircle className="h-5 w-5" /></div>
                    <div className="flex-1">
                      <p className="text-sm font-medium text-gray-900">{data.ongelezenBerichten} ongelezen {data.ongelezenBerichten === 1 ? 'bericht' : 'berichten'}</p>
                      <p className="text-xs text-gray-500">Van klanten via het portaal</p>
                    </div>
                    <span className="inline-flex items-center justify-center w-6 h-6 rounded-full bg-red-500 text-white text-xs font-bold">{data.ongelezenBerichten}</span>
                  </div>
                </Link>
              </Card>
            )
          } else if (cardId === 'tePlannen' && data.tePlannenOrders.length > 0) {
            cardContent = (
              <Card>
                <div className="px-6 py-4 border-b border-gray-200 flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Truck className="h-4 w-4 text-green-600" />
                    <h2 className="font-semibold text-gray-900">Te plannen leveringen</h2>
                  </div>
                  <span className="inline-flex items-center justify-center w-5 h-5 rounded-full bg-green-100 text-green-700 text-xs font-bold">
                    {data.tePlannenOrders.length}
                  </span>
                </div>
                <CardContent>
                  <div className="space-y-3">
                    {data.tePlannenOrders.map(order => (
                      <div key={order.id} className="p-3 rounded-lg border border-green-100 bg-green-50/30">
                        <div className="flex items-start justify-between gap-2">
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium text-gray-900 truncate">
                              {order.relatie_bedrijfsnaam}
                            </p>
                            <p className="text-xs text-gray-500 truncate">
                              {order.ordernummer}
                              {order.onderwerp && ` · ${order.onderwerp}`}
                            </p>
                          </div>
                          <span className="text-sm font-medium text-gray-900 whitespace-nowrap">
                            {formatCurrency(order.totaal)}
                          </span>
                        </div>
                        <div className="mt-2">
                          <Button
                            size="sm"
                            onClick={() => setPlanningOrder(order)}
                          >
                            <CalendarDays className="h-3.5 w-3.5" />
                            Levering plannen
                          </Button>
                        </div>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            )
          } else if (cardId === 'geplandeLeveringen' && data.geplandeLeveringen.length > 0) {
            cardContent = (
              <Card>
                <div className="px-6 py-4 border-b border-gray-200 flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Package className="h-4 w-4 text-blue-600" />
                    <h2 className="font-semibold text-gray-900">Geplande leveringen</h2>
                  </div>
                  <span className="inline-flex items-center justify-center w-5 h-5 rounded-full bg-blue-100 text-blue-700 text-xs font-bold">
                    {data.geplandeLeveringen.length}
                  </span>
                </div>
                <CardContent>
                  <div className="space-y-2">
                    {data.geplandeLeveringen.map(order => {
                      const leverDate = new Date(order.leverdatum)
                      const today = new Date()
                      today.setHours(0, 0, 0, 0)
                      const diffDays = Math.ceil((leverDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24))
                      const isPast = diffDays < 0
                      const isToday = diffDays === 0
                      const isSoon = diffDays > 0 && diffDays <= 3

                      return (
                        <Link
                          key={order.id}
                          href={`/offertes/orders/${order.id}`}
                          className={`block p-3 rounded-lg hover:bg-gray-50 transition-colors border ${
                            isPast ? 'border-red-200 bg-red-50/50' : isToday ? 'border-green-300 bg-green-50/50' : isSoon ? 'border-orange-200 bg-orange-50/50' : 'border-gray-100'
                          }`}
                        >
                          <div className="flex items-start justify-between gap-2">
                            <div className="flex-1 min-w-0">
                              <p className="text-sm font-medium text-gray-900 truncate">{order.relatie_bedrijfsnaam}</p>
                              <p className="text-xs text-gray-500 truncate">
                                {order.ordernummer}
                                {order.onderwerp && ` · ${order.onderwerp}`}
                              </p>
                            </div>
                            <span className="text-sm font-medium text-gray-900 whitespace-nowrap">{formatCurrency(order.totaal)}</span>
                          </div>
                          <div className="flex items-center gap-1 mt-1.5">
                            <CalendarDays className={`h-3 w-3 ${isPast ? 'text-red-500' : isToday ? 'text-green-600' : isSoon ? 'text-orange-500' : 'text-gray-400'}`} />
                            <span className={`text-xs font-medium ${
                              isPast ? 'text-red-600' : isToday ? 'text-green-700' : isSoon ? 'text-orange-600' : 'text-gray-500'
                            }`}>
                              {isToday ? 'Vandaag' : isPast ? `${Math.abs(diffDays)} dagen geleden` : `${format(leverDate, 'EEEE d MMM', { locale: nl })}`}
                              {isSoon && ` — Over ${diffDays} ${diffDays === 1 ? 'dag' : 'dagen'}`}
                            </span>
                          </div>
                        </Link>
                      )
                    })}
                  </div>
                </CardContent>
              </Card>
            )
          } else if (cardId === 'openOffertes') {
            cardContent = (
              <Card>
                <div className="px-6 py-4 border-b border-gray-200 flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <FileText className="h-4 w-4 text-gray-500" />
                    <h2 className="font-semibold text-gray-900">Open offertes</h2>
                  </div>
                  {data.openOffertesList.length > 0 && (
                    <span className="text-xs font-medium text-gray-500">{data.openOffertesList.length} verzonden</span>
                  )}
                </div>
                <CardContent>
                  {data.openOffertesList.length === 0 ? (
                    <div className="py-6 text-center">
                      <FileText className="h-8 w-8 text-gray-300 mx-auto mb-2" />
                      <p className="text-sm text-gray-500">Geen openstaande offertes</p>
                    </div>
                  ) : (
                    <div className="space-y-2">
                      {data.openOffertesList.map(o => {
                        const isUrgent = o.dagen_open > 14
                        const isWarning = o.dagen_open > 7
                        return (
                          <Link
                            key={o.id}
                            href={`/offertes/${o.id}`}
                            className={`block p-3 rounded-lg hover:bg-gray-50 transition-colors border ${
                              isUrgent ? 'border-red-200 bg-red-50/50' : isWarning ? 'border-orange-200 bg-orange-50/50' : 'border-gray-100'
                            }`}
                          >
                            <div className="flex items-start justify-between gap-2">
                              <div className="flex-1 min-w-0">
                                <p className="text-sm font-medium text-gray-900 truncate">{o.relatie_bedrijfsnaam}</p>
                                <p className="text-xs text-gray-500 truncate">
                                  {o.offertenummer}
                                  {o.project_naam && ` · ${o.project_naam}`}
                                </p>
                              </div>
                              <span className="text-sm font-medium text-gray-900 whitespace-nowrap">{formatCurrency(o.totaal)}</span>
                            </div>
                            <div className="flex items-center gap-1 mt-1.5">
                              <Clock className={`h-3 w-3 ${isUrgent ? 'text-red-500' : isWarning ? 'text-orange-500' : 'text-gray-400'}`} />
                              <span className={`text-xs font-medium ${
                                isUrgent ? 'text-red-600' : isWarning ? 'text-orange-600' : 'text-gray-500'
                              }`}>
                                {o.dagen_open} dagen open
                                {isUrgent && ' — Opvolgen!'}
                                {!isUrgent && isWarning && ' — Herinnering'}
                              </span>
                            </div>
                          </Link>
                        )
                      })}
                    </div>
                  )}
                </CardContent>
              </Card>
            )
          } else if (cardId === 'geaccepteerdeOffertes' && data.geaccepteerdeOffertes.length > 0) {
            cardContent = (
              <Card>
                <div className="px-6 py-4 border-b border-gray-200 flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <CheckCircle className="h-4 w-4 text-green-600" />
                    <h2 className="font-semibold text-gray-900">Geaccepteerde offertes</h2>
                  </div>
                  <span className="inline-flex items-center justify-center w-5 h-5 rounded-full bg-green-100 text-green-700 text-xs font-bold">
                    {data.geaccepteerdeOffertes.length}
                  </span>
                </div>
                <CardContent>
                  <div className="space-y-3">
                    {data.geaccepteerdeOffertes.map(o => (
                      <div key={o.id} className="p-3 rounded-lg border border-green-100 bg-green-50/30">
                        <div className="flex items-start justify-between gap-2">
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium text-gray-900 truncate">
                              {o.relatie_bedrijfsnaam}
                            </p>
                            <p className="text-xs text-gray-500 truncate">
                              {o.offertenummer}
                              {o.onderwerp && ` · ${o.onderwerp}`}
                            </p>
                          </div>
                          <span className="text-sm font-medium text-gray-900 whitespace-nowrap">
                            {formatCurrency(o.totaal)}
                          </span>
                        </div>
                        <div className="mt-2 flex gap-2">
                          <Button
                            size="sm"
                            disabled={factuurLoading === o.id}
                            onClick={() => setFactuurDialogOfferte({ id: o.id, totaal: o.totaal })}
                          >
                            <Receipt className="h-3.5 w-3.5" />
                            {factuurLoading === o.id ? 'Aanmaken...' : 'Factuur aanmaken'}
                          </Button>
                          <Link href={`/offertes/${o.id}`}>
                            <Button size="sm" variant="ghost">
                              <FileText className="h-3.5 w-3.5" />
                              Bekijken
                            </Button>
                          </Link>
                        </div>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            )
          } else if (cardId === 'openstaandeFacturen' && data.openstaandeFacturen.length > 0) {
            cardContent = (
              <Card>
                <div className="px-6 py-4 border-b border-gray-200 flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Receipt className="h-4 w-4 text-orange-600" />
                    <h2 className="font-semibold text-gray-900">Openstaande facturen</h2>
                  </div>
                  <span className="inline-flex items-center justify-center w-5 h-5 rounded-full bg-orange-100 text-orange-700 text-xs font-bold">
                    {data.openstaandeFacturen.length}
                  </span>
                </div>
                <CardContent>
                  <div className="space-y-2">
                    {data.openstaandeFacturen.map(f => {
                      const isVervallen = f.vervaldatum && new Date(f.vervaldatum) < new Date()
                      const dagenTotVervaldatum = f.vervaldatum
                        ? Math.ceil((new Date(f.vervaldatum).getTime() - new Date().getTime()) / (1000 * 60 * 60 * 24))
                        : null
                      const isDringend = dagenTotVervaldatum !== null && dagenTotVervaldatum > 0 && dagenTotVervaldatum <= 7

                      return (
                        <Link
                          key={f.id}
                          href={`/facturatie/${f.id}`}
                          className={`block p-3 rounded-lg hover:bg-gray-50 transition-colors border ${
                            isVervallen ? 'border-red-200 bg-red-50/30' : isDringend ? 'border-orange-200 bg-orange-50/30' : 'border-gray-100'
                          }`}
                        >
                          <div className="flex items-start justify-between gap-2">
                            <div className="flex-1 min-w-0">
                              <p className="text-sm font-medium text-gray-900 truncate">
                                {f.relatie_bedrijfsnaam}
                              </p>
                              <p className="text-xs text-gray-500 truncate">
                                {f.factuurnummer}
                                {f.status !== 'verzonden' && ` · ${statusLabels[f.status] || f.status}`}
                              </p>
                            </div>
                            <span className="text-sm font-medium text-gray-900 whitespace-nowrap">
                              {formatCurrency(f.openstaand_bedrag)}
                            </span>
                          </div>
                          {f.vervaldatum && (
                            <p className={`text-xs mt-1 ${
                              isVervallen ? 'text-red-600 font-medium' : isDringend ? 'text-orange-600 font-medium' : 'text-gray-400'
                            }`}>
                              {isVervallen
                                ? `Vervallen sinds ${format(new Date(f.vervaldatum), 'd MMM', { locale: nl })}`
                                : `Vervaldatum: ${format(new Date(f.vervaldatum), 'd MMM yyyy', { locale: nl })}`}
                            </p>
                          )}
                        </Link>
                      )
                    })}
                  </div>
                </CardContent>
              </Card>
            )
          } else if (cardId === 'mijnTaken') {
            cardContent = (
              <Card>
                <div className="px-6 py-4 border-b border-gray-200 flex items-center justify-between">
                  <h2 className="font-semibold text-gray-900">Mijn openstaande taken</h2>
                  <span className="inline-flex items-center justify-center px-2 py-0.5 rounded-full bg-gray-100 text-gray-600 text-xs font-bold">
                    {data.mijnTaken.length}
                  </span>
                </div>
                <CardContent>
                  {data.mijnTaken.length === 0 ? (
                    <div className="py-8 text-center">
                      <CheckSquare className="h-8 w-8 text-gray-300 mx-auto mb-2" />
                      <p className="text-sm text-gray-500">Geen openstaande taken</p>
                    </div>
                  ) : (
                    <div className="space-y-2">
                      {data.mijnTaken.map(t => (
                        <Link key={t.id} href={`/taken/${t.id}`} className="block p-3 rounded-lg hover:bg-gray-50 transition-colors border border-gray-100">
                          <div className="flex items-start gap-2">
                            <div className="flex-1">
                              <p className="text-sm font-medium text-gray-900">{t.titel}</p>
                              {t.deadline && (
                                <p className="text-xs text-gray-500 mt-1">
                                  {new Date(t.deadline) < new Date() ? (
                                    <span className="text-red-500 flex items-center gap-1">
                                      <AlertCircle className="h-3 w-3" />
                                      Verlopen: {new Date(t.deadline).toLocaleDateString('nl-NL')}
                                    </span>
                                  ) : (
                                    `Deadline: ${new Date(t.deadline).toLocaleDateString('nl-NL')}`
                                  )}
                                </p>
                              )}
                            </div>
                            <Badge status={t.prioriteit}>{t.prioriteit}</Badge>
                          </div>
                        </Link>
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>
            )
          }

          if (!cardContent) return null

          return (
            <div
              key={cardId}
              draggable
              onDragStart={(e) => handleCardDragStart(e, cardId)}
              onDragOver={(e) => handleCardDragOver(e, cardId)}
              onDrop={() => handleCardDrop(cardId)}
              onDragEnd={handleCardDragEnd}
              className={`relative group ${WIDE_CARDS.has(cardId) ? 'md:col-span-2' : ''} ${draggedCard === cardId ? 'opacity-50' : ''} ${dragOverCard === cardId ? 'ring-2 ring-primary ring-offset-2 rounded-xl' : ''}`}
            >
              <div className="absolute -left-6 top-4 opacity-0 group-hover:opacity-100 transition-opacity cursor-grab active:cursor-grabbing">
                <GripVertical className="h-4 w-4 text-gray-400" />
              </div>
              {cardContent}
            </div>
          )
        })}
      </div>

      {planningOrder && (
        <DeliveryPlanningDialog
          open={!!planningOrder}
          onClose={() => setPlanningOrder(null)}
          order={planningOrder}
        />
      )}

      {/* Factuur conversie dialog */}
      {factuurDialogOfferte && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="bg-white rounded-xl p-6 max-w-md w-full mx-4 shadow-xl">
            <h3 className="text-lg font-semibold mb-2">Offerte factureren</h3>
            <p className="text-sm text-gray-600 mb-6">Hoe wilt u deze offerte factureren?</p>
            <div className="space-y-3">
              <button onClick={() => handleConvertToFactuur(factuurDialogOfferte.id, 'volledig')} disabled={!!factuurLoading} className="w-full text-left p-4 rounded-lg border-2 border-gray-200 hover:border-blue-500 hover:bg-blue-50/50 transition-all">
                <p className="font-medium">100% factureren</p>
                <p className="text-sm text-gray-500">1 factuur voor het volledige bedrag van {formatCurrency(factuurDialogOfferte.totaal)}</p>
              </button>
              <button onClick={() => handleConvertToFactuur(factuurDialogOfferte.id, 'split', 70)} disabled={!!factuurLoading} className="w-full text-left p-4 rounded-lg border-2 border-gray-200 hover:border-blue-500 hover:bg-blue-50/50 transition-all">
                <p className="font-medium">70% / 30% splitsen</p>
                <p className="text-sm text-gray-500">Aanbetaling: {formatCurrency(factuurDialogOfferte.totaal * 0.7)} &middot; Restbetaling: {formatCurrency(factuurDialogOfferte.totaal * 0.3)}</p>
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
                      className="w-20 px-3 py-2 border border-gray-300 rounded-md text-sm text-right focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    />
                    <span className="text-sm text-gray-500">% / {100 - customSplitPercentage}%</span>
                  </div>
                  <Button size="sm" onClick={() => handleConvertToFactuur(factuurDialogOfferte.id, 'split', customSplitPercentage)} disabled={!!factuurLoading}>
                    Factureren
                  </Button>
                </div>
                <p className="text-xs text-gray-400 mt-2">
                  Aanbetaling: {formatCurrency(factuurDialogOfferte.totaal * customSplitPercentage / 100)} &middot; Rest: {formatCurrency(factuurDialogOfferte.totaal * (100 - customSplitPercentage) / 100)}
                </p>
              </div>
            </div>
            <div className="flex justify-end mt-4"><Button variant="ghost" onClick={() => setFactuurDialogOfferte(null)}>Annuleren</Button></div>
          </div>
        </div>
      )}
    </div>
  )
}
