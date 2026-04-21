'use client'

import { useState } from 'react'
import Link from 'next/link'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { formatCurrency } from '@/lib/utils'
import { FileText, Truck, Package, Receipt, Target, ChevronDown, ChevronUp, Pencil, AlertTriangle, ArrowRight, DollarSign, TrendingUp, CheckSquare, Bell, ShoppingCart, Clock, Calendar, Users, FolderKanban, Mail } from 'lucide-react'
import { format } from 'date-fns'
import { nl } from 'date-fns/locale'
import { useRouter } from 'next/navigation'
import { convertToFactuur, saveOmzetdoelen, markOrderBesteld, completeTaak } from '@/lib/actions'
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
  takenPerCollega: { naam: string; profiel_id: string; aantal: number; bellen: number; uitwerken: number; perTitel: { titel: string; aantal: number }[] }[]
  mijnTaken: { id: string; titel: string; deadline: string | null; prioriteit: string; toegewezen_naam: string | null; bedrag: number | null; relatie_naam: string | null }[]
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
    restbetaling: { id: string; factuurnummer: string; status: string; totaal: number } | null
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
    factuur_type: string | null
  }[]
  topKlanten: {
    relatie_id: string
    bedrijfsnaam: string
    betaald: number
    offerte_waarde: number
  }[]
  omzetdoelen: {
    week_doel: number
    maand_doel: number
    jaar_doel: number
    week_omzet: number
    maand_omzet: number
    jaar_omzet: number
    heeft_doelen: boolean
  }
  triageEmails: {
    id: string
    van_email: string
    van_naam: string | null
    onderwerp: string | null
    datum: string
    labels: string[]
  }[]
  openAanvragen: {
    id: string
    omschrijving: string | null
    status: string
    created_at: string
    relatie_id: string | null
    relatie_naam: string | null
    offerte_id: string | null
  }[]
  recenteOffertes: {
    id: string
    offertenummer: string
    relatie_bedrijfsnaam: string
    project_naam: string | null
    status: string
    totaal: number
    datum: string
  }[]
  moetBesteldOrders: {
    id: string
    ordernummer: string
    relatie_bedrijfsnaam: string
    offerte_nummer: string | null
    onderwerp: string | null
    totaal: number
    datum: string
  }[]
  openVerkoopkansen: {
    id: string
    naam: string
    status: string
    created_at: string
    bron: string
    relatie_bedrijfsnaam: string
    heeft_offerte: boolean
    aantal_emails: number
  }[]
}

function formatDateShort(d: string) {
  try {
    return format(new Date(d), 'd MMM yyyy', { locale: nl })
  } catch { return d }
}

function dagenVerschil(d: string) {
  const now = new Date()
  const target = new Date(d)
  return Math.ceil((target.getTime() - now.getTime()) / (1000 * 60 * 60 * 24))
}

