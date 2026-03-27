'use client'

import { useState } from 'react'
import Link from 'next/link'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { formatCurrency } from '@/lib/utils'
import { FileText, Clock, Truck, Package, Receipt, Target, ChevronDown, ChevronUp, Pencil, AlertTriangle, CheckCircle, ArrowRight, DollarSign, TrendingUp, CheckSquare, Bell } from 'lucide-react'
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

// Collapsible section component
function Section({ title, count, children, defaultOpen, linkHref, linkLabel }: {
  title: string
  count: number
  children: React.ReactNode
  defaultOpen?: boolean
  linkHref?: string
  linkLabel?: string
}) {
  const [open, setOpen] = useState(defaultOpen ?? count > 0)

  return (
    <div className="border border-gray-200 rounded-xl bg-white overflow-hidden">
      <button
        onClick={() => setOpen(!open)}
        className="w-full px-6 py-4 flex items-center justify-between hover:bg-gray-50/50 transition-colors"
      >
        <div className="flex items-center gap-3">
          <h2 className="text-sm font-semibold text-gray-900">{title}</h2>
          {count > 0 && (
            <span className="inline-flex items-center justify-center px-2 py-0.5 rounded-full bg-gray-100 text-gray-600 text-xs font-bold">
              {count}
            </span>
          )}
        </div>
        <div className="flex items-center gap-3">
          {linkHref && (
            <Link
              href={linkHref}
              onClick={(e) => e.stopPropagation()}
              className="text-xs font-medium text-[#00a66e] hover:underline flex items-center gap-1"
            >
              {linkLabel || 'Bekijk alle'} <ArrowRight className="h-3 w-3" />
            </Link>
          )}
          {open ? <ChevronUp className="h-4 w-4 text-gray-400" /> : <ChevronDown className="h-4 w-4 text-gray-400" />}
        </div>
      </button>
      {open && <div className="border-t border-gray-200">{children}</div>}
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
  const notifications: { label: string; href: string; type: 'warning' | 'success' }[] = []
  if (data.geaccepteerdeOffertes.length > 0) {
    notifications.push({
      label: `${data.geaccepteerdeOffertes.length} geaccepteerde offerte${data.geaccepteerdeOffertes.length !== 1 ? 's' : ''} — factuur aanmaken`,
      href: '#geaccepteerd',
      type: 'warning',
    })
  }
  if (data.openAanvragen && data.openAanvragen.length > 0) {
    notifications.push({
      label: `${data.openAanvragen.length} nieuwe aanvra${data.openAanvragen.length !== 1 ? 'gen' : 'ag'} binnengekomen`,
      href: '/aanvragen',
      type: 'warning',
    })
  }
  const achterstalligeFacturen = data.openstaandeFacturen.filter(f => f.vervaldatum && new Date(f.vervaldatum) < new Date())
  if (achterstalligeFacturen.length > 0) {
    notifications.push({
      label: `${achterstalligeFacturen.length} factuur/facturen vervallen`,
      href: '#facturen',
      type: 'warning',
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

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-gray-900">Dashboard</h1>

      {/* Notificatiebalk */}
      {notifications.length > 0 && (
        <div className="bg-amber-50 border border-amber-200 rounded-xl px-5 py-3 space-y-1">
          {notifications.map((n, i) => (
            <Link key={i} href={n.href} className="flex items-center gap-2 text-sm text-amber-800 hover:underline">
              <Bell className="h-3.5 w-3.5 text-amber-600 shrink-0" />
              {n.label}
            </Link>
          ))}
        </div>
      )}

      {/* KPI rij */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <Link href="/facturatie" className="block">
          <Card className="hover:shadow-md transition-shadow">
            <CardContent className="p-5 flex items-center justify-between">
              <div>
                <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">Omzet deze maand</p>
                <p className="text-2xl font-bold text-gray-900 mt-1">{formatCurrency(data.omzet)}</p>
              </div>
              <div className="h-10 w-10 rounded-full bg-green-50 flex items-center justify-center">
                <DollarSign className="h-5 w-5 text-[#00a66e]" />
              </div>
            </CardContent>
          </Card>
        </Link>
        <Link href="#facturen" className="block">
          <Card className="hover:shadow-md transition-shadow">
            <CardContent className="p-5 flex items-center justify-between">
              <div>
                <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">Openstaand</p>
                <p className="text-2xl font-bold text-gray-900 mt-1">{formatCurrency(data.openstaand)}</p>
                <p className="text-xs text-gray-400 mt-0.5">{data.openstaandeFacturen.length} facturen</p>
              </div>
              <div className="h-10 w-10 rounded-full bg-blue-50 flex items-center justify-center">
                <Receipt className="h-5 w-5 text-blue-600" />
              </div>
            </CardContent>
          </Card>
        </Link>
        <Link href="/offertes" className="block">
          <Card className="hover:shadow-md transition-shadow">
            <CardContent className="p-5 flex items-center justify-between">
              <div>
                <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">Conversiegraad</p>
                <p className="text-2xl font-bold text-gray-900 mt-1">{conversieGraad}%</p>
                <p className="text-xs text-gray-400 mt-0.5">{data.totaalOffertes} offertes totaal</p>
              </div>
              <div className="h-10 w-10 rounded-full bg-purple-50 flex items-center justify-center">
                <TrendingUp className="h-5 w-5 text-purple-600" />
              </div>
            </CardContent>
          </Card>
        </Link>
        <Link href="#facturen" className="block">
          <Card className="hover:shadow-md transition-shadow">
            <CardContent className="p-5 flex items-center justify-between">
              <div>
                <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">Achterstallig</p>
                <p className={`text-2xl font-bold mt-1 ${achterstalligBedrag > 0 ? 'text-red-600' : 'text-gray-900'}`}>
                  {formatCurrency(achterstalligBedrag)}
                </p>
                {achterstalligeFacturen.length > 0 && (
                  <p className="text-xs text-red-500 mt-0.5">{achterstalligeFacturen.length} vervallen</p>
                )}
              </div>
              <div className={`h-10 w-10 rounded-full flex items-center justify-center ${achterstalligBedrag > 0 ? 'bg-red-50' : 'bg-gray-50'}`}>
                <AlertTriangle className={`h-5 w-5 ${achterstalligBedrag > 0 ? 'text-red-500' : 'text-gray-400'}`} />
              </div>
            </CardContent>
          </Card>
        </Link>
      </div>

      {/* Main content: secties links + zijbalk rechts */}
      <div className="flex gap-6 items-start">
        {/* Secties - full width tabellen */}
        <div className="flex-1 min-w-0 space-y-4">

          {/* 1. Geaccepteerde offertes — te verwerken */}
          <div id="geaccepteerd">
            <Section
              title="Geaccepteerde offertes — te verwerken"
              count={data.geaccepteerdeOffertes.length}
              linkHref="/offertes"
              linkLabel="Alle offertes"
            >
              {data.geaccepteerdeOffertes.length === 0 ? (
                <p className="px-6 py-6 text-sm text-gray-400 text-center">Geen geaccepteerde offertes te verwerken</p>
              ) : (
                <table className="w-full">
                  <thead>
                    <tr className="bg-gray-50">
                      <th className="text-left text-xs font-medium text-gray-500 uppercase px-6 py-2.5">Klant</th>
                      <th className="text-left text-xs font-medium text-gray-500 uppercase px-4 py-2.5">Offerte</th>
                      <th className="text-right text-xs font-medium text-gray-500 uppercase px-4 py-2.5">Bedrag</th>
                      <th className="text-left text-xs font-medium text-gray-500 uppercase px-4 py-2.5">Datum</th>
                      <th className="text-right text-xs font-medium text-gray-500 uppercase px-6 py-2.5">Actie</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.geaccepteerdeOffertes.map(o => (
                      <tr key={o.id} className="border-t border-gray-100 hover:bg-gray-50/50">
                        <td className="px-6 py-3 text-sm font-medium text-gray-900">{o.relatie_bedrijfsnaam}</td>
                        <td className="px-4 py-3">
                          <Link href={`/offertes/${o.id}`} className="text-sm text-[#00a66e] hover:underline">
                            {o.offertenummer}
                          </Link>
                        </td>
                        <td className="px-4 py-3 text-sm text-right font-medium">{formatCurrency(o.totaal)}</td>
                        <td className="px-4 py-3 text-sm text-gray-500">{formatDateShort(o.datum)}</td>
                        <td className="px-6 py-3 text-right">
                          <Button
                            size="sm"
                            className="h-7 text-xs bg-[#00a66e] hover:bg-[#008f5f]"
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
              )}
            </Section>
          </div>

          {/* 2. Openstaande facturen */}
          <div id="facturen">
            <Section
              title="Openstaande facturen"
              count={data.openstaandeFacturen.length}
              linkHref="/facturatie"
              linkLabel="Alle facturen"
            >
              {data.openstaandeFacturen.length === 0 ? (
                <p className="px-6 py-6 text-sm text-gray-400 text-center">Geen openstaande facturen</p>
              ) : (
                <table className="w-full">
                  <thead>
                    <tr className="bg-gray-50">
                      <th className="text-left text-xs font-medium text-gray-500 uppercase px-6 py-2.5">Klant</th>
                      <th className="text-left text-xs font-medium text-gray-500 uppercase px-4 py-2.5">Factuur</th>
                      <th className="text-right text-xs font-medium text-gray-500 uppercase px-4 py-2.5">Openstaand</th>
                      <th className="text-center text-xs font-medium text-gray-500 uppercase px-4 py-2.5">Dagen</th>
                      <th className="text-left text-xs font-medium text-gray-500 uppercase px-4 py-2.5">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.openstaandeFacturen.map(f => {
                      const isVervallen = f.vervaldatum && new Date(f.vervaldatum) < new Date()
                      const bijna = f.vervaldatum && !isVervallen && dagenVerschil(f.vervaldatum) <= 7
                      const dagen = f.vervaldatum ? Math.abs(dagenVerschil(f.vervaldatum)) : null
                      return (
                        <tr key={f.id} className={`border-t border-gray-100 hover:bg-gray-50/50 ${isVervallen ? 'bg-red-50/30' : ''}`}>
                          <td className="px-6 py-3 text-sm font-medium text-gray-900">{f.relatie_bedrijfsnaam}</td>
                          <td className="px-4 py-3">
                            <Link href={`/facturatie/${f.id}`} className="text-sm text-[#00a66e] hover:underline">
                              {f.factuurnummer}
                            </Link>
                          </td>
                          <td className={`px-4 py-3 text-sm text-right font-medium ${isVervallen ? 'text-red-600' : ''}`}>
                            {formatCurrency(f.openstaand_bedrag)}
                          </td>
                          <td className="px-4 py-3 text-center">
                            {dagen !== null && (
                              <span className={`text-xs font-medium ${isVervallen ? 'text-red-600' : bijna ? 'text-orange-600' : 'text-gray-500'}`}>
                                {isVervallen ? `${dagen}d over` : `${dagen}d`}
                              </span>
                            )}
                          </td>
                          <td className="px-4 py-3">
                            <Badge status={f.status} />
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              )}
            </Section>
          </div>

          {/* 3. Moet besteld worden */}
          <Section
            title="Moet besteld worden"
            count={data.moetBesteldOrders.length}
            linkHref="/orders"
            linkLabel="Alle orders"
          >
            {data.moetBesteldOrders.length === 0 ? (
              <p className="px-6 py-6 text-sm text-gray-400 text-center">Geen orders om te bestellen</p>
            ) : (
              <table className="w-full">
                <thead>
                  <tr className="bg-gray-50">
                    <th className="text-left text-xs font-medium text-gray-500 uppercase px-6 py-2.5">Klant</th>
                    <th className="text-left text-xs font-medium text-gray-500 uppercase px-4 py-2.5">Order</th>
                    <th className="text-right text-xs font-medium text-gray-500 uppercase px-4 py-2.5">Bedrag</th>
                    <th className="text-left text-xs font-medium text-gray-500 uppercase px-4 py-2.5">Datum</th>
                    <th className="text-right text-xs font-medium text-gray-500 uppercase px-6 py-2.5">Actie</th>
                  </tr>
                </thead>
                <tbody>
                  {data.moetBesteldOrders.map(o => (
                    <tr key={o.id} className="border-t border-gray-100 hover:bg-gray-50/50">
                      <td className="px-6 py-3 text-sm font-medium text-gray-900">{o.relatie_bedrijfsnaam}</td>
                      <td className="px-4 py-3">
                        <Link href={`/orders/${o.id}`} className="text-sm text-[#00a66e] hover:underline">
                          {o.ordernummer}
                        </Link>
                      </td>
                      <td className="px-4 py-3 text-sm text-right font-medium">{formatCurrency(o.totaal)}</td>
                      <td className="px-4 py-3 text-sm text-gray-500">{formatDateShort(o.datum)}</td>
                      <td className="px-6 py-3 text-right">
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
            )}
          </Section>

          {/* 4. Open offertes */}
          <Section
            title="Open offertes"
            count={data.openOffertesList.length}
            linkHref="/offertes"
            linkLabel="Alle offertes"
          >
            {data.openOffertesList.length === 0 ? (
              <p className="px-6 py-6 text-sm text-gray-400 text-center">Geen open offertes</p>
            ) : (
              <table className="w-full">
                <thead>
                  <tr className="bg-gray-50">
                    <th className="text-left text-xs font-medium text-gray-500 uppercase px-6 py-2.5">Klant</th>
                    <th className="text-left text-xs font-medium text-gray-500 uppercase px-4 py-2.5">Offerte</th>
                    <th className="text-right text-xs font-medium text-gray-500 uppercase px-4 py-2.5">Bedrag</th>
                    <th className="text-center text-xs font-medium text-gray-500 uppercase px-4 py-2.5">Dagen open</th>
                    <th className="text-right text-xs font-medium text-gray-500 uppercase px-6 py-2.5">Actie</th>
                  </tr>
                </thead>
                <tbody>
                  {data.openOffertesList.map(o => (
                    <tr key={o.id} className="border-t border-gray-100 hover:bg-gray-50/50">
                      <td className="px-6 py-3 text-sm font-medium text-gray-900">{o.relatie_bedrijfsnaam}</td>
                      <td className="px-4 py-3">
                        <Link href={`/offertes/${o.id}`} className="text-sm text-[#00a66e] hover:underline">
                          {o.offertenummer}
                        </Link>
                        {o.project_naam && <span className="text-xs text-gray-400 ml-1.5">{o.project_naam}</span>}
                      </td>
                      <td className="px-4 py-3 text-sm text-right font-medium">{formatCurrency(o.totaal)}</td>
                      <td className="px-4 py-3 text-center">
                        <span className={`text-xs font-medium ${o.dagen_open > 14 ? 'text-orange-600' : 'text-gray-500'}`}>
                          {o.dagen_open}d
                        </span>
                      </td>
                      <td className="px-6 py-3 text-right">
                        <Link href={`/offertes/${o.id}`}>
                          <Button size="sm" variant="ghost" className="h-7 text-xs text-[#00a66e]">
                            Opvolgen
                          </Button>
                        </Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </Section>

          {/* 5. Geplande leveringen */}
          <Section
            title="Geplande leveringen"
            count={data.geplandeLeveringen.length}
            linkHref="/orders"
            linkLabel="Alle orders"
          >
            {data.geplandeLeveringen.length === 0 ? (
              <p className="px-6 py-6 text-sm text-gray-400 text-center">Geen geplande leveringen</p>
            ) : (
              <table className="w-full">
                <thead>
                  <tr className="bg-gray-50">
                    <th className="text-left text-xs font-medium text-gray-500 uppercase px-6 py-2.5">Klant</th>
                    <th className="text-left text-xs font-medium text-gray-500 uppercase px-4 py-2.5">Order</th>
                    <th className="text-left text-xs font-medium text-gray-500 uppercase px-4 py-2.5">Leverdatum</th>
                    <th className="text-center text-xs font-medium text-gray-500 uppercase px-4 py-2.5">Dagen</th>
                    <th className="text-left text-xs font-medium text-gray-500 uppercase px-6 py-2.5">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {data.geplandeLeveringen.map(l => {
                    const dagen = dagenVerschil(l.leverdatum)
                    return (
                      <tr key={l.id} className="border-t border-gray-100 hover:bg-gray-50/50">
                        <td className="px-6 py-3 text-sm font-medium text-gray-900">{l.relatie_bedrijfsnaam}</td>
                        <td className="px-4 py-3">
                          <Link href={`/orders/${l.id}`} className="text-sm text-[#00a66e] hover:underline">
                            {l.ordernummer}
                          </Link>
                        </td>
                        <td className="px-4 py-3 text-sm text-gray-600">{formatDateShort(l.leverdatum)}</td>
                        <td className="px-4 py-3 text-center">
                          <span className={`text-xs font-medium ${dagen <= 3 ? 'text-orange-600' : dagen < 0 ? 'text-red-600' : 'text-gray-500'}`}>
                            {dagen < 0 ? `${Math.abs(dagen)}d over` : `${dagen}d`}
                          </span>
                        </td>
                        <td className="px-6 py-3"><Badge status={l.status} /></td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            )}
          </Section>

          {/* 6. Te plannen leveringen */}
          {data.tePlannenOrders.length > 0 && (
            <Section
              title="Te plannen leveringen"
              count={data.tePlannenOrders.length}
              linkHref="/orders"
              linkLabel="Alle orders"
            >
              <table className="w-full">
                <thead>
                  <tr className="bg-gray-50">
                    <th className="text-left text-xs font-medium text-gray-500 uppercase px-6 py-2.5">Klant</th>
                    <th className="text-left text-xs font-medium text-gray-500 uppercase px-4 py-2.5">Order</th>
                    <th className="text-right text-xs font-medium text-gray-500 uppercase px-4 py-2.5">Bedrag</th>
                    <th className="text-right text-xs font-medium text-gray-500 uppercase px-6 py-2.5">Actie</th>
                  </tr>
                </thead>
                <tbody>
                  {data.tePlannenOrders.map(o => (
                    <tr key={o.id} className="border-t border-gray-100 hover:bg-gray-50/50">
                      <td className="px-6 py-3 text-sm font-medium text-gray-900">{o.relatie_bedrijfsnaam}</td>
                      <td className="px-4 py-3">
                        <Link href={`/orders/${o.id}`} className="text-sm text-[#00a66e] hover:underline">
                          {o.ordernummer}
                        </Link>
                      </td>
                      <td className="px-4 py-3 text-sm text-right font-medium">{formatCurrency(o.totaal)}</td>
                      <td className="px-6 py-3 text-right">
                        <Button
                          size="sm"
                          variant="secondary"
                          className="h-7 text-xs"
                          onClick={() => setPlanningOrder(o)}
                        >
                          <Truck className="h-3 w-3 mr-1" />
                          Levering plannen
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
            count={data.mijnTaken.length}
            linkHref="/taken"
            linkLabel="Alle taken"
          >
            {data.mijnTaken.length === 0 ? (
              <p className="px-6 py-6 text-sm text-gray-400 text-center">Geen openstaande taken</p>
            ) : (
              <table className="w-full">
                <thead>
                  <tr className="bg-gray-50">
                    <th className="text-left text-xs font-medium text-gray-500 uppercase px-6 py-2.5">Taak</th>
                    <th className="text-left text-xs font-medium text-gray-500 uppercase px-4 py-2.5">Deadline</th>
                    <th className="text-left text-xs font-medium text-gray-500 uppercase px-6 py-2.5">Prioriteit</th>
                  </tr>
                </thead>
                <tbody>
                  {data.mijnTaken.map(t => (
                    <tr
                      key={t.id}
                      className="border-t border-gray-100 hover:bg-gray-50/50 cursor-pointer"
                      onClick={() => router.push(`/taken/${t.id}`)}
                    >
                      <td className="px-6 py-3 text-sm font-medium text-gray-900">{t.titel}</td>
                      <td className="px-4 py-3 text-sm text-gray-500">
                        {t.deadline ? formatDateShort(t.deadline) : '-'}
                      </td>
                      <td className="px-6 py-3">
                        <Badge status={t.prioriteit} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </Section>
        </div>

        {/* Zijbalk rechts */}
        <div className="hidden lg:block w-80 shrink-0 space-y-4">
          {/* Omzetdoelen */}
          <Card>
            <div className="px-4 py-3 border-b border-gray-200 flex items-center justify-between">
              <div className="flex items-center gap-1.5">
                <Target className="h-3.5 w-3.5 text-[#00a66e]" />
                <h3 className="text-sm font-semibold text-gray-900">Omzetdoelen</h3>
              </div>
              <div className="flex items-center gap-1">
                {(['week', 'maand', 'jaar'] as const).map(tab => (
                  <button
                    key={tab}
                    onClick={() => setDoelenTab(tab)}
                    className={`px-2 py-1 text-[10px] rounded font-medium transition-colors ${
                      doelenTab === tab ? 'bg-[#00a66e] text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                    }`}
                  >
                    {tab.charAt(0).toUpperCase() + tab.slice(1)}
                  </button>
                ))}
                <button onClick={() => { setShowDoelenEdit(true); setDoelenForm({ week_doel: doelen.week_doel.toString(), maand_doel: doelen.maand_doel.toString(), jaar_doel: doelen.jaar_doel.toString() }) }} className="p-1 text-gray-400 hover:text-gray-600">
                  <Pencil className="h-3 w-3" />
                </button>
              </div>
            </div>
            <CardContent className="p-4">
              {!doelen.heeft_doelen ? (
                <div className="py-4 text-center">
                  <Target className="h-6 w-6 text-gray-300 mx-auto mb-1" />
                  <p className="text-xs text-gray-500">Geen doelen ingesteld</p>
                  <Button size="sm" className="mt-2 h-6 text-[10px] bg-[#00a66e] hover:bg-[#008f5f]" onClick={() => setShowDoelenEdit(true)}>Instellen</Button>
                </div>
              ) : (
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <span className={`text-2xl font-bold ${doelenPercentage >= 100 ? 'text-[#00a66e]' : doelenPercentage >= 80 ? 'text-green-600' : doelenPercentage >= 50 ? 'text-orange-500' : 'text-red-500'}`}>
                      {doelenPercentage}%
                    </span>
                    <span className="text-xs text-gray-400">{activeDoel.label}doel</span>
                  </div>
                  <div className="w-full bg-gray-100 rounded-full h-3 overflow-hidden">
                    <div
                      className={`h-3 rounded-full transition-all duration-500 ${doelenPercentage >= 100 ? 'bg-[#00a66e]' : doelenPercentage >= 80 ? 'bg-green-500' : doelenPercentage >= 50 ? 'bg-orange-500' : 'bg-red-500'}`}
                      style={{ width: `${Math.min(doelenPercentage, 100)}%` }}
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-3 text-center text-xs">
                    <div>
                      <p className="text-gray-400">Omzet</p>
                      <p className="font-bold text-gray-900">{formatCurrency(activeDoel.omzet)}</p>
                    </div>
                    <div>
                      <p className="text-gray-400">Doel</p>
                      <p className="font-bold text-gray-900">{formatCurrency(activeDoel.doel)}</p>
                    </div>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Maandelijkse omzet chart */}
          <Card>
            <div className="px-4 py-3 border-b border-gray-200">
              <h3 className="text-sm font-semibold text-gray-900">Maandelijkse omzet</h3>
            </div>
            <CardContent className="p-4">
              {data.gefactureerdPerMaand.length === 0 ? (
                <p className="text-xs text-gray-400 text-center py-4">Geen data</p>
              ) : (
                <div className="flex items-end gap-1 h-32">
                  {data.gefactureerdPerMaand.map((d, i) => {
                    const maxVal = Math.max(...data.gefactureerdPerMaand.map(m => m.bedrag), 1)
                    const pct = (d.bedrag / maxVal) * 100
                    return (
                      <div key={i} className="flex-1 flex flex-col items-center gap-0.5 min-w-0">
                        <div className="w-full flex flex-col items-center justify-end h-24">
                          {d.bedrag > 0 && (
                            <span className="text-[8px] text-gray-400 mb-0.5 truncate max-w-full">
                              {d.bedrag >= 1000 ? `${(d.bedrag / 1000).toFixed(0)}K` : `€${d.bedrag}`}
                            </span>
                          )}
                          <div
                            className="w-full max-w-[28px] bg-[#00a66e] rounded-t transition-all"
                            style={{ height: `${Math.max(pct, d.bedrag > 0 ? 4 : 0)}%` }}
                          />
                        </div>
                        <span className="text-[8px] text-gray-400 truncate max-w-full">{d.maand}</span>
                      </div>
                    )
                  })}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Snelle links */}
          <Card>
            <CardContent className="p-3 space-y-1">
              <Link href="/offertes/nieuw" className="flex items-center gap-2 px-3 py-2 rounded-lg hover:bg-gray-50 text-sm text-gray-700 transition-colors">
                <FileText className="h-4 w-4 text-[#00a66e]" /> Nieuwe offerte
              </Link>
              <Link href="/relatiebeheer" className="flex items-center gap-2 px-3 py-2 rounded-lg hover:bg-gray-50 text-sm text-gray-700 transition-colors">
                <Package className="h-4 w-4 text-[#00a66e]" /> Relatiebeheer
              </Link>
              <Link href="/taken" className="flex items-center gap-2 px-3 py-2 rounded-lg hover:bg-gray-50 text-sm text-gray-700 transition-colors">
                <CheckSquare className="h-4 w-4 text-[#00a66e]" /> Taken
              </Link>
            </CardContent>
          </Card>
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
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="bg-white rounded-xl p-6 max-w-md w-full mx-4 shadow-xl">
            <h3 className="text-lg font-semibold mb-2">Offerte factureren</h3>
            <p className="text-sm text-gray-600 mb-6">Hoe wilt u deze offerte factureren?</p>
            <div className="space-y-3">
              <button onClick={() => handleConvertToFactuur(factuurDialogOfferte.id, 'volledig')} disabled={!!factuurLoading} className="w-full text-left p-4 rounded-lg border-2 border-gray-200 hover:border-[#00a66e] hover:bg-green-50/50 transition-all">
                <p className="font-medium">100% factureren</p>
                <p className="text-sm text-gray-500">1 factuur voor het volledige bedrag van {formatCurrency(factuurDialogOfferte.totaal)}</p>
              </button>
              <button onClick={() => handleConvertToFactuur(factuurDialogOfferte.id, 'split', 70)} disabled={!!factuurLoading} className="w-full text-left p-4 rounded-lg border-2 border-gray-200 hover:border-[#00a66e] hover:bg-green-50/50 transition-all">
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
                      className="w-20 px-3 py-2 border border-gray-300 rounded-md text-sm text-right focus:outline-none focus:ring-2 focus:ring-[#00a66e] focus:border-transparent"
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
            <div className="flex justify-end mt-4"><Button variant="ghost" onClick={() => setFactuurDialogOfferte(null)}>Annuleren</Button></div>
          </div>
        </div>
      )}

      {/* Omzetdoelen edit dialog */}
      {showDoelenEdit && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="bg-white rounded-xl p-6 max-w-md w-full mx-4 shadow-xl">
            <h3 className="text-lg font-semibold mb-4">Omzetdoelen {new Date().getFullYear()}</h3>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Weekdoel</label>
                <input
                  type="number"
                  value={doelenForm.week_doel}
                  onChange={(e) => setDoelenForm(f => ({ ...f, week_doel: e.target.value }))}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-[#00a66e] focus:border-transparent"
                  placeholder="0"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Maanddoel</label>
                <input
                  type="number"
                  value={doelenForm.maand_doel}
                  onChange={(e) => setDoelenForm(f => ({ ...f, maand_doel: e.target.value }))}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-[#00a66e] focus:border-transparent"
                  placeholder="0"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Jaardoel</label>
                <input
                  type="number"
                  value={doelenForm.jaar_doel}
                  onChange={(e) => setDoelenForm(f => ({ ...f, jaar_doel: e.target.value }))}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-[#00a66e] focus:border-transparent"
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
