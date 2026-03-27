'use client'

import { useState } from 'react'
import Link from 'next/link'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { formatCurrency } from '@/lib/utils'
import { FileText, Truck, Package, Receipt, Target, ChevronDown, ChevronUp, Pencil, AlertTriangle, ArrowRight, DollarSign, TrendingUp, CheckSquare, Bell, ShoppingCart, Clock, Calendar, Users } from 'lucide-react'
import { format } from 'date-fns'
import { nl } from 'date-fns/locale'
import { useRouter } from 'next/navigation'
import { convertToFactuur, saveOmzetdoelen, markOrderBesteld } from '@/lib/actions'
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

// Collapsible section with icon, count badge, and subtle colored left border
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
  const [open, setOpen] = useState(defaultOpen ?? count > 0)

  return (
    <div className={`rounded-xl bg-white overflow-hidden shadow-sm border border-gray-100 ${!open ? 'hover:shadow-md transition-shadow' : ''}`}>
      <button
        onClick={() => setOpen(!open)}
        className="w-full px-5 py-3.5 flex items-center justify-between hover:bg-gray-50/50 transition-colors"
      >
        <div className="flex items-center gap-3">
          <div className={`h-8 w-8 rounded-lg flex items-center justify-center ${iconColor}`}>
            <Icon className="h-4 w-4" />
          </div>
          <div className="text-left">
            <h2 className="text-sm font-semibold text-gray-900">{title}</h2>
            {count === 0 && !open && <p className="text-[11px] text-gray-400">Geen items</p>}
          </div>
          {count > 0 && (
            <span className={`inline-flex items-center justify-center h-5 min-w-[20px] px-1.5 rounded-full text-[11px] font-bold ${accentColor || 'bg-gray-100 text-gray-600'}`}>
              {count}
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          {linkHref && open && (
            <Link
              href={linkHref}
              onClick={(e) => e.stopPropagation()}
              className="text-xs font-medium text-[#00a66e] hover:underline flex items-center gap-1 mr-1"
            >
              {linkLabel || 'Bekijk alle'} <ArrowRight className="h-3 w-3" />
            </Link>
          )}
          {open ? <ChevronUp className="h-4 w-4 text-gray-300" /> : <ChevronDown className="h-4 w-4 text-gray-300" />}
        </div>
      </button>
      {open && count > 0 && <div className="border-t border-gray-100">{children}</div>}
      {open && count === 0 && (
        <div className="border-t border-gray-100 px-5 py-8 text-center">
          <Icon className="h-6 w-6 text-gray-200 mx-auto mb-2" />
          <p className="text-sm text-gray-400">Geen items</p>
        </div>
      )}
    </div>
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
    notifications.push({
      label: `geaccepteerde offerte${data.geaccepteerdeOffertes.length !== 1 ? 's' : ''} — factuur aanmaken`,
      href: '#geaccepteerd',
      count: data.geaccepteerdeOffertes.length,
    })
  }
  if (data.openAanvragen && data.openAanvragen.length > 0) {
    notifications.push({
      label: `nieuwe aanvra${data.openAanvragen.length !== 1 ? 'gen' : 'ag'} binnengekomen`,
      href: '/aanvragen',
      count: data.openAanvragen.length,
    })
  }
  const achterstalligeFacturen = data.openstaandeFacturen.filter(f => f.vervaldatum && new Date(f.vervaldatum) < new Date())
  if (achterstalligeFacturen.length > 0) {
    notifications.push({
      label: `facturen vervallen`,
      href: '#facturen',
      count: achterstalligeFacturen.length,
    })
  }
  if (data.moetBesteldOrders.length > 0) {
    notifications.push({
      label: `orders moeten besteld worden`,
      href: '#bestellen',
      count: data.moetBesteldOrders.length,
    })
  }

  // KPI calculations
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

  return (
    <div className="space-y-6 max-w-[1400px]">
      {/* Header met welkom en datum */}
      <div className="flex items-end justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Dashboard</h1>
          <p className="text-sm text-gray-400 mt-0.5">
            {format(new Date(), "EEEE d MMMM yyyy", { locale: nl })}
          </p>
        </div>
        <Link href="/offertes/nieuw">
          <Button size="sm" className="bg-[#00a66e] hover:bg-[#008f5f] shadow-sm">
            <FileText className="h-3.5 w-3.5 mr-1.5" />
            Nieuwe offerte
          </Button>
        </Link>
      </div>

      {/* Notificatiebalk */}
      {notifications.length > 0 && (
        <div className="bg-amber-50/80 border border-amber-200/60 rounded-xl px-5 py-3 flex items-center gap-4 flex-wrap">
          <div className="flex items-center gap-2 text-amber-700">
            <Bell className="h-4 w-4" />
            <span className="text-sm font-medium">Actie vereist</span>
          </div>
          <div className="h-4 w-px bg-amber-200 hidden sm:block" />
          {notifications.map((n, i) => (
            <Link key={i} href={n.href} className="flex items-center gap-1.5 text-sm text-amber-800 hover:text-amber-950 hover:underline transition-colors">
              <span className="inline-flex items-center justify-center h-5 min-w-[20px] px-1 rounded-full bg-amber-200/70 text-amber-800 text-[11px] font-bold">{n.count}</span>
              {n.label}
            </Link>
          ))}
        </div>
      )}

      {/* KPI rij */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <Link href="/facturatie" className="block group">
          <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-5 group-hover:shadow-md transition-all group-hover:border-gray-200">
            <div className="flex items-center justify-between mb-3">
              <div className="h-9 w-9 rounded-lg bg-emerald-50 flex items-center justify-center">
                <DollarSign className="h-4.5 w-4.5 text-[#00a66e]" />
              </div>
              <span className="text-[10px] font-medium text-gray-400 uppercase tracking-wider">Deze maand</span>
            </div>
            <p className="text-2xl font-bold text-gray-900 tracking-tight">{formatCurrency(data.omzet)}</p>
            <p className="text-xs text-gray-400 mt-1">Omzet</p>
          </div>
        </Link>
        <Link href="#facturen" className="block group">
          <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-5 group-hover:shadow-md transition-all group-hover:border-gray-200">
            <div className="flex items-center justify-between mb-3">
              <div className="h-9 w-9 rounded-lg bg-blue-50 flex items-center justify-center">
                <Receipt className="h-4.5 w-4.5 text-blue-600" />
              </div>
              <span className="text-[10px] font-medium text-gray-400 uppercase tracking-wider">{data.openstaandeFacturen.length} facturen</span>
            </div>
            <p className="text-2xl font-bold text-gray-900 tracking-tight">{formatCurrency(data.openstaand)}</p>
            <p className="text-xs text-gray-400 mt-1">Openstaand</p>
          </div>
        </Link>
        <Link href="/offertes" className="block group">
          <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-5 group-hover:shadow-md transition-all group-hover:border-gray-200">
            <div className="flex items-center justify-between mb-3">
              <div className="h-9 w-9 rounded-lg bg-violet-50 flex items-center justify-center">
                <TrendingUp className="h-4.5 w-4.5 text-violet-600" />
              </div>
              <span className="text-[10px] font-medium text-gray-400 uppercase tracking-wider">{data.totaalOffertes} offertes</span>
            </div>
            <p className="text-2xl font-bold text-gray-900 tracking-tight">{conversieGraad}%</p>
            <p className="text-xs text-gray-400 mt-1">Conversiegraad</p>
          </div>
        </Link>
        <Link href="#facturen" className="block group">
          <div className={`bg-white rounded-xl border shadow-sm p-5 group-hover:shadow-md transition-all group-hover:border-gray-200 ${achterstalligBedrag > 0 ? 'border-red-200/60' : 'border-gray-100'}`}>
            <div className="flex items-center justify-between mb-3">
              <div className={`h-9 w-9 rounded-lg flex items-center justify-center ${achterstalligBedrag > 0 ? 'bg-red-50' : 'bg-gray-50'}`}>
                <AlertTriangle className={`h-4.5 w-4.5 ${achterstalligBedrag > 0 ? 'text-red-500' : 'text-gray-400'}`} />
              </div>
              {achterstalligeFacturen.length > 0 && (
                <span className="text-[10px] font-medium text-red-500 uppercase tracking-wider">{achterstalligeFacturen.length} vervallen</span>
              )}
            </div>
            <p className={`text-2xl font-bold tracking-tight ${achterstalligBedrag > 0 ? 'text-red-600' : 'text-gray-900'}`}>
              {formatCurrency(achterstalligBedrag)}
            </p>
            <p className="text-xs text-gray-400 mt-1">Achterstallig</p>
          </div>
        </Link>
      </div>

      {/* Main content: secties links + zijbalk rechts */}
      <div className="flex gap-6 items-start">
        {/* Secties - full width tabellen */}
        <div className="flex-1 min-w-0 space-y-3">

          {/* 1. Geaccepteerde offertes — te verwerken */}
          <div id="geaccepteerd">
            <Section
              title="Geaccepteerde offertes"
              icon={CheckSquare}
              iconColor="bg-emerald-50 text-[#00a66e]"
              count={data.geaccepteerdeOffertes.length}
              linkHref="/offertes"
              linkLabel="Alle offertes"
              accentColor="bg-emerald-100 text-emerald-700"
            >
              <table className="w-full">
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
                      <td className="px-3 py-3">
                        <Link href={`/offertes/${o.id}`} className="text-sm text-[#00a66e] hover:underline font-medium">
                          {o.offertenummer}
                        </Link>
                      </td>
                      <td className="px-3 py-3 text-sm text-right font-semibold text-gray-900">{formatCurrency(o.totaal)}</td>
                      <td className="px-3 py-3 text-sm text-gray-400">{formatDateShort(o.datum)}</td>
                      <td className="px-5 py-3 text-right">
                        <Button
                          size="sm"
                          className="h-7 text-xs bg-[#00a66e] hover:bg-[#008f5f] shadow-sm"
                          onClick={() => setFactuurDialogOfferte({ id: o.id, totaal: o.totaal })}
                          disabled={factuurLoading === o.id}
                        >
                          {factuurLoading === o.id ? 'Bezig...' : 'Factuur maken'}
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </Section>
          </div>

          {/* 2. Openstaande facturen */}
          <div id="facturen">
            <Section
              title="Openstaande facturen"
              icon={Receipt}
              iconColor="bg-blue-50 text-blue-600"
              count={data.openstaandeFacturen.length}
              linkHref="/facturatie"
              linkLabel="Alle facturen"
              accentColor="bg-blue-100 text-blue-700"
            >
              <table className="w-full">
                <thead>
                  <tr className="bg-gray-50/70">
                    <th className="text-left text-[11px] font-medium text-gray-400 uppercase tracking-wider px-5 py-2">Klant</th>
                    <th className="text-left text-[11px] font-medium text-gray-400 uppercase tracking-wider px-3 py-2">Factuur</th>
                    <th className="text-right text-[11px] font-medium text-gray-400 uppercase tracking-wider px-3 py-2">Openstaand</th>
                    <th className="text-center text-[11px] font-medium text-gray-400 uppercase tracking-wider px-3 py-2">Verloop</th>
                    <th className="text-left text-[11px] font-medium text-gray-400 uppercase tracking-wider px-5 py-2">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {data.openstaandeFacturen.map(f => {
                    const isVervallen = f.vervaldatum && new Date(f.vervaldatum) < new Date()
                    const bijna = f.vervaldatum && !isVervallen && dagenVerschil(f.vervaldatum) <= 7
                    const dagen = f.vervaldatum ? Math.abs(dagenVerschil(f.vervaldatum)) : null
                    return (
                      <tr key={f.id} className={`border-t border-gray-50 hover:bg-gray-50/50 transition-colors ${isVervallen ? 'bg-red-50/20' : ''}`}>
                        <td className="px-5 py-3 text-sm font-medium text-gray-900">{f.relatie_bedrijfsnaam}</td>
                        <td className="px-3 py-3">
                          <Link href={`/facturatie/${f.id}`} className="text-sm text-[#00a66e] hover:underline font-medium">
                            {f.factuurnummer}
                          </Link>
                        </td>
                        <td className={`px-3 py-3 text-sm text-right font-semibold ${isVervallen ? 'text-red-600' : 'text-gray-900'}`}>
                          {formatCurrency(f.openstaand_bedrag)}
                        </td>
                        <td className="px-3 py-3 text-center">
                          {dagen !== null && (
                            <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-medium ${
                              isVervallen ? 'bg-red-100 text-red-700' : bijna ? 'bg-amber-100 text-amber-700' : 'bg-gray-100 text-gray-500'
                            }`}>
                              {isVervallen ? `${dagen}d over` : `${dagen}d`}
                            </span>
                          )}
                        </td>
                        <td className="px-5 py-3">
                          <Badge status={f.status} />
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </Section>
          </div>

          {/* 3. Moet besteld worden */}
          <div id="bestellen">
            <Section
              title="Moet besteld worden"
              icon={ShoppingCart}
              iconColor="bg-orange-50 text-orange-600"
              count={data.moetBesteldOrders.length}
              linkHref="/orders"
              linkLabel="Alle orders"
              accentColor="bg-orange-100 text-orange-700"
            >
              <table className="w-full">
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
                      <td className="px-3 py-3">
                        <Link href={`/orders/${o.id}`} className="text-sm text-[#00a66e] hover:underline font-medium">
                          {o.ordernummer}
                        </Link>
                      </td>
                      <td className="px-3 py-3 text-sm text-right font-semibold text-gray-900">{formatCurrency(o.totaal)}</td>
                      <td className="px-3 py-3 text-sm text-gray-400">{formatDateShort(o.datum)}</td>
                      <td className="px-5 py-3 text-right">
                        <Button
                          size="sm"
                          variant="secondary"
                          className="h-7 text-xs"
                          onClick={async () => {
                            setBesteldLoading(o.id)
                            await markOrderBesteld(o.id)
                            setBesteldLoading(null)
                            router.refresh()
                          }}
                          disabled={besteldLoading === o.id}
                        >
                          {besteldLoading === o.id ? 'Bezig...' : 'Besteld markeren'}
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </Section>
          </div>

          {/* 4. Open offertes */}
          <Section
            title="Open offertes"
            icon={FileText}
            iconColor="bg-sky-50 text-sky-600"
            count={data.openOffertesList.length}
            linkHref="/offertes"
            linkLabel="Alle offertes"
            accentColor="bg-sky-100 text-sky-700"
          >
            <table className="w-full">
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
                      <Link href={`/offertes/${o.id}`} className="text-sm text-[#00a66e] hover:underline font-medium">
                        {o.offertenummer}
                      </Link>
                      {o.project_naam && <span className="text-[11px] text-gray-400 ml-1.5">{o.project_naam}</span>}
                    </td>
                    <td className="px-3 py-3 text-sm text-right font-semibold text-gray-900">{formatCurrency(o.totaal)}</td>
                    <td className="px-3 py-3 text-center">
                      <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-medium ${
                        o.dagen_open > 14 ? 'bg-amber-100 text-amber-700' : o.dagen_open > 7 ? 'bg-gray-100 text-gray-600' : 'bg-emerald-50 text-emerald-600'
                      }`}>
                        {o.dagen_open}d
                      </span>
                    </td>
                    <td className="px-5 py-3 text-right">
                      <Link href={`/offertes/${o.id}`}>
                        <Button size="sm" variant="ghost" className="h-7 text-xs text-[#00a66e] hover:bg-emerald-50">
                          Opvolgen
                        </Button>
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Section>

          {/* 5. Geplande leveringen */}
          <Section
            title="Geplande leveringen"
            icon={Truck}
            iconColor="bg-indigo-50 text-indigo-600"
            count={data.geplandeLeveringen.length}
            linkHref="/orders"
            linkLabel="Alle orders"
            accentColor="bg-indigo-100 text-indigo-700"
          >
            <table className="w-full">
              <thead>
                <tr className="bg-gray-50/70">
                  <th className="text-left text-[11px] font-medium text-gray-400 uppercase tracking-wider px-5 py-2">Klant</th>
                  <th className="text-left text-[11px] font-medium text-gray-400 uppercase tracking-wider px-3 py-2">Order</th>
                  <th className="text-left text-[11px] font-medium text-gray-400 uppercase tracking-wider px-3 py-2">Leverdatum</th>
                  <th className="text-center text-[11px] font-medium text-gray-400 uppercase tracking-wider px-3 py-2">Dagen</th>
                  <th className="text-left text-[11px] font-medium text-gray-400 uppercase tracking-wider px-5 py-2">Status</th>
                </tr>
              </thead>
              <tbody>
                {data.geplandeLeveringen.map(l => {
                  const dagen = dagenVerschil(l.leverdatum)
                  return (
                    <tr key={l.id} className="border-t border-gray-50 hover:bg-gray-50/50 transition-colors">
                      <td className="px-5 py-3 text-sm font-medium text-gray-900">{l.relatie_bedrijfsnaam}</td>
                      <td className="px-3 py-3">
                        <Link href={`/orders/${l.id}`} className="text-sm text-[#00a66e] hover:underline font-medium">
                          {l.ordernummer}
                        </Link>
                      </td>
                      <td className="px-3 py-3 text-sm text-gray-600">{formatDateShort(l.leverdatum)}</td>
                      <td className="px-3 py-3 text-center">
                        <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-medium ${
                          dagen < 0 ? 'bg-red-100 text-red-700' : dagen <= 3 ? 'bg-amber-100 text-amber-700' : 'bg-gray-100 text-gray-500'
                        }`}>
                          {dagen < 0 ? `${Math.abs(dagen)}d over` : `${dagen}d`}
                        </span>
                      </td>
                      <td className="px-5 py-3"><Badge status={l.status} /></td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </Section>

          {/* 6. Te plannen leveringen */}
          {data.tePlannenOrders.length > 0 && (
            <Section
              title="Te plannen leveringen"
              icon={Calendar}
              iconColor="bg-teal-50 text-teal-600"
              count={data.tePlannenOrders.length}
              linkHref="/orders"
              linkLabel="Alle orders"
              accentColor="bg-teal-100 text-teal-700"
            >
              <table className="w-full">
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
                      <td className="px-3 py-3">
                        <Link href={`/orders/${o.id}`} className="text-sm text-[#00a66e] hover:underline font-medium">
                          {o.ordernummer}
                        </Link>
                      </td>
                      <td className="px-3 py-3 text-sm text-right font-semibold text-gray-900">{formatCurrency(o.totaal)}</td>
                      <td className="px-5 py-3 text-right">
                        <Button
                          size="sm"
                          variant="secondary"
                          className="h-7 text-xs"
                          onClick={() => setPlanningOrder(o)}
                        >
                          <Truck className="h-3 w-3 mr-1" />
                          Plannen
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </Section>
          )}

          {/* 7. Mijn taken */}
          <Section
            title="Mijn taken"
            icon={CheckSquare}
            iconColor="bg-amber-50 text-amber-600"
            count={data.mijnTaken.length}
            linkHref="/taken"
            linkLabel="Alle taken"
            accentColor="bg-amber-100 text-amber-700"
          >
            <table className="w-full">
              <thead>
                <tr className="bg-gray-50/70">
                  <th className="text-left text-[11px] font-medium text-gray-400 uppercase tracking-wider px-5 py-2">Taak</th>
                  <th className="text-left text-[11px] font-medium text-gray-400 uppercase tracking-wider px-3 py-2">Deadline</th>
                  <th className="text-left text-[11px] font-medium text-gray-400 uppercase tracking-wider px-5 py-2">Prioriteit</th>
                </tr>
              </thead>
              <tbody>
                {data.mijnTaken.map(t => {
                  const deadlineDagen = t.deadline ? dagenVerschil(t.deadline) : null
                  return (
                    <tr
                      key={t.id}
                      className="border-t border-gray-50 hover:bg-gray-50/50 cursor-pointer transition-colors"
                      onClick={() => router.push(`/taken/${t.id}`)}
                    >
                      <td className="px-5 py-3 text-sm font-medium text-gray-900">{t.titel}</td>
                      <td className="px-3 py-3">
                        {t.deadline ? (
                          <span className={`inline-flex items-center gap-1 text-sm ${
                            deadlineDagen !== null && deadlineDagen < 0 ? 'text-red-600' : deadlineDagen !== null && deadlineDagen <= 2 ? 'text-amber-600' : 'text-gray-500'
                          }`}>
                            <Clock className="h-3 w-3" />
                            {formatDateShort(t.deadline)}
                          </span>
                        ) : (
                          <span className="text-sm text-gray-300">-</span>
                        )}
                      </td>
                      <td className="px-5 py-3">
                        <Badge status={t.prioriteit} />
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </Section>
        </div>

        {/* Zijbalk rechts */}
        <div className="hidden lg:block w-80 shrink-0 space-y-4 sticky top-6">
          {/* Omzetdoelen */}
          <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
            <div className="px-5 py-3.5 border-b border-gray-100 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="h-7 w-7 rounded-lg bg-emerald-50 flex items-center justify-center">
                  <Target className="h-3.5 w-3.5 text-[#00a66e]" />
                </div>
                <h3 className="text-sm font-semibold text-gray-900">Omzetdoelen</h3>
              </div>
              <div className="flex items-center gap-0.5">
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
                <button onClick={() => { setShowDoelenEdit(true); setDoelenForm({ week_doel: doelen.week_doel.toString(), maand_doel: doelen.maand_doel.toString(), jaar_doel: doelen.jaar_doel.toString() }) }} className="p-1.5 text-gray-300 hover:text-gray-500 transition-colors ml-1">
                  <Pencil className="h-3 w-3" />
                </button>
              </div>
            </div>
            <div className="p-5">
              {!doelen.heeft_doelen ? (
                <div className="py-6 text-center">
                  <Target className="h-8 w-8 text-gray-200 mx-auto mb-2" />
                  <p className="text-sm text-gray-400 mb-3">Geen doelen ingesteld</p>
                  <Button size="sm" className="bg-[#00a66e] hover:bg-[#008f5f]" onClick={() => setShowDoelenEdit(true)}>Instellen</Button>
                </div>
              ) : (
                <div className="space-y-4">
                  <div className="text-center">
                    <p className={`text-3xl font-bold tracking-tight ${doelenPercentage >= 100 ? 'text-[#00a66e]' : doelenPercentage >= 80 ? 'text-green-600' : doelenPercentage >= 50 ? 'text-amber-500' : 'text-red-500'}`}>
                      {doelenPercentage}%
                    </p>
                    <p className="text-xs text-gray-400 mt-0.5">{activeDoel.label}doel {new Date().getFullYear()}</p>
                  </div>
                  <div className="w-full bg-gray-100 rounded-full h-2.5 overflow-hidden">
                    <div
                      className={`h-2.5 rounded-full transition-all duration-700 ${doelenBarColor}`}
                      style={{ width: `${Math.min(doelenPercentage, 100)}%` }}
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-4">
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

          {/* Maandelijkse omzet chart */}
          <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
            <div className="px-5 py-3.5 border-b border-gray-100">
              <h3 className="text-sm font-semibold text-gray-900">Omzet per maand</h3>
            </div>
            <div className="p-5">
              {data.gefactureerdPerMaand.length === 0 ? (
                <p className="text-xs text-gray-400 text-center py-6">Geen data</p>
              ) : (() => {
                const maxVal = Math.max(...data.gefactureerdPerMaand.map(m => m.bedrag), 1)
                return (
                  <div className="flex items-end gap-1.5 h-36">
                    {data.gefactureerdPerMaand.map((d, i) => {
                      const pct = (d.bedrag / maxVal) * 100
                      const isLast = i === data.gefactureerdPerMaand.length - 1
                      return (
                        <div key={i} className="flex-1 flex flex-col items-center gap-1 min-w-0 group">
                          <div className="w-full flex flex-col items-center justify-end h-28">
                            <span className="text-[9px] text-gray-400 mb-1 truncate max-w-full opacity-0 group-hover:opacity-100 transition-opacity">
                              {d.bedrag >= 1000 ? `${(d.bedrag / 1000).toFixed(0)}K` : formatCurrency(d.bedrag)}
                            </span>
                            <div
                              className={`w-full max-w-[24px] rounded-t-md transition-all ${isLast ? 'bg-[#00a66e]' : 'bg-[#00a66e]/40'}`}
                              style={{ height: `${Math.max(pct, d.bedrag > 0 ? 4 : 0)}%` }}
                            />
                          </div>
                          <span className={`text-[9px] truncate max-w-full ${isLast ? 'text-gray-900 font-medium' : 'text-gray-400'}`}>{d.maand}</span>
                        </div>
                      )
                    })}
                  </div>
                )
              })()}
            </div>
          </div>

          {/* Snelle overzicht */}
          <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
            <div className="px-5 py-3.5 border-b border-gray-100">
              <h3 className="text-sm font-semibold text-gray-900">Snel overzicht</h3>
            </div>
            <div className="p-2">
              <Link href="/offertes" className="flex items-center justify-between px-3 py-2.5 rounded-lg hover:bg-gray-50 transition-colors">
                <div className="flex items-center gap-2.5">
                  <FileText className="h-4 w-4 text-sky-500" />
                  <span className="text-sm text-gray-700">Open offertes</span>
                </div>
                <span className="text-sm font-semibold text-gray-900">{data.openOffertes}</span>
              </Link>
              <Link href="/taken" className="flex items-center justify-between px-3 py-2.5 rounded-lg hover:bg-gray-50 transition-colors">
                <div className="flex items-center gap-2.5">
                  <CheckSquare className="h-4 w-4 text-amber-500" />
                  <span className="text-sm text-gray-700">Open taken</span>
                </div>
                <span className="text-sm font-semibold text-gray-900">{data.openTaken}</span>
              </Link>
              <Link href="/relatiebeheer" className="flex items-center justify-between px-3 py-2.5 rounded-lg hover:bg-gray-50 transition-colors">
                <div className="flex items-center gap-2.5">
                  <Users className="h-4 w-4 text-violet-500" />
                  <span className="text-sm text-gray-700">Klanten</span>
                </div>
                <span className="text-sm font-semibold text-gray-900">{data.organisaties.totaal}</span>
              </Link>
              <Link href="/orders" className="flex items-center justify-between px-3 py-2.5 rounded-lg hover:bg-gray-50 transition-colors">
                <div className="flex items-center gap-2.5">
                  <Package className="h-4 w-4 text-indigo-500" />
                  <span className="text-sm text-gray-700">Geplande leveringen</span>
                </div>
                <span className="text-sm font-semibold text-gray-900">{data.geplandeLeveringen.length}</span>
              </Link>
            </div>
          </div>
        </div>
      </div>

      {/* Delivery planning dialog */}
      {planningOrder && (
        <DeliveryPlanningDialog
          open={!!planningOrder}
          onClose={() => setPlanningOrder(null)}
          order={planningOrder}
        />
      )}

      {/* Factuur conversie dialog */}
      {factuurDialogOfferte && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm">
          <div className="bg-white rounded-2xl p-6 max-w-md w-full mx-4 shadow-2xl border border-gray-100">
            <h3 className="text-lg font-semibold mb-1">Offerte factureren</h3>
            <p className="text-sm text-gray-500 mb-6">Hoe wilt u deze offerte factureren?</p>
            <div className="space-y-3">
              <button onClick={() => handleConvertToFactuur(factuurDialogOfferte.id, 'volledig')} disabled={!!factuurLoading} className="w-full text-left p-4 rounded-xl border-2 border-gray-200 hover:border-[#00a66e] hover:bg-emerald-50/30 transition-all">
                <p className="font-medium text-gray-900">100% factureren</p>
                <p className="text-sm text-gray-500 mt-0.5">1 factuur voor het volledige bedrag van {formatCurrency(factuurDialogOfferte.totaal)}</p>
              </button>
              <button onClick={() => handleConvertToFactuur(factuurDialogOfferte.id, 'split', 70)} disabled={!!factuurLoading} className="w-full text-left p-4 rounded-xl border-2 border-gray-200 hover:border-[#00a66e] hover:bg-emerald-50/30 transition-all">
                <p className="font-medium text-gray-900">70% / 30% splitsen</p>
                <p className="text-sm text-gray-500 mt-0.5">Aanbetaling: {formatCurrency(factuurDialogOfferte.totaal * 0.7)} &middot; Restbetaling: {formatCurrency(factuurDialogOfferte.totaal * 0.3)}</p>
              </button>
              <div className="p-4 rounded-xl border-2 border-gray-200">
                <p className="font-medium text-gray-900 mb-3">Eigen percentage splitsen</p>
                <div className="flex items-center gap-3">
                  <div className="flex items-center gap-2 flex-1">
                    <input
                      type="number"
                      min="1"
                      max="99"
                      value={customSplitPercentage}
                      onChange={(e) => setCustomSplitPercentage(Math.min(99, Math.max(1, parseInt(e.target.value) || 50)))}
                      className="w-20 px-3 py-2 border border-gray-200 rounded-lg text-sm text-right focus:outline-none focus:ring-2 focus:ring-[#00a66e] focus:border-transparent"
                    />
                    <span className="text-sm text-gray-500">% / {100 - customSplitPercentage}%</span>
                  </div>
                  <Button size="sm" className="bg-[#00a66e] hover:bg-[#008f5f]" onClick={() => handleConvertToFactuur(factuurDialogOfferte.id, 'split', customSplitPercentage)} disabled={!!factuurLoading}>
                    Factureren
                  </Button>
                </div>
                <p className="text-xs text-gray-400 mt-2">
                  Aanbetaling: {formatCurrency(factuurDialogOfferte.totaal * customSplitPercentage / 100)} &middot; Rest: {formatCurrency(factuurDialogOfferte.totaal * (100 - customSplitPercentage) / 100)}
                </p>
              </div>
            </div>
            <div className="flex justify-end mt-5"><Button variant="ghost" onClick={() => setFactuurDialogOfferte(null)}>Annuleren</Button></div>
          </div>
        </div>
      )}

      {/* Omzetdoelen edit dialog */}
      {showDoelenEdit && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm">
          <div className="bg-white rounded-2xl p-6 max-w-md w-full mx-4 shadow-2xl border border-gray-100">
            <h3 className="text-lg font-semibold mb-4">Omzetdoelen {new Date().getFullYear()}</h3>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Weekdoel</label>
                <input
                  type="number"
                  value={doelenForm.week_doel}
                  onChange={(e) => setDoelenForm(f => ({ ...f, week_doel: e.target.value }))}
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#00a66e] focus:border-transparent"
                  placeholder="0"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Maanddoel</label>
                <input
                  type="number"
                  value={doelenForm.maand_doel}
                  onChange={(e) => setDoelenForm(f => ({ ...f, maand_doel: e.target.value }))}
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#00a66e] focus:border-transparent"
                  placeholder="0"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Jaardoel</label>
                <input
                  type="number"
                  value={doelenForm.jaar_doel}
                  onChange={(e) => setDoelenForm(f => ({ ...f, jaar_doel: e.target.value }))}
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#00a66e] focus:border-transparent"
                  placeholder="0"
                />
              </div>
            </div>
            <div className="flex justify-end gap-2 mt-6">
              <Button variant="ghost" onClick={() => setShowDoelenEdit(false)}>Annuleren</Button>
              <Button className="bg-[#00a66e] hover:bg-[#008f5f]" onClick={handleSaveDoelen} disabled={doelenSaving}>
                {doelenSaving ? 'Opslaan...' : 'Opslaan'}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