function DagenPill({ dagen, isOver }: { dagen: number; isOver: boolean }) {
  const color = isOver ? 'bg-red-100 text-red-700' : dagen <= 3 ? 'bg-amber-100 text-amber-700' : dagen <= 7 ? 'bg-gray-100 text-gray-600' : 'bg-emerald-50 text-emerald-600'
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-medium ${color}`}>
      {isOver ? `${dagen}d over` : `${dagen}d`}
    </span>
  )
}

// Collapsible section
function Section({ title, icon: Icon, iconColor, count, children, defaultOpen, linkHref, linkLabel, accentColor }: {
  title: string
  icon: typeof FileText
  iconColor: string
  count: number
  children: React.ReactNode
  defaultOpen?: boolean
  linkHref?: string
  linkLabel?: string
  accentColor?: string
}) {
  const storageKey = `dashboard:section:${title}`
  const [open, setOpen] = useState(() => {
    if (typeof window === 'undefined') return defaultOpen ?? count > 0
    const stored = window.localStorage.getItem(storageKey)
    if (stored === '1') return true
    if (stored === '0') return false
    return defaultOpen ?? count > 0
  })

  function toggle() {
    setOpen(prev => {
      const next = !prev
      try { window.localStorage.setItem(storageKey, next ? '1' : '0') } catch {}
      return next
    })
  }

  return (
    <div className={`rounded-xl bg-white overflow-hidden shadow-sm border border-gray-100 ${!open ? 'hover:shadow-md transition-shadow' : ''}`}>
      <button
        onClick={toggle}
        className="w-full px-4 sm:px-5 py-3 sm:py-3.5 flex items-center justify-between hover:bg-gray-50/50 transition-colors"
      >
        <div className="flex items-center gap-2.5 sm:gap-3 min-w-0">
          <div className={`h-7 w-7 sm:h-8 sm:w-8 rounded-lg flex items-center justify-center shrink-0 ${iconColor}`}>
            <Icon className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
          </div>
          <h2 className="text-sm font-semibold text-gray-900 truncate">{title}</h2>
          {count > 0 && (
            <span className={`inline-flex items-center justify-center h-5 min-w-[20px] px-1.5 rounded-full text-[11px] font-bold shrink-0 ${accentColor || 'bg-gray-100 text-gray-600'}`}>
              {count}
            </span>
          )}
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {linkHref && open && (
            <Link
              href={linkHref}
              onClick={(e) => e.stopPropagation()}
              className="text-xs font-medium text-[#00a66e] hover:underline items-center gap-1 mr-1 hidden sm:flex"
            >
              {linkLabel || 'Bekijk alle'} <ArrowRight className="h-3 w-3" />
            </Link>
          )}
          {open ? <ChevronUp className="h-4 w-4 text-gray-300" /> : <ChevronDown className="h-4 w-4 text-gray-300" />}
        </div>
      </button>
      {open && count > 0 && <div className="border-t border-gray-100">{children}</div>}
      {open && count === 0 && (
        <div className="border-t border-gray-100 px-4 py-6 sm:py-8 text-center">
          <Icon className="h-6 w-6 text-gray-200 mx-auto mb-2" />
          <p className="text-sm text-gray-400">Geen items</p>
        </div>
      )}
    </div>
  )
}

function categoriseerTaak(titel: string): 'bellen' | 'uitwerken' {
  const t = titel.toLowerCase()
  if (t.includes('bellen') || t.includes('opbellen') || t.includes('nabellen')) return 'bellen'
  return 'uitwerken'
}

function TakenPerCollegaSection({ data }: { data: DashboardData['takenPerCollega'] }) {
  const [selected, setSelected] = useState<string | null>(null)
  const totaal = data.reduce((s, c) => s + c.aantal, 0)
  const selectedCollega = data.find(c => c.profiel_id === selected)

  // Categorie-cijfers komen direct uit de server (categorie-veld op taken)
  const categorieën = selectedCollega ? [
    { key: 'uitwerken' as const, label: 'Uitwerken', aantal: selectedCollega.uitwerken },
    { key: 'bellen' as const, label: 'Bellen', aantal: selectedCollega.bellen },
  ].filter(c => c.aantal > 0) : []

  return (
    <Section title="Taken per collega" icon={Users} iconColor="bg-violet-50 text-violet-600" count={totaal} linkHref="/taken" linkLabel="Alle taken" accentColor="bg-violet-100 text-violet-700">
      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-px bg-gray-100">
        {data.map(c => (
          <button
            key={c.profiel_id}
            onClick={() => setSelected(selected === c.profiel_id ? null : c.profiel_id)}
            className={`text-left px-4 py-3 transition-colors ${selected === c.profiel_id ? 'bg-[#00a66e] text-white' : 'bg-white hover:bg-gray-50'}`}
          >
            <p className={`text-xs truncate ${selected === c.profiel_id ? 'text-white/80' : 'text-gray-500'}`}>{c.naam}</p>
            <p className={`text-xl font-bold mt-0.5 ${selected === c.profiel_id ? 'text-white' : 'text-gray-900'}`}>{c.aantal}</p>
          </button>
        ))}
      </div>
      {selectedCollega && (
        <div className="border-t border-gray-100 px-4 sm:px-5 py-3">
          <p className="text-[11px] font-medium text-gray-400 uppercase tracking-wider mb-2">Taken van {selectedCollega.naam}</p>
          <div className="grid grid-cols-2 gap-2">
            {categorieën.map(cat => (
              <Link
                key={cat.key}
                href={`/taken?collega=${selectedCollega.profiel_id}&categorie=${cat.key}`}
                className="bg-gray-50 hover:bg-gray-100 rounded-lg px-4 py-3 transition-colors block"
              >
                <p className="text-xs text-gray-500">{cat.label}</p>
                <p className="text-2xl font-bold text-gray-900">{cat.aantal}</p>
              </Link>
            ))}
          </div>
        </div>
      )}
    </Section>
  )
}

export function DashboardView({ data }: { data: DashboardData | null }) {
  const router = useRouter()
  const [planningOrder, setPlanningOrder] = useState<TePlannenOrder | null>(null)
  const [factuurLoading, setFactuurLoading] = useState<string | null>(null)
  const [factuurDialogOfferte, setFactuurDialogOfferte] = useState<{ id: string; totaal: number } | null>(null)
  const [customSplitPercentage, setCustomSplitPercentage] = useState(50)
  const [besteldLoading, setBesteldLoading] = useState<string | null>(null)
  const [showDoelenEdit, setShowDoelenEdit] = useState(false)
  const [doelenSaving, setDoelenSaving] = useState(false)
  const [doelenTab, setDoelenTab] = useState<'week' | 'maand' | 'jaar'>('maand')
  const [doelenForm, setDoelenForm] = useState({
    week_doel: data?.omzetdoelen?.week_doel?.toString() || '0',
    maand_doel: data?.omzetdoelen?.maand_doel?.toString() || '0',
    jaar_doel: data?.omzetdoelen?.jaar_doel?.toString() || '0',
  })
  const [takenLijst, setTakenLijst] = useState(data?.mijnTaken || [])

  async function handleCompleteTaak(id: string, e: React.MouseEvent) {
    e.stopPropagation()
    setTakenLijst(prev => prev.filter(t => t.id !== id))
    await completeTaak(id)
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

  async function handleSaveDoelen() {
    setDoelenSaving(true)
    const fd = new FormData()
    fd.set('week_doel', doelenForm.week_doel)
    fd.set('maand_doel', doelenForm.maand_doel)
    fd.set('jaar_doel', doelenForm.jaar_doel)
    await saveOmzetdoelen(fd)
    setDoelenSaving(false)
    setShowDoelenEdit(false)
    router.refresh()
  }

  if (!data) {
    return <div className="p-8 text-center text-gray-500">Dashboard laden...</div>
  }

  // Notification items
  const notifications: { label: string; href: string; count: number }[] = []
  if (data.geaccepteerdeOffertes.length > 0) {
    notifications.push({ label: `offerte${data.geaccepteerdeOffertes.length !== 1 ? 's' : ''} factureren`, href: '#geaccepteerd', count: data.geaccepteerdeOffertes.length })
  }
  if (data.openAanvragen && data.openAanvragen.length > 0) {
    notifications.push({ label: `aanvra${data.openAanvragen.length !== 1 ? 'gen' : 'ag'}`, href: '/aanvragen', count: data.openAanvragen.length })
  }
  const achterstalligeFacturen = data.openstaandeFacturen.filter(f => f.vervaldatum && new Date(f.vervaldatum) < new Date())
  if (achterstalligeFacturen.length > 0) {
    notifications.push({ label: 'vervallen', href: '#facturen', count: achterstalligeFacturen.length })
  }
  if (data.moetBesteldOrders.length > 0) {
    notifications.push({ label: 'bestellen', href: '#bestellen', count: data.moetBesteldOrders.length })
  }
  const dertigDagenGeleden = new Date()
  dertigDagenGeleden.setDate(dertigDagenGeleden.getDate() - 30)
  const verkoopkansenZonderOfferte = (data.openVerkoopkansen || []).filter(v => !v.heeft_offerte && v.bron !== 'import' && new Date(v.created_at) > dertigDagenGeleden)
  if (verkoopkansenZonderOfferte.length > 0) {
    notifications.push({ label: 'verkoopkansen zonder offerte', href: '#verkoopkansen', count: verkoopkansenZonderOfferte.length })
  }

  const conversieGraad = data.totaalOffertes > 0
    ? Math.round((data.offertesPerFase.find(f => f.status === 'geaccepteerd')?.aantal || 0) / data.totaalOffertes * 100)
    : 0
  const achterstalligBedrag = achterstalligeFacturen.reduce((sum, f) => sum + f.openstaand_bedrag, 0)

  const doelen = data.omzetdoelen
  const doelenItems: Record<string, { label: string; omzet: number; doel: number }> = {
    week: { label: 'Week', omzet: doelen.week_omzet, doel: doelen.week_doel },
    maand: { label: 'Maand', omzet: doelen.maand_omzet, doel: doelen.maand_doel },
    jaar: { label: 'Jaar', omzet: doelen.jaar_omzet, doel: doelen.jaar_doel },
  }
  const activeDoel = doelenItems[doelenTab]
  const doelenPercentage = activeDoel.doel > 0 ? Math.round((activeDoel.omzet / activeDoel.doel) * 100) : 0
  const doelenBarColor = doelenPercentage >= 100 ? 'bg-[#00a66e]' : doelenPercentage >= 80 ? 'bg-green-500' : doelenPercentage >= 50 ? 'bg-amber-500' : 'bg-red-500'

  // Omzetdoelen widget (reused on mobile + desktop sidebar)
  const omzetdoelenWidget = (
    <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
      <div className="px-4 sm:px-5 py-3 border-b border-gray-100 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="h-7 w-7 rounded-lg bg-emerald-50 flex items-center justify-center">
            <Target className="h-3.5 w-3.5 text-[#00a66e]" />
          </div>
          <h3 className="text-sm font-semibold text-gray-900">Omzetdoelen</h3>
        </div>
        <div className="flex items-center gap-1">
          {(['week', 'maand', 'jaar'] as const).map(tab => (
            <button
              key={tab}
              onClick={() => setDoelenTab(tab)}
              className={`px-2.5 py-1 text-[11px] rounded-md font-medium transition-colors ${
                doelenTab === tab ? 'bg-[#00a66e] text-white shadow-sm' : 'text-gray-500 hover:bg-gray-100'
              }`}
            >
              {tab.charAt(0).toUpperCase() + tab.slice(1)}
            </button>
          ))}
          <button onClick={() => { setShowDoelenEdit(true); setDoelenForm({ week_doel: doelen.week_doel.toString(), maand_doel: doelen.maand_doel.toString(), jaar_doel: doelen.jaar_doel.toString() }) }} className="ml-1 p-1.5 rounded-md text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-colors">
            <Pencil className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>
      <div
        className="p-4 sm:p-5 cursor-pointer hover:bg-gray-50/50 transition-colors"
        onClick={() => { setShowDoelenEdit(true); setDoelenForm({ week_doel: doelen.week_doel.toString(), maand_doel: doelen.maand_doel.toString(), jaar_doel: doelen.jaar_doel.toString() }) }}
      >
        {!doelen.heeft_doelen ? (
          <div className="py-4 text-center">
            <Target className="h-8 w-8 text-gray-200 mx-auto mb-2" />
            <p className="text-sm text-gray-400 mb-3">Geen doelen ingesteld</p>
            <p className="text-xs text-primary font-medium">Klik om doelen in te stellen</p>
          </div>
        ) : (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <span className={`text-3xl font-bold tracking-tight ${doelenPercentage >= 100 ? 'text-[#00a66e]' : doelenPercentage >= 80 ? 'text-green-600' : doelenPercentage >= 50 ? 'text-amber-500' : 'text-red-500'}`}>
                {doelenPercentage}%
              </span>
              <span className="text-xs text-gray-400">{activeDoel.label}doel {new Date().getFullYear()}</span>
            </div>
            <div className="w-full bg-gray-100 rounded-full h-2.5 overflow-hidden">
              <div className={`h-2.5 rounded-full transition-all duration-700 ${doelenBarColor}`} style={{ width: `${Math.min(doelenPercentage, 100)}%` }} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="bg-gray-50 rounded-lg p-3 text-center">
                <p className="text-[10px] font-medium text-gray-400 uppercase tracking-wider">Omzet</p>
                <p className="text-sm font-bold text-gray-900 mt-0.5">{formatCurrency(activeDoel.omzet)}</p>
              </div>
              <div className="bg-gray-50 rounded-lg p-3 text-center">
                <p className="text-[10px] font-medium text-gray-400 uppercase tracking-wider">Doel</p>
                <p className="text-sm font-bold text-gray-900 mt-0.5">{formatCurrency(activeDoel.doel)}</p>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )

  return (
    <div className="space-y-4 sm:space-y-6">
      {/* Header */}
      <div className="flex items-end justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-xl sm:text-2xl font-bold text-gray-900">Dashboard</h1>
          <p className="text-xs sm:text-sm text-gray-400 mt-0.5 truncate">
            {format(new Date(), "EEEE d MMMM yyyy", { locale: nl })}
          </p>
        </div>
        <Link href="/offertes/nieuw" className="shrink-0">
          <Button size="sm" className="bg-[#00a66e] hover:bg-[#008f5f] shadow-sm">
            <FileText className="h-3.5 w-3.5 sm:mr-1.5" />
            <span className="hidden sm:inline">Nieuwe offerte</span>
          </Button>
        </Link>
      </div>

      {/* Notificatiebalk */}
      {notifications.length > 0 && (
        <div className="bg-amber-50/80 border border-amber-200/60 rounded-xl px-3 sm:px-5 py-2.5 sm:py-3">
          <div className="flex items-center gap-2 text-amber-700 mb-1.5 sm:mb-0 sm:inline-flex sm:mr-3">
            <Bell className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
            <span className="text-xs sm:text-sm font-medium">Actie vereist</span>
          </div>
          <div className="flex flex-wrap gap-2 sm:gap-3 sm:inline-flex">
            {notifications.map((n, i) => (
              <Link key={i} href={n.href} className="flex items-center gap-1 text-xs sm:text-sm text-amber-800 hover:text-amber-950 hover:underline transition-colors">
                <span className="inline-flex items-center justify-center h-4 sm:h-5 min-w-[16px] sm:min-w-[20px] px-1 rounded-full bg-amber-200/70 text-amber-800 text-[10px] sm:text-[11px] font-bold">{n.count}</span>
                {n.label}
              </Link>
            ))}
          </div>
        </div>
      )}

      {/* KPI rij */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
        <Link href="/facturatie" className="block group">
          <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-4 sm:p-5 group-hover:shadow-md transition-all">
            <div className="flex items-center justify-between mb-3">
              <div className="h-9 w-9 rounded-lg bg-emerald-50 flex items-center justify-center">
                <DollarSign className="h-4 w-4 text-[#00a66e]" />
              </div>
              <span className="text-[10px] font-medium text-gray-400 uppercase tracking-wider">Deze maand</span>
            </div>
            <p className="text-lg sm:text-2xl font-bold text-gray-900 tracking-tight">{formatCurrency(data.omzet)}</p>
            <p className="text-xs text-gray-400 mt-1">Omzet (excl. BTW)</p>
          </div>
        </Link>
        <Link href="#facturen" className="block group">
          <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-4 sm:p-5 group-hover:shadow-md transition-all">
            <div className="flex items-center justify-between mb-3">
              <div className="h-9 w-9 rounded-lg bg-blue-50 flex items-center justify-center">
                <Receipt className="h-4 w-4 text-blue-600" />
              </div>
              <span className="text-[10px] font-medium text-gray-400 uppercase tracking-wider">{data.openstaandeFacturen.length} facturen</span>
            </div>
            <p className="text-lg sm:text-2xl font-bold text-gray-900 tracking-tight">{formatCurrency(data.openstaand)}</p>
            <p className="text-xs text-gray-400 mt-1">Openstaand</p>
          </div>
        </Link>
        <Link href="/offertes" className="block group">
          <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-4 sm:p-5 group-hover:shadow-md transition-all">
            <div className="flex items-center justify-between mb-3">
              <div className="h-9 w-9 rounded-lg bg-violet-50 flex items-center justify-center">
                <TrendingUp className="h-4 w-4 text-violet-600" />
              </div>
              <span className="text-[10px] font-medium text-gray-400 uppercase tracking-wider">{data.totaalOffertes} offertes</span>
            </div>
            <p className="text-lg sm:text-2xl font-bold text-gray-900 tracking-tight">{conversieGraad}%</p>
            <p className="text-xs text-gray-400 mt-1">Conversie</p>
          </div>
        </Link>
        <Link href="#facturen" className="block group">
          <div className={`bg-white rounded-xl border shadow-sm p-4 sm:p-5 group-hover:shadow-md transition-all ${achterstalligBedrag > 0 ? 'border-red-200/60' : 'border-gray-100'}`}>
            <div className="flex items-center justify-between mb-3">
              <div className={`h-9 w-9 rounded-lg flex items-center justify-center ${achterstalligBedrag > 0 ? 'bg-red-50' : 'bg-gray-50'}`}>
                <AlertTriangle className={`h-4 w-4 ${achterstalligBedrag > 0 ? 'text-red-500' : 'text-gray-400'}`} />
              </div>
              {achterstalligeFacturen.length > 0 ? (
                <span className="text-[10px] font-medium text-red-500 uppercase tracking-wider">{achterstalligeFacturen.length} vervallen</span>
              ) : (
                <span className="text-[10px] font-medium text-gray-400 uppercase tracking-wider">Geen</span>
              )}
            </div>
            <p className={`text-lg sm:text-2xl font-bold tracking-tight ${achterstalligBedrag > 0 ? 'text-red-600' : 'text-gray-900'}`}>
              {formatCurrency(achterstalligBedrag)}
            </p>
            <p className="text-xs text-gray-400 mt-1">Achterstallig</p>
          </div>
        </Link>
      </div>

      {/* Omzetdoelen - mobiel (boven secties) */}
      <div className="lg:hidden">
        {omzetdoelenWidget}
      </div>

      {/* Main content */}
      <div className="flex gap-6 items-start">
        {/* Secties */}
        <div className="flex-1 min-w-0 space-y-3">

          {/* 1. Geaccepteerde offertes */}
          <div id="geaccepteerd" className="scroll-mt-20">
            <Section title="Geaccepteerde offertes" icon={CheckSquare} iconColor="bg-emerald-50 text-[#00a66e]" count={data.geaccepteerdeOffertes.length} linkHref="/offertes" linkLabel="Alle offertes" accentColor="bg-emerald-100 text-emerald-700">
              {/* Desktop tabel */}
              <table className="w-full hidden md:table">
                <thead>
                  <tr className="bg-gray-50/70">
                    <th className="text-left text-[11px] font-medium text-gray-400 uppercase tracking-wider px-5 py-2">Klant</th>
                    <th className="text-left text-[11px] font-medium text-gray-400 uppercase tracking-wider px-3 py-2">Offerte</th>
                    <th className="text-right text-[11px] font-medium text-gray-400 uppercase tracking-wider px-3 py-2">Bedrag</th>
                    <th className="text-left text-[11px] font-medium text-gray-400 uppercase tracking-wider px-3 py-2">Datum</th>
                    <th className="text-right text-[11px] font-medium text-gray-400 uppercase tracking-wider px-5 py-2"></th>
                  </tr>
                </thead>
                <tbody>
                  {data.geaccepteerdeOffertes.map(o => (
                    <tr key={o.id} className="border-t border-gray-50 hover:bg-emerald-50/30 transition-colors">
                      <td className="px-5 py-3 text-sm font-medium text-gray-900">{o.relatie_bedrijfsnaam}</td>
                      <td className="px-3 py-3"><Link href={`/offertes/${o.id}`} className="text-sm text-[#00a66e] hover:underline font-medium">{o.offertenummer}</Link></td>
                      <td className="px-3 py-3 text-sm text-right font-semibold text-gray-900">{formatCurrency(o.totaal)}</td>
                      <td className="px-3 py-3 text-sm text-gray-400">{formatDateShort(o.datum)}</td>
                      <td className="px-5 py-3 text-right">
                        <Button size="sm" className="h-7 text-xs bg-[#00a66e] hover:bg-[#008f5f] shadow-sm" onClick={() => setFactuurDialogOfferte({ id: o.id, totaal: o.totaal })} disabled={factuurLoading === o.id}>
                          {factuurLoading === o.id ? 'Bezig...' : 'Factuur maken'}
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {/* Mobiele cards */}
              <div className="md:hidden divide-y divide-gray-50">
                {data.geaccepteerdeOffertes.map(o => (
                  <div key={o.id} className="px-4 py-3 space-y-2">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-gray-900 truncate">{o.relatie_bedrijfsnaam}</p>
                        <Link href={`/offertes/${o.id}`} className="text-xs text-[#00a66e] font-medium">{o.offertenummer}</Link>
                        <span className="text-xs text-gray-400 ml-2">{formatDateShort(o.datum)}</span>
                      </div>
                      <p className="text-sm font-semibold text-gray-900 shrink-0">{formatCurrency(o.totaal)}</p>
                    </div>
                    <Button size="sm" className="w-full h-8 text-xs bg-[#00a66e] hover:bg-[#008f5f]" onClick={() => setFactuurDialogOfferte({ id: o.id, totaal: o.totaal })} disabled={factuurLoading === o.id}>
                      {factuurLoading === o.id ? 'Bezig...' : 'Factuur maken'}
                    </Button>
                  </div>
                ))}
              </div>
            </Section>
          </div>

          {/* 2. Openstaande facturen */}
          <div id="facturen" className="scroll-mt-20">
            <Section title="Openstaande facturen" icon={Receipt} iconColor="bg-blue-50 text-blue-600" count={data.openstaandeFacturen.length} linkHref="/facturatie" linkLabel="Alle facturen" accentColor="bg-blue-100 text-blue-700">
              <table className="w-full hidden md:table">
                <thead>
                  <tr className="bg-gray-50/70">
                    <th className="text-left text-[11px] font-medium text-gray-400 uppercase tracking-wider px-5 py-2">Klant</th>
                    <th className="text-left text-[11px] font-medium text-gray-400 uppercase tracking-wider px-3 py-2">Factuur</th>
                    <th className="text-left text-[11px] font-medium text-gray-400 uppercase tracking-wider px-3 py-2">Type</th>
                    <th className="text-right text-[11px] font-medium text-gray-400 uppercase tracking-wider px-3 py-2">Openstaand</th>
                    <th className="text-center text-[11px] font-medium text-gray-400 uppercase tracking-wider px-3 py-2">Verloop</th>
                    <th className="text-left text-[11px] font-medium text-gray-400 uppercase tracking-wider px-5 py-2">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {data.openstaandeFacturen.map(f => {
                    const isVervallen = f.vervaldatum && new Date(f.vervaldatum) < new Date()
                    const dagen = f.vervaldatum ? Math.abs(dagenVerschil(f.vervaldatum)) : null
                    const typeLabel = f.factuur_type === 'aanbetaling' ? 'Aanbetaling' : f.factuur_type === 'restbetaling' ? 'Restbetaling' : f.factuur_type === 'volledig' ? 'Volledig' : '-'
                    const typeColor = f.factuur_type === 'aanbetaling' ? 'text-blue-600 bg-blue-50' : f.factuur_type === 'restbetaling' ? 'text-orange-600 bg-orange-50' : 'text-gray-600 bg-gray-50'
                    return (
                      <tr key={f.id} className={`border-t border-gray-50 hover:bg-gray-50/50 transition-colors ${isVervallen ? 'bg-red-50/20' : ''}`}>
                        <td className="px-5 py-3 text-sm font-medium text-gray-900">{f.relatie_bedrijfsnaam}</td>
                        <td className="px-3 py-3"><Link href={`/facturatie/${f.id}`} className="text-sm text-[#00a66e] hover:underline font-medium">{f.factuurnummer}</Link></td>
                        <td className="px-3 py-3"><span className={`inline-flex px-2 py-0.5 rounded text-[10px] font-semibold ${typeColor}`}>{typeLabel}</span></td>
                        <td className={`px-3 py-3 text-sm text-right font-semibold ${isVervallen ? 'text-red-600' : 'text-gray-900'}`}>{formatCurrency(f.openstaand_bedrag)}</td>
                        <td className="px-3 py-3 text-center">{dagen !== null && <DagenPill dagen={dagen} isOver={!!isVervallen} />}</td>
                        <td className="px-5 py-3"><Badge status={f.status} /></td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
              <div className="md:hidden divide-y divide-gray-50">
                {data.openstaandeFacturen.map(f => {
                  const isVervallen = f.vervaldatum && new Date(f.vervaldatum) < new Date()
                  const dagen = f.vervaldatum ? Math.abs(dagenVerschil(f.vervaldatum)) : null
                  const typeLabel = f.factuur_type === 'aanbetaling' ? 'Aanbetaling' : f.factuur_type === 'restbetaling' ? 'Restbetaling' : f.factuur_type === 'volledig' ? 'Volledig' : ''
                  const typeColor = f.factuur_type === 'aanbetaling' ? 'text-blue-600 bg-blue-50' : f.factuur_type === 'restbetaling' ? 'text-orange-600 bg-orange-50' : 'text-gray-600 bg-gray-50'
                  return (
                    <Link key={f.id} href={`/facturatie/${f.id}`} className={`block px-4 py-3 ${isVervallen ? 'bg-red-50/20' : ''}`}>
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <p className="text-sm font-medium text-gray-900 truncate">{f.relatie_bedrijfsnaam}</p>
                          <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                            <span className="text-xs text-[#00a66e] font-medium">{f.factuurnummer}</span>
                            {typeLabel && <span className={`inline-flex px-1.5 py-0.5 rounded text-[10px] font-semibold ${typeColor}`}>{typeLabel}</span>}
                            <Badge status={f.status} />
                            {dagen !== null && <DagenPill dagen={dagen} isOver={!!isVervallen} />}
                          </div>
                        </div>
                        <p className={`text-sm font-semibold shrink-0 ${isVervallen ? 'text-red-600' : 'text-gray-900'}`}>{formatCurrency(f.openstaand_bedrag)}</p>
                      </div>
                    </Link>
                  )
                })}
              </div>
            </Section>
          </div>

          {/* 3. Moet besteld worden */}
          <div id="bestellen" className="scroll-mt-20">
            <Section title="Moet besteld worden" icon={ShoppingCart} iconColor="bg-orange-50 text-orange-600" count={data.moetBesteldOrders.length} linkHref="/orders" linkLabel="Alle orders" accentColor="bg-orange-100 text-orange-700">
              <table className="w-full hidden md:table">
                <thead>
                  <tr className="bg-gray-50/70">
                    <th className="text-left text-[11px] font-medium text-gray-400 uppercase tracking-wider px-5 py-2">Klant</th>
                    <th className="text-left text-[11px] font-medium text-gray-400 uppercase tracking-wider px-3 py-2">Order</th>
                    <th className="text-right text-[11px] font-medium text-gray-400 uppercase tracking-wider px-3 py-2">Bedrag</th>
                    <th className="text-left text-[11px] font-medium text-gray-400 uppercase tracking-wider px-3 py-2">Datum</th>
                    <th className="text-right text-[11px] font-medium text-gray-400 uppercase tracking-wider px-5 py-2"></th>
                  </tr>
                </thead>
                <tbody>
                  {data.moetBesteldOrders.map(o => (
                    <tr key={o.id} className="border-t border-gray-50 hover:bg-orange-50/20 transition-colors">
                      <td className="px-5 py-3 text-sm font-medium text-gray-900">{o.relatie_bedrijfsnaam}</td>
                      <td className="px-3 py-3"><Link href={`/orders/${o.id}`} className="text-sm text-[#00a66e] hover:underline font-medium">{o.ordernummer}</Link></td>
                      <td className="px-3 py-3 text-sm text-right font-semibold text-gray-900">{formatCurrency(o.totaal)}</td>
                      <td className="px-3 py-3 text-sm text-gray-400">{formatDateShort(o.datum)}</td>
                      <td className="px-5 py-3 text-right">
                        <Button size="sm" variant="secondary" className="h-7 text-xs" onClick={async () => { setBesteldLoading(o.id); await markOrderBesteld(o.id); setBesteldLoading(null); router.refresh() }} disabled={besteldLoading === o.id}>
                          {besteldLoading === o.id ? 'Bezig...' : 'Besteld'}
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <div className="md:hidden divide-y divide-gray-50">
                {data.moetBesteldOrders.map(o => (
                  <div key={o.id} className="px-4 py-3 space-y-2">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-gray-900 truncate">{o.relatie_bedrijfsnaam}</p>
                        <Link href={`/orders/${o.id}`} className="text-xs text-[#00a66e] font-medium">{o.ordernummer}</Link>
                        <span className="text-xs text-gray-400 ml-2">{formatDateShort(o.datum)}</span>
                      </div>
                      <p className="text-sm font-semibold text-gray-900 shrink-0">{formatCurrency(o.totaal)}</p>
                    </div>
                    <Button size="sm" variant="secondary" className="w-full h-8 text-xs" onClick={async () => { setBesteldLoading(o.id); await markOrderBesteld(o.id); setBesteldLoading(null); router.refresh() }} disabled={besteldLoading === o.id}>
                      {besteldLoading === o.id ? 'Bezig...' : 'Besteld markeren'}
                    </Button>
                  </div>
                ))}
              </div>
            </Section>
          </div>

          {/* Openstaande verkoopkansen */}
          <div id="verkoopkansen" className="scroll-mt-20">
            <Section title="Openstaande verkoopkansen" icon={FolderKanban} iconColor="bg-purple-50 text-purple-600" count={(data.openVerkoopkansen || []).length} linkHref="/projecten" linkLabel="Alle verkoopkansen" accentColor="bg-purple-100 text-purple-700">
              <table className="w-full hidden md:table">
                <thead>
                  <tr className="bg-gray-50/70">
                    <th className="text-left text-[11px] font-medium text-gray-400 uppercase tracking-wider px-5 py-2">Naam</th>
                    <th className="text-left text-[11px] font-medium text-gray-400 uppercase tracking-wider px-3 py-2">Klant</th>
                    <th className="text-left text-[11px] font-medium text-gray-400 uppercase tracking-wider px-3 py-2">Datum</th>
                    <th className="text-center text-[11px] font-medium text-gray-400 uppercase tracking-wider px-3 py-2">Offerte</th>
                    <th className="text-center text-[11px] font-medium text-gray-400 uppercase tracking-wider px-3 py-2">Emails</th>
                  </tr>
                </thead>
                <tbody>
                  {(data.openVerkoopkansen || []).map(v => (
                    <tr key={v.id} className="border-t border-gray-50 hover:bg-gray-50/50 cursor-pointer transition-colors" onClick={() => router.push(`/projecten/${v.id}`)}>
                      <td className="px-5 py-3 text-sm font-medium text-gray-900">{v.naam}</td>
                      <td className="px-3 py-3 text-sm text-gray-500">{v.relatie_bedrijfsnaam}</td>
                      <td className="px-3 py-3 text-sm text-gray-400">{formatDateShort(v.created_at)}</td>
                      <td className="px-3 py-3 text-center">
                        {v.heeft_offerte ? (
                          <span className="inline-flex items-center text-[10px] font-semibold bg-emerald-100 text-emerald-700 px-1.5 py-0.5 rounded">Offerte</span>
                        ) : (
                          <span className="inline-flex items-center text-[10px] font-semibold bg-amber-100 text-amber-700 px-1.5 py-0.5 rounded">Geen offerte</span>
                        )}
                      </td>
                      <td className="px-3 py-3 text-center">
                        {v.aantal_emails > 0 && (
                          <span className="inline-flex items-center gap-1 text-xs text-gray-500">
                            <Mail className="h-3 w-3" />{v.aantal_emails}
                          </span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <div className="md:hidden divide-y divide-gray-50">
                {(data.openVerkoopkansen || []).map(v => (
                  <Link key={v.id} href={`/projecten/${v.id}`} className="block px-4 py-3 active:bg-gray-50">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-gray-900 truncate">{v.naam}</p>
                        <p className="text-xs text-gray-400">{v.relatie_bedrijfsnaam} · {formatDateShort(v.created_at)}</p>
                      </div>
                      <div className="shrink-0 flex items-center gap-2">
                        {!v.heeft_offerte && (
                          <span className="inline-flex items-center text-[10px] font-semibold bg-amber-100 text-amber-700 px-1.5 py-0.5 rounded">Geen offerte</span>
                        )}
                        {v.aantal_emails > 0 && (
                          <span className="inline-flex items-center gap-1 text-xs text-gray-400">
                            <Mail className="h-3 w-3" />{v.aantal_emails}
                          </span>
                        )}
                      </div>
                    </div>
                  </Link>
                ))}
              </div>
            </Section>
          </div>

          {/* 4. Open offertes */}
          <Section title="Open offertes" icon={FileText} iconColor="bg-sky-50 text-sky-600" count={data.openOffertesList.length} linkHref="/offertes" linkLabel="Alle offertes" accentColor="bg-sky-100 text-sky-700">
            <table className="w-full hidden md:table">
              <thead>
                <tr className="bg-gray-50/70">
                  <th className="text-left text-[11px] font-medium text-gray-400 uppercase tracking-wider px-5 py-2">Klant</th>
                  <th className="text-left text-[11px] font-medium text-gray-400 uppercase tracking-wider px-3 py-2">Offerte</th>
                  <th className="text-right text-[11px] font-medium text-gray-400 uppercase tracking-wider px-3 py-2">Bedrag</th>
                  <th className="text-center text-[11px] font-medium text-gray-400 uppercase tracking-wider px-3 py-2">Open</th>
                  <th className="text-right text-[11px] font-medium text-gray-400 uppercase tracking-wider px-5 py-2"></th>
                </tr>
              </thead>
              <tbody>
                {data.openOffertesList.map(o => (
                  <tr key={o.id} className="border-t border-gray-50 hover:bg-gray-50/50 transition-colors">
                    <td className="px-5 py-3 text-sm font-medium text-gray-900">{o.relatie_bedrijfsnaam}</td>
                    <td className="px-3 py-3">
                      <Link href={`/offertes/${o.id}`} className="text-sm text-[#00a66e] hover:underline font-medium">{o.offertenummer}</Link>
                      {o.project_naam && <span className="text-[11px] text-gray-400 ml-1.5">{o.project_naam}</span>}
                    </td>
                    <td className="px-3 py-3 text-sm text-right font-semibold text-gray-900">{formatCurrency(o.totaal)}</td>
                    <td className="px-3 py-3 text-center">
                      <DagenPill dagen={o.dagen_open} isOver={false} />
                    </td>
                    <td className="px-5 py-3 text-right">
                      <Link href={`/offertes/${o.id}`}><Button size="sm" variant="ghost" className="h-7 text-xs text-[#00a66e] hover:bg-emerald-50">Opvolgen</Button></Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <div className="md:hidden divide-y divide-gray-50">
              {data.openOffertesList.map(o => (
                <Link key={o.id} href={`/offertes/${o.id}`} className="block px-4 py-3">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-gray-900 truncate">{o.relatie_bedrijfsnaam}</p>
                      <div className="flex items-center gap-2 mt-0.5">
                        <span className="text-xs text-[#00a66e] font-medium">{o.offertenummer}</span>
                        <DagenPill dagen={o.dagen_open} isOver={false} />
                      </div>
                    </div>
                    <p className="text-sm font-semibold text-gray-900 shrink-0">{formatCurrency(o.totaal)}</p>
                  </div>
                </Link>
              ))}
            </div>
          </Section>

          {/* 5. Geplande leveringen */}
          <Section title="Geplande leveringen" icon={Truck} iconColor="bg-indigo-50 text-indigo-600" count={data.geplandeLeveringen.length} linkHref="/orders" linkLabel="Alle orders" accentColor="bg-indigo-100 text-indigo-700">
            <table className="w-full hidden md:table">
              <thead>
                <tr className="bg-gray-50/70">
                  <th className="text-left text-[11px] font-medium text-gray-400 uppercase tracking-wider px-5 py-2">Klant</th>
                  <th className="text-left text-[11px] font-medium text-gray-400 uppercase tracking-wider px-3 py-2">Order</th>
                  <th className="text-left text-[11px] font-medium text-gray-400 uppercase tracking-wider px-3 py-2">Leverdatum</th>
                  <th className="text-center text-[11px] font-medium text-gray-400 uppercase tracking-wider px-3 py-2">Dagen</th>
                  <th className="text-left text-[11px] font-medium text-gray-400 uppercase tracking-wider px-3 py-2">Restbetaling</th>
                  <th className="text-left text-[11px] font-medium text-gray-400 uppercase tracking-wider px-5 py-2">Status</th>
                </tr>
              </thead>
              <tbody>
                {data.geplandeLeveringen.map(l => {
                  const dagen = dagenVerschil(l.leverdatum)
                  return (
                    <tr key={l.id} className="border-t border-gray-50 hover:bg-gray-50/50 transition-colors">
                      <td className="px-5 py-3 text-sm font-medium text-gray-900">{l.relatie_bedrijfsnaam}</td>
                      <td className="px-3 py-3"><Link href={`/orders/${l.id}`} className="text-sm text-[#00a66e] hover:underline font-medium">{l.ordernummer}</Link></td>
                      <td className="px-3 py-3 text-sm text-gray-600">{formatDateShort(l.leverdatum)}</td>
                      <td className="px-3 py-3 text-center"><DagenPill dagen={Math.abs(dagen)} isOver={dagen < 0} /></td>
                      <td className="px-3 py-3">
                        {l.restbetaling ? (
                          <Link href={`/facturatie/${l.restbetaling.id}`} className="inline-flex items-center gap-1.5 group">
                            <span className={`inline-flex px-2 py-0.5 rounded text-[10px] font-semibold ${
                              l.restbetaling.status === 'concept' ? 'bg-gray-100 text-gray-600' :
                              l.restbetaling.status === 'verzonden' ? 'bg-orange-50 text-orange-600' :
                              l.restbetaling.status === 'betaald' ? 'bg-green-50 text-green-600' :
                              'bg-red-50 text-red-600'
                            }`}>
                              {l.restbetaling.status === 'concept' ? 'Nog versturen' : l.restbetaling.status === 'verzonden' ? 'Verzonden' : l.restbetaling.status === 'betaald' ? 'Betaald' : 'Vervallen'}
                            </span>
                            <span className="text-xs text-gray-400 group-hover:text-[#00a66e]">{formatCurrency(l.restbetaling.totaal)}</span>
                          </Link>
                        ) : (
                          <span className="text-xs text-gray-300">-</span>
                        )}
                      </td>
                      <td className="px-5 py-3"><Badge status={l.status} /></td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
            <div className="md:hidden divide-y divide-gray-50">
              {data.geplandeLeveringen.map(l => {
                const dagen = dagenVerschil(l.leverdatum)
                return (
                  <Link key={l.id} href={`/orders/${l.id}`} className="block px-4 py-3">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-gray-900 truncate">{l.relatie_bedrijfsnaam}</p>
                        <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                          <span className="text-xs text-[#00a66e] font-medium">{l.ordernummer}</span>
                          <span className="text-xs text-gray-400">{formatDateShort(l.leverdatum)}</span>
                          <DagenPill dagen={Math.abs(dagen)} isOver={dagen < 0} />
                        </div>
                        {l.restbetaling && (
                          <div className="flex items-center gap-1.5 mt-1">
                            <span className={`inline-flex px-1.5 py-0.5 rounded text-[10px] font-semibold ${
                              l.restbetaling.status === 'concept' ? 'bg-gray-100 text-gray-600' :
                              l.restbetaling.status === 'verzonden' ? 'bg-orange-50 text-orange-600' :
                              l.restbetaling.status === 'betaald' ? 'bg-green-50 text-green-600' :
                              'bg-red-50 text-red-600'
                            }`}>
                              Rest: {l.restbetaling.status === 'concept' ? 'Nog versturen' : l.restbetaling.status}
                            </span>
                            <span className="text-xs text-gray-400">{formatCurrency(l.restbetaling.totaal)}</span>
                          </div>
                        )}
                      </div>
                      <Badge status={l.status} />
                    </div>
                  </Link>
                )
              })}
            </div>
          </Section>

          {/* 6. Te plannen leveringen */}
          {data.tePlannenOrders.length > 0 && (
            <Section title="Te plannen leveringen" icon={Calendar} iconColor="bg-teal-50 text-teal-600" count={data.tePlannenOrders.length} linkHref="/orders" linkLabel="Alle orders" accentColor="bg-teal-100 text-teal-700">
              <table className="w-full hidden md:table">
                <thead>
                  <tr className="bg-gray-50/70">
                    <th className="text-left text-[11px] font-medium text-gray-400 uppercase tracking-wider px-5 py-2">Klant</th>
                    <th className="text-left text-[11px] font-medium text-gray-400 uppercase tracking-wider px-3 py-2">Order</th>
                    <th className="text-right text-[11px] font-medium text-gray-400 uppercase tracking-wider px-3 py-2">Bedrag</th>
                    <th className="text-right text-[11px] font-medium text-gray-400 uppercase tracking-wider px-5 py-2"></th>
                  </tr>
                </thead>
                <tbody>
                  {data.tePlannenOrders.map(o => (
                    <tr key={o.id} className="border-t border-gray-50 hover:bg-gray-50/50 transition-colors">
                      <td className="px-5 py-3 text-sm font-medium text-gray-900">{o.relatie_bedrijfsnaam}</td>
                      <td className="px-3 py-3"><Link href={`/orders/${o.id}`} className="text-sm text-[#00a66e] hover:underline font-medium">{o.ordernummer}</Link></td>
                      <td className="px-3 py-3 text-sm text-right font-semibold text-gray-900">{formatCurrency(o.totaal)}</td>
                      <td className="px-5 py-3 text-right">
                        <Button size="sm" variant="secondary" className="h-7 text-xs" onClick={() => setPlanningOrder(o)}>
                          <Truck className="h-3 w-3 mr-1" />Plannen
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <div className="md:hidden divide-y divide-gray-50">
                {data.tePlannenOrders.map(o => (
                  <div key={o.id} className="px-4 py-3 space-y-2">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-gray-900 truncate">{o.relatie_bedrijfsnaam}</p>
                        <Link href={`/orders/${o.id}`} className="text-xs text-[#00a66e] font-medium">{o.ordernummer}</Link>
                      </div>
                      <p className="text-sm font-semibold text-gray-900 shrink-0">{formatCurrency(o.totaal)}</p>
                    </div>
                    <Button size="sm" variant="secondary" className="w-full h-8 text-xs" onClick={() => setPlanningOrder(o)}>
                      <Truck className="h-3 w-3 mr-1" />Levering plannen
                    </Button>
                  </div>
                ))}
              </div>
            </Section>
          )}

          {/* Openstaande taken per collega */}
          {data.takenPerCollega.length > 0 && (
            <TakenPerCollegaSection data={data.takenPerCollega} />
          )}

          {/* 7. Mijn taken */}
          {(() => {
            const toonToegewezen = takenLijst.some(t => t.toegewezen_naam)
            return (
          <Section title="Mijn openstaande taken" icon={CheckSquare} iconColor="bg-amber-50 text-amber-600" count={takenLijst.length} linkHref="/taken" linkLabel="Alle taken" accentColor="bg-amber-100 text-amber-700">
            <table className="w-full hidden md:table">
              <thead>
                <tr className="bg-gray-50/70">
                  <th className="w-10 px-3 py-2"></th>
                  <th className="text-left text-[11px] font-medium text-gray-400 uppercase tracking-wider px-3 py-2">Taak</th>
                  {toonToegewezen && <th className="text-left text-[11px] font-medium text-gray-400 uppercase tracking-wider px-3 py-2">Toegewezen aan</th>}
                  <th className="text-left text-[11px] font-medium text-gray-400 uppercase tracking-wider px-3 py-2">Relatie</th>
                  <th className="text-right text-[11px] font-medium text-gray-400 uppercase tracking-wider px-3 py-2">Bedrag</th>
                  <th className="text-left text-[11px] font-medium text-gray-400 uppercase tracking-wider px-3 py-2">Deadline</th>
                  <th className="text-left text-[11px] font-medium text-gray-400 uppercase tracking-wider px-5 py-2">Prioriteit</th>
                </tr>
              </thead>
              <tbody>
                {takenLijst.map(t => {
                  const deadlineDagen = t.deadline ? dagenVerschil(t.deadline) : null
                  return (
                    <tr key={t.id} className="border-t border-gray-50 hover:bg-gray-50/50 cursor-pointer transition-colors" onClick={() => router.push(`/taken/${t.id}`)}>
                      <td className="px-3 py-3 text-center">
                        <input type="checkbox" className="h-4 w-4 rounded border-gray-300 text-[#00a66e] focus:ring-[#00a66e] cursor-pointer" onClick={(e) => handleCompleteTaak(t.id, e)} readOnly checked={false} />
                      </td>
                      <td className="px-3 py-3 text-sm font-medium text-gray-900">{t.titel}</td>
                      {toonToegewezen && <td className="px-3 py-3 text-sm text-gray-500">{t.toegewezen_naam || '-'}</td>}
                      <td className="px-3 py-3 text-sm text-gray-500">{t.relatie_naam || '-'}</td>
                      <td className="px-3 py-3 text-sm text-right font-medium text-gray-900">{t.bedrag ? formatCurrency(t.bedrag) : '-'}</td>
                      <td className="px-3 py-3">
                        {t.deadline ? (
                          <span className={`inline-flex items-center gap-1 text-sm ${deadlineDagen !== null && deadlineDagen < 0 ? 'text-red-600' : deadlineDagen !== null && deadlineDagen <= 2 ? 'text-amber-600' : 'text-gray-500'}`}>
                            <Clock className="h-3 w-3" />{formatDateShort(t.deadline)}
                          </span>
                        ) : <span className="text-sm text-gray-300">-</span>}
                      </td>
                      <td className="px-5 py-3"><Badge status={t.prioriteit} /></td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
            <div className="md:hidden divide-y divide-gray-50">
              {takenLijst.map(t => {
                const deadlineDagen = t.deadline ? dagenVerschil(t.deadline) : null
                return (
                  <div key={t.id} className="px-4 py-3 cursor-pointer active:bg-gray-50 flex items-start gap-3" onClick={() => router.push(`/taken/${t.id}`)}>
                    <input type="checkbox" className="h-4 w-4 rounded border-gray-300 text-[#00a66e] focus:ring-[#00a66e] cursor-pointer mt-0.5 shrink-0" onClick={(e) => handleCompleteTaak(t.id, e)} readOnly checked={false} />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <p className="text-sm font-medium text-gray-900">{t.titel}</p>
                          {toonToegewezen && t.toegewezen_naam && <p className="text-xs text-gray-400">{t.toegewezen_naam}</p>}
                          {t.relatie_naam && <p className="text-xs text-gray-400">{t.relatie_naam}</p>}
                        </div>
                        <div className="shrink-0 text-right">
                          <Badge status={t.prioriteit} />
                          {t.bedrag && <p className="text-xs font-medium text-gray-900 mt-1">{formatCurrency(t.bedrag)}</p>}
                        </div>
                      </div>
                      {t.deadline && (
                        <p className={`text-xs mt-1 flex items-center gap-1 ${deadlineDagen !== null && deadlineDagen < 0 ? 'text-red-600' : deadlineDagen !== null && deadlineDagen <= 2 ? 'text-amber-600' : 'text-gray-400'}`}>
                          <Clock className="h-3 w-3" />{formatDateShort(t.deadline)}
                        </p>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
          </Section>
            )
          })()}
        </div>

        {/* Zijbalk rechts - alleen desktop */}
        <div className="hidden lg:block w-80 shrink-0 space-y-4 sticky top-6">
          {omzetdoelenWidget}

          {/* Maandelijkse omzet chart */}
          <Link href="/rapportages" className="block bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden hover:shadow-md transition-shadow">
            <div className="px-5 py-3.5 border-b border-gray-100 flex items-center justify-between">
              <h3 className="text-sm font-semibold text-gray-900">Omzet per maand</h3>
              <ArrowRight className="h-3.5 w-3.5 text-gray-300" />
            </div>
            <div className="p-5">
              {data.gefactureerdPerMaand.length === 0 ? (
                <p className="text-xs text-gray-400 text-center py-6">Geen data</p>
              ) : (() => {
                const maxVal = Math.max(...data.gefactureerdPerMaand.map(m => m.bedrag), 1)
                return (
                  <div className="flex items-end gap-1.5 h-44">
                    {data.gefactureerdPerMaand.map((d, i) => {
                      const pct = (d.bedrag / maxVal) * 100
                      const isLast = i === data.gefactureerdPerMaand.length - 1
                      return (
                        <div key={i} className="flex-1 flex flex-col items-center gap-1 min-w-0 group">
                          <div className="w-full flex flex-col items-center justify-end h-36">
                            <span className="text-[9px] text-gray-500 mb-1 truncate max-w-full opacity-0 group-hover:opacity-100 transition-opacity font-medium">
                              {d.bedrag >= 1000 ? `${(d.bedrag / 1000).toFixed(0)}K` : formatCurrency(d.bedrag)}
                            </span>
                            <div
                              className={`w-full max-w-[28px] rounded-t-md transition-all ${isLast ? 'bg-[#00a66e]' : 'bg-[#00a66e]/30 group-hover:bg-[#00a66e]/50'}`}
                              style={{ height: `${Math.max(pct, d.bedrag > 0 ? 4 : 0)}%` }}
                            />
                          </div>
                          <span className={`text-[10px] truncate max-w-full ${isLast ? 'text-gray-900 font-semibold' : 'text-gray-400'}`}>{d.maand}</span>
                        </div>
                      )
                    })}
                  </div>
                )
              })()}
            </div>
          </Link>

          {/* Snel overzicht */}
          <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
            <div className="px-5 py-3.5 border-b border-gray-100">
              <h3 className="text-sm font-semibold text-gray-900">Snel overzicht</h3>
            </div>
            <div className="p-2">
              <Link href="/offertes" className="flex items-center justify-between px-3 py-2.5 rounded-lg hover:bg-gray-50 transition-colors">
                <div className="flex items-center gap-2.5"><FileText className="h-4 w-4 text-sky-500" /><span className="text-sm text-gray-700">Open offertes</span></div>
                <span className="text-sm font-semibold text-gray-900">{data.openOffertes}</span>
              </Link>
              <Link href="/taken" className="flex items-center justify-between px-3 py-2.5 rounded-lg hover:bg-gray-50 transition-colors">
                <div className="flex items-center gap-2.5"><CheckSquare className="h-4 w-4 text-amber-500" /><span className="text-sm text-gray-700">Open taken</span></div>
                <span className="text-sm font-semibold text-gray-900">{data.openTaken}</span>
              </Link>
              <Link href="/relatiebeheer" className="flex items-center justify-between px-3 py-2.5 rounded-lg hover:bg-gray-50 transition-colors">
                <div className="flex items-center gap-2.5"><Users className="h-4 w-4 text-violet-500" /><span className="text-sm text-gray-700">Klanten</span></div>
                <span className="text-sm font-semibold text-gray-900">{data.organisaties.totaal}</span>
              </Link>
              <Link href="/orders" className="flex items-center justify-between px-3 py-2.5 rounded-lg hover:bg-gray-50 transition-colors">
                <div className="flex items-center gap-2.5"><Package className="h-4 w-4 text-indigo-500" /><span className="text-sm text-gray-700">Leveringen</span></div>
                <span className="text-sm font-semibold text-gray-900">{data.geplandeLeveringen.length}</span>
              </Link>
            </div>
          </div>

          {/* Top klanten */}
          {data.topKlanten.length > 0 && (
            <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
              <div className="px-5 py-3.5 border-b border-gray-100 flex items-center justify-between">
                <h3 className="text-sm font-semibold text-gray-900">Top klanten</h3>
                <Link href="/relatiebeheer" className="text-[11px] font-medium text-[#00a66e] hover:underline">Alle klanten</Link>
              </div>
              <div className="divide-y divide-gray-50">
                {data.topKlanten.slice(0, 8).map((k, i) => (
                  <Link key={k.relatie_id} href={`/relatiebeheer/${k.relatie_id}`} className="flex items-center gap-3 px-5 py-2.5 hover:bg-gray-50 transition-colors">
                    <span className="text-[10px] font-bold text-gray-300 w-4 text-right">{i + 1}</span>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm text-gray-900 truncate">{k.bedrijfsnaam}</p>
                    </div>
                    <div className="text-right shrink-0">
                      <p className="text-xs font-semibold text-gray-900">{formatCurrency(k.betaald)}</p>
                      {k.offerte_waarde > 0 && <p className="text-[10px] text-gray-400">{formatCurrency(k.offerte_waarde)} geoffreerd</p>}
                    </div>
                  </Link>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Delivery planning dialog */}
      {planningOrder && (
        <DeliveryPlanningDialog open={!!planningOrder} onClose={() => setPlanningOrder(null)} order={planningOrder} />
      )}

      {/* Factuur conversie dialog */}
      {factuurDialogOfferte && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
          <div className="bg-white rounded-2xl p-5 sm:p-6 max-w-md w-full shadow-2xl border border-gray-100 max-h-[90vh] overflow-y-auto">
            <h3 className="text-lg font-semibold mb-1">Offerte factureren</h3>
            <p className="text-sm text-gray-500 mb-5">Hoe wilt u deze offerte factureren?</p>
            <div className="space-y-3">
              <button onClick={() => handleConvertToFactuur(factuurDialogOfferte.id, 'volledig')} disabled={!!factuurLoading} className="w-full text-left p-4 rounded-xl border-2 border-gray-200 hover:border-[#00a66e] hover:bg-emerald-50/30 transition-all active:scale-[0.99]">
                <p className="font-medium text-gray-900">100% factureren</p>
                <p className="text-sm text-gray-500 mt-0.5">{formatCurrency(factuurDialogOfferte.totaal)}</p>
              </button>
              <button onClick={() => handleConvertToFactuur(factuurDialogOfferte.id, 'split', 70)} disabled={!!factuurLoading} className="w-full text-left p-4 rounded-xl border-2 border-gray-200 hover:border-[#00a66e] hover:bg-emerald-50/30 transition-all active:scale-[0.99]">
                <p className="font-medium text-gray-900">70% / 30% splitsen</p>
                <p className="text-sm text-gray-500 mt-0.5">{formatCurrency(factuurDialogOfferte.totaal * 0.7)} + {formatCurrency(factuurDialogOfferte.totaal * 0.3)}</p>
              </button>
              <div className="p-4 rounded-xl border-2 border-gray-200">
                <p className="font-medium text-gray-900 mb-3">Eigen percentage</p>
                <div className="flex items-center gap-3">
                  <div className="flex items-center gap-2 flex-1">
                    <input type="number" min="1" max="99" value={customSplitPercentage} onChange={(e) => setCustomSplitPercentage(Math.min(99, Math.max(1, parseInt(e.target.value) || 50)))} className="w-20 px-3 py-2 border border-gray-200 rounded-lg text-sm text-right focus:outline-none focus:ring-2 focus:ring-[#00a66e] focus:border-transparent" />
                    <span className="text-sm text-gray-500">/ {100 - customSplitPercentage}%</span>
                  </div>
                  <Button size="sm" className="bg-[#00a66e] hover:bg-[#008f5f]" onClick={() => handleConvertToFactuur(factuurDialogOfferte.id, 'split', customSplitPercentage)} disabled={!!factuurLoading}>OK</Button>
                </div>
              </div>
            </div>
            <div className="flex justify-end mt-4"><Button variant="ghost" onClick={() => setFactuurDialogOfferte(null)}>Annuleren</Button></div>
          </div>
        </div>
      )}

      {/* Omzetdoelen edit dialog */}
      {showDoelenEdit && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
          <div className="bg-white rounded-2xl p-5 sm:p-6 max-w-md w-full shadow-2xl border border-gray-100">
            <h3 className="text-lg font-semibold mb-4">Omzetdoelen {new Date().getFullYear()}</h3>
            <div className="space-y-4">
              {[{ key: 'week_doel', label: 'Weekdoel' }, { key: 'maand_doel', label: 'Maanddoel' }, { key: 'jaar_doel', label: 'Jaardoel' }].map(field => (
                <div key={field.key}>
                  <label className="block text-sm font-medium text-gray-700 mb-1">{field.label}</label>
                  <input type="number" value={doelenForm[field.key as keyof typeof doelenForm]} onChange={(e) => setDoelenForm(f => ({ ...f, [field.key]: e.target.value }))} className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#00a66e] focus:border-transparent" placeholder="0" />
                </div>
              ))}
            </div>
            <div className="flex justify-end gap-2 mt-6">
              <Button variant="ghost" onClick={() => setShowDoelenEdit(false)}>Annuleren</Button>
              <Button className="bg-[#00a66e] hover:bg-[#008f5f]" onClick={handleSaveDoelen} disabled={doelenSaving}>{doelenSaving ? 'Opslaan...' : 'Opslaan'}</Button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
