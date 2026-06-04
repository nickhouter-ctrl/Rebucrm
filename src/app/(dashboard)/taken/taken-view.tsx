'use client'

import { useState, useMemo, useEffect } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import Link from 'next/link'
import { type ColumnDef } from '@tanstack/react-table'
import { DataTable } from '@/components/ui/data-table'
import { PageHeader } from '@/components/ui/page-header'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { EmptyState } from '@/components/ui/empty-state'
import { formatDateShort, formatCurrency } from '@/lib/utils'
import { completeTaak, uncompleteTaak, updateTaakDeadline, acceptOfferte, rejectOfferte, convertToFactuur } from '@/lib/actions'
import { Dialog } from '@/components/ui/dialog'
import { showToast } from '@/components/ui/toast'
import { Plus, CheckSquare, X, Phone, FileText, ListTodo, ThumbsUp, ThumbsDown, ArrowRight } from 'lucide-react'

interface Taak {
  id: string
  taaknummer: string | null
  titel: string
  status: string
  prioriteit: string
  deadline: string | null
  deadline_tijd: string | null
  categorie: string | null
  toegewezen_aan: string | null
  medewerker_id: string | null
  project: { naam: string } | null
  toegewezen: { naam: string } | null
  medewerker: { naam: string } | null
  offerte: { id?: string; offertenummer?: string | null; status?: string; totaal: number; subtotaal: number | null } | null
  relatie: { bedrijfsnaam: string } | null
}

type TabType = 'alle' | 'opvolgen' | 'offerte' | 'afgerond'

function getDeadlineKleur(deadline: string | null, deadline_tijd: string | null, status: string): string {
  if (!deadline || status === 'afgerond') return 'text-gray-500'
  const now = new Date()
  const today = new Date(now)
  today.setHours(0, 0, 0, 0)
  const deadlineDate = new Date(deadline)
  deadlineDate.setHours(0, 0, 0, 0)
  if (deadlineDate < today) return 'text-red-600 font-medium'
  if (deadlineDate > today) return 'text-gray-500'
  // Deadline is vandaag — check tijd
  if (deadline_tijd) {
    const [h, m] = deadline_tijd.split(':').map(Number)
    const deadlineDt = new Date(now)
    deadlineDt.setHours(h, m, 0, 0)
    if (deadlineDt < now) return 'text-red-600 font-medium'
  }
  return 'text-amber-600 font-medium'
}

function categorieTaak(taak: { titel: string; status: string; categorie?: string | null }): TabType {
  if (taak.status === 'afgerond') return 'afgerond'
  if (taak.categorie === 'Bellen') return 'opvolgen'
  if (taak.categorie === 'Uitwerken') return 'offerte'
  const t = taak.titel.toLowerCase()
  if (t.includes('offerte') || t.includes('uitwerken') || t.includes('opmeten') || t.includes('nacalcul')) return 'offerte'
  if (t.includes('bellen') || t.includes('opbellen') || t.includes('nabellen') || t.includes('opvolgen') || t.includes('terugbellen') || t.includes('mailen')) return 'opvolgen'
  return 'alle'
}

function getColumns(
  isAdmin: boolean,
  onToggle: (id: string, currentStatus: string) => void,
  onDeadlineChange: (id: string, newDeadline: string | null) => void,
): ColumnDef<Taak, unknown>[] {
  const cols: ColumnDef<Taak, unknown>[] = [
    {
      id: 'afvinken',
      header: '',
      size: 40,
      cell: ({ row }) => (
        // Wrapper vangt clicks zodat ze niet doorvallen naar de row-click (naar detail).
        // Hele cel als klikbaar gebied, niet alleen het kleine checkbox-vinkje.
        <div
          className="flex items-center justify-center cursor-pointer -my-2 -mx-1 px-1 py-2"
          onClick={(e) => {
            e.stopPropagation()
            e.preventDefault()
            onToggle(row.original.id, row.original.status)
          }}
        >
          <input
            type="checkbox"
            checked={row.original.status === 'afgerond'}
            readOnly
            className="h-4 w-4 rounded border-gray-300 text-[#00a66e] focus:ring-[#00a66e] cursor-pointer pointer-events-none"
          />
        </div>
      ),
    },
    { accessorKey: 'taaknummer', header: 'Nummer', cell: ({ getValue }) => <span className="text-gray-500 font-mono text-xs">{(getValue() as string) || '-'}</span> },
    { accessorKey: 'titel', header: 'Titel' },
    { id: 'relatie', header: 'Relatie', accessorFn: (row) => row.relatie?.bedrijfsnaam || '-' },
    { accessorKey: 'status', header: 'Status', cell: ({ getValue }) => <Badge status={getValue() as string} /> },
    { accessorKey: 'prioriteit', header: 'Prioriteit', cell: ({ getValue }) => <Badge status={getValue() as string} /> },
    { id: 'project', header: 'Verkoopkans', accessorFn: (row) => row.project?.naam || '-' },
    { id: 'bedrag', header: 'Bedrag excl.', cell: ({ row }) => {
      const off = row.original.offerte
      if (!off) return '-'
      // Toon subtotaal (excl. BTW); val terug op totaal/1.21 voor oude rijen
      // zonder subtotaal in de DB.
      const excl = off.subtotaal && off.subtotaal > 0
        ? off.subtotaal
        : off.totaal ? off.totaal / 1.21 : 0
      return excl > 0 ? formatCurrency(excl) : '-'
    } },
    { accessorKey: 'deadline', header: 'Deadline', cell: ({ row }) => {
      const d = row.original.deadline
      const tijd = row.original.deadline_tijd ? ` ${String(row.original.deadline_tijd).slice(0, 5)}` : ''
      const kleur = getDeadlineKleur(d, row.original.deadline_tijd, row.original.status)
      const isoValue = d ? d.slice(0, 10) : ''
      // Inline editable deadline: native date input gestyled als tekst.
      // onClick stopt propagation zodat row-click niet activeert; bij wijziging
      // belt updateTaakDeadline aan via de parent callback.
      return (
        <span
          className="relative inline-flex items-center"
          onClick={(e) => e.stopPropagation()}
        >
          <input
            type="date"
            value={isoValue}
            onChange={(e) => onDeadlineChange(row.original.id, e.target.value || null)}
            className={`bg-transparent border-0 p-0 text-sm focus:outline-none focus:ring-1 focus:ring-[#00a66e] rounded cursor-pointer ${kleur} ${!d ? 'text-gray-400' : ''}`}
            style={{ minWidth: '110px' }}
          />
          {tijd && <span className={`ml-1 ${kleur}`}>{tijd}</span>}
        </span>
      )
    } },
  ]
  if (isAdmin) {
    cols.push({ id: 'toegewezen', header: 'Toegewezen aan', accessorFn: (row) => row.medewerker?.naam || row.toegewezen?.naam || '-' })
  }
  return cols
}

export function TakenView({ taken, isAdmin, currentUserId }: { taken: Taak[]; isAdmin: boolean; currentUserId?: string | null }) {
  const router = useRouter()
  const searchParams = useSearchParams()
  const filterCollega = searchParams.get('collega')
  const filterCategorie = searchParams.get('categorie') as 'bellen' | 'uitwerken' | null

  // Unieke medewerkers voor dropdown (groepeer op naam, niet op ID)
  const medewerkers = useMemo(() => {
    const naamToIds = new Map<string, string>()
    taken.forEach(t => {
      const id = t.medewerker_id || t.toegewezen_aan
      const naam = t.medewerker?.naam || t.toegewezen?.naam
      if (id && naam && !naamToIds.has(naam)) naamToIds.set(naam, id)
    })
    return Array.from(naamToIds.entries()).map(([naam, id]) => [id, naam] as [string, string]).sort((a, b) => a[1].localeCompare(b[1]))
  }, [taken])

  // Medewerker-filter + tab persisteren in localStorage, default medewerker = ingelogde gebruiker
  const [filterMedewerker, setFilterMedewerker] = useState<string>('')
  const [activeTab, setActiveTab] = useState<TabType>('alle')

  // Laad opgeslagen waarden na mount
  useEffect(() => {
    try {
      const storedMw = window.localStorage.getItem('taken:filterMedewerker')
      setFilterMedewerker(storedMw !== null ? storedMw : (currentUserId || ''))
      const storedTab = window.localStorage.getItem('taken:activeTab') as TabType | null
      if (storedTab) setActiveTab(storedTab)
    } catch {}
  }, [currentUserId])

  function setFilterMedewerkerPersist(v: string) {
    setFilterMedewerker(v)
    try { window.localStorage.setItem('taken:filterMedewerker', v) } catch {}
  }
  function setActiveTabPersist(v: TabType) {
    setActiveTab(v)
    try { window.localStorage.setItem('taken:activeTab', v) } catch {}
  }

  // Sorteer op deadline oplopend (geen deadline → helemaal achteraan)
  const takenGesorteerd = useMemo(() => {
    return [...taken].sort((a, b) => {
      if (!a.deadline && !b.deadline) return 0
      if (!a.deadline) return 1
      if (!b.deadline) return -1
      const da = a.deadline + (a.deadline_tijd || '00:00')
      const db = b.deadline + (b.deadline_tijd || '00:00')
      return da.localeCompare(db)
    })
  }, [taken])

  // Maak naam-lookup voor filter (zodat filter op naam werkt ipv alleen op ID)
  const filterMedewerkerNaam = filterMedewerker ? medewerkers.find(([id]) => id === filterMedewerker)?.[1] : null

  // Tel per categorie (alleen open taken), respecteer actieve medewerker/collega filters
  const counts = useMemo(() => {
    const gescopedTaken = taken.filter(t => {
      if (filterCollega && t.toegewezen_aan !== filterCollega) return false
      if (filterMedewerkerNaam) {
        const taakNaam = t.medewerker?.naam || t.toegewezen?.naam
        if (taakNaam !== filterMedewerkerNaam) return false
      }
      return true
    })
    const openTaken = gescopedTaken.filter(t => t.status !== 'afgerond')
    return {
      alle: openTaken.length,
      opvolgen: openTaken.filter(t => categorieTaak(t) === 'opvolgen').length,
      offerte: openTaken.filter(t => categorieTaak(t) === 'offerte').length,
      afgerond: gescopedTaken.filter(t => t.status === 'afgerond').length,
    }
  }, [taken, filterCollega, filterMedewerkerNaam])

  // Filter op basis van tab + URL params + medewerker dropdown
  const gefilterd = takenGesorteerd.filter(t => {
    if (filterCollega && t.toegewezen_aan !== filterCollega) return false
    if (filterCategorie && {
      bellen: 'opvolgen' as TabType,
      uitwerken: 'offerte' as TabType,
    }[filterCategorie] && categorieTaak(t) !== { bellen: 'opvolgen' as TabType, uitwerken: 'offerte' as TabType }[filterCategorie]) return false
    if (filterMedewerkerNaam) {
      const taakNaam = t.medewerker?.naam || t.toegewezen?.naam
      if (taakNaam !== filterMedewerkerNaam) return false
    }

    // Tab filter
    if (activeTab === 'afgerond') return t.status === 'afgerond'
    if (activeTab === 'alle') return t.status !== 'afgerond'
    if (activeTab === 'opvolgen') return t.status !== 'afgerond' && categorieTaak(t) === 'opvolgen'
    if (activeTab === 'offerte') return t.status !== 'afgerond' && categorieTaak(t) === 'offerte'
    return true
  })

  const [takenLijst, setTakenLijst] = useState(gefilterd)

  // Sync bij filter-wijziging
  const filteredKey = `${filterCollega}-${filterCategorie}-${filterMedewerker}-${activeTab}`
  const [prevKey, setPrevKey] = useState(filteredKey)
  if (filteredKey !== prevKey) {
    setPrevKey(filteredKey)
    setTakenLijst(gefilterd)
  }

  // Vind naam van gefilterde collega
  const collegaNaam = filterCollega ? (taken.find(t => t.toegewezen_aan === filterCollega)?.toegewezen?.naam || null) : null
  const filterLabel = [
    collegaNaam,
    filterCategorie === 'bellen' ? 'Bellen' : filterCategorie === 'uitwerken' ? 'Uitwerken' : null,
  ].filter(Boolean).join(' — ')

  // Taak met een nog-niet-besliste offerte: bij afronden vragen we of de klant
  // akkoord ging. De beslissing duwt de verkoopkans door naar de factuurfase of
  // markeert 'm als verloren — zo weten we precies wat er doorgaat.
  const [beslisTaak, setBeslisTaak] = useState<Taak | null>(null)
  const [beslisBezig, setBeslisBezig] = useState(false)
  // Twee-traps popup: eerst gewonnen/verloren ('keuze'), bij gewonnen daarna de
  // factureer-keuze ('factureer'). Zo kun je nog kiezen hoe er gefactureerd wordt.
  const [beslisModus, setBeslisModus] = useState<'keuze' | 'factureer'>('keuze')
  const [customSplitPercentage, setCustomSplitPercentage] = useState(70)
  const [split3Percentages, setSplit3Percentages] = useState<[number, number, number]>([50, 40, 10])

  async function handleToggle(id: string, currentStatus: string) {
    // Heropenen kan altijd direct, geen popup.
    if (currentStatus === 'afgerond') {
      setTakenLijst(prev => prev.filter(t => t.id !== id))
      await uncompleteTaak(id)
      router.refresh()
      return
    }
    // Hangt aan deze taak een verstuurde offerte die nog op een beslissing
    // wacht? Dan eerst de akkoord/niet-akkoord-popup tonen i.p.v. stil afvinken.
    const taak = takenLijst.find(t => t.id === id) || taken.find(t => t.id === id)
    if (taak?.offerte?.id && taak.offerte.status === 'verzonden') {
      setBeslisModus('keuze')
      setBeslisTaak(taak)
      return
    }
    setTakenLijst(prev => prev.filter(t => t.id !== id))
    await completeTaak(id)
    router.refresh()
  }

  // Afhandeling vanuit de beslis-popup. uitkomst bepaalt wat er met de offerte
  // gebeurt; de taak wordt in alle gevallen afgerond. Gewonnen en verloren
  // landen elk in hun eigen bucket (offerte geaccepteerd vs afgewezen) zodat de
  // conversie blijft kloppen.
  async function handleBeslis(uitkomst: 'verloren' | 'alleen_taak') {
    const taak = beslisTaak
    if (!taak || beslisBezig) return
    setBeslisBezig(true)
    try {
      await completeTaak(taak.id)
      const offerteId = taak.offerte?.id
      if (uitkomst === 'verloren' && offerteId) {
        const res = await rejectOfferte(offerteId)
        if (res?.error) { showToast(res.error, 'error'); return }
        showToast('Offerte verloren — verkoopkans afgesloten', 'success')
      } else {
        showToast('Taak afgerond', 'success')
      }
      setTakenLijst(prev => prev.filter(t => t.id !== taak.id))
      setBeslisTaak(null)
      setBeslisModus('keuze')
      router.refresh()
    } catch (err) {
      showToast('Mislukt: ' + (err instanceof Error ? err.message : String(err)), 'error')
    } finally {
      setBeslisBezig(false)
    }
  }

  // Gewonnen: offerte op akkoord (order wordt aangemaakt) én factureren volgens
  // de gekozen splitsing. Daarna schuift de kans automatisch naar de factuur-fase
  // zodra de (eerste) factuur verstuurd is.
  async function handleGewonnen(
    splitType: 'volledig' | 'split' | 'split3',
    percentage = 70,
    termijnen?: [number, number, number],
  ) {
    const taak = beslisTaak
    const offerteId = taak?.offerte?.id
    if (!taak || !offerteId || beslisBezig) return
    setBeslisBezig(true)
    try {
      await completeTaak(taak.id)
      const acc = await acceptOfferte(offerteId)
      if (acc?.error) { showToast(acc.error, 'error'); return }
      const fac = await convertToFactuur(offerteId, splitType, percentage, termijnen)
      if (fac?.error) showToast(`Offerte gewonnen, maar factuur aanmaken mislukte: ${fac.error}`, 'error')
      else showToast('Offerte gewonnen — factuur aangemaakt', 'success')
      setTakenLijst(prev => prev.filter(t => t.id !== taak.id))
      setBeslisTaak(null)
      setBeslisModus('keuze')
      router.refresh()
    } catch (err) {
      showToast('Mislukt: ' + (err instanceof Error ? err.message : String(err)), 'error')
    } finally {
      setBeslisBezig(false)
    }
  }

  async function handleDeadlineChange(id: string, newDeadline: string | null) {
    // Optimistic update — direct UI bijwerken zodat het responsief voelt.
    setTakenLijst(prev => prev.map(t => t.id === id ? { ...t, deadline: newDeadline } : t))
    const result = await updateTaakDeadline(id, newDeadline)
    if (result.error) {
      // Rollback bij fout
      const origineel = taken.find(t => t.id === id)
      setTakenLijst(prev => prev.map(t => t.id === id ? { ...t, deadline: origineel?.deadline ?? null } : t))
      alert(`Deadline opslaan mislukt: ${result.error}`)
    } else {
      router.refresh()
    }
  }

  const tabs: { key: TabType; label: string; icon: typeof ListTodo; count: number }[] = [
    { key: 'alle', label: 'Alle open', icon: ListTodo, count: counts.alle },
    { key: 'opvolgen', label: 'Opvolgen', icon: Phone, count: counts.opvolgen },
    { key: 'offerte', label: 'Offertes / Uitwerken', icon: FileText, count: counts.offerte },
    { key: 'afgerond', label: 'Afgerond', icon: CheckSquare, count: counts.afgerond },
  ]

  return (
    <div>
      <PageHeader
        title="Taken"
        description="Beheer uw taken"
        actions={
          <Button onClick={() => router.push('/taken/nieuw')}>
            <Plus className="h-4 w-4" />
            Nieuwe taak
          </Button>
        }
      />

      {/* Tabs */}
      <div className="mb-4 flex gap-1 border-b border-gray-200">
        {tabs.map(tab => {
          const Icon = tab.icon
          return (
            <button
              key={tab.key}
              onClick={() => setActiveTabPersist(tab.key)}
              className={`flex items-center gap-1.5 px-4 py-2 text-sm font-medium border-b-2 transition-colors -mb-px ${
                activeTab === tab.key
                  ? 'border-[#00a66e] text-[#00a66e]'
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
              }`}
            >
              <Icon className="h-4 w-4" />
              {tab.label}
              <span className={`ml-1 text-xs px-1.5 py-0.5 rounded-full ${
                activeTab === tab.key ? 'bg-[#00a66e]/10 text-[#00a66e]' : 'bg-gray-100 text-gray-500'
              }`}>
                {tab.count}
              </span>
            </button>
          )
        })}
      </div>

      {/* Filters */}
      <div className="mb-4 flex items-center gap-3 flex-wrap">
        {medewerkers.length > 1 && (
          <select
            value={filterMedewerker}
            onChange={(e) => setFilterMedewerkerPersist(e.target.value)}
            className="px-3 py-1.5 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-[#00a66e] focus:border-transparent"
          >
            <option value="">Alle medewerkers</option>
            {medewerkers.map(([id, naam]) => (
              <option key={id} value={id}>{naam}</option>
            ))}
          </select>
        )}

        {filterLabel && (
          <span className="inline-flex items-center gap-1.5 bg-[#00a66e]/10 text-[#00a66e] text-sm font-medium px-3 py-1.5 rounded-full">
            {filterLabel}
            <Link href="/taken" className="hover:bg-[#00a66e]/20 rounded-full p-0.5 transition-colors">
              <X className="h-3.5 w-3.5" />
            </Link>
          </span>
        )}

        <span className="text-sm text-gray-400">{takenLijst.length} {activeTab === 'afgerond' ? 'afgerond' : 'open'}</span>
      </div>

      {takenLijst.length === 0 ? (
        <EmptyState icon={CheckSquare} title="Geen taken" description={activeTab === 'afgerond' ? 'Geen afgeronde taken.' : 'Geen taken in deze categorie.'} action={<Button onClick={() => router.push('/taken/nieuw')}><Plus className="h-4 w-4" />Taak aanmaken</Button>} />
      ) : (
        <DataTable
          columns={getColumns(isAdmin, handleToggle, handleDeadlineChange)}
          data={takenLijst}
          searchPlaceholder="Zoek taak..."
          onRowClick={(row) => {
            // Klik op een taak opent direct de gekoppelde verkoopkans, zodat je
            // meteen ziet of er al gefactureerd is / akkoord is / nog openstaat.
            // Geen verkoopkans gekoppeld → val terug op het taak-scherm.
            const projectId = (row as { project_id?: string | null }).project_id
            router.push(projectId ? `/projecten/${projectId}` : `/taken/${row.id}`)
          }}
          mobileCard={(t) => ({
            title: t.titel,
            subtitle: <>
              {t.relatie?.bedrijfsnaam ? <span className="truncate">{t.relatie.bedrijfsnaam}</span> : null}
              {t.project?.naam ? <span className="text-gray-400"> · {t.project.naam}</span> : null}
              {t.toegewezen?.naam ? <span className="text-gray-400"> · {t.toegewezen.naam}</span> : null}
            </>,
            rightTop: <span className={`px-1.5 py-0.5 rounded text-[10px] font-medium ${
              t.status === 'afgerond' ? 'bg-green-100 text-green-700'
              : t.prioriteit === 'hoog' ? 'bg-red-100 text-red-700'
              : t.prioriteit === 'normaal' ? 'bg-blue-100 text-blue-700'
              : 'bg-gray-100 text-gray-600'
            }`}>{t.status === 'afgerond' ? 'afgerond' : t.prioriteit}</span>,
            rightBottom: t.deadline
              ? <span className={`text-xs ${getDeadlineKleur(t.deadline, t.deadline_tijd, t.status)}`}>deadline {formatDateShort(t.deadline)}{t.deadline_tijd ? ` ${String(t.deadline_tijd).slice(0, 5)}` : ''}</span>
              : null,
          })}
        />
      )}

      {/* Beslis-popup bij afronden van een taak met een verstuurde offerte */}
      <Dialog
        open={!!beslisTaak}
        onClose={() => { if (!beslisBezig) { setBeslisTaak(null); setBeslisModus('keuze') } }}
        title={beslisModus === 'factureer' ? 'Offerte gewonnen — hoe factureren?' : 'Taak afgerond — wat is de uitkomst?'}
      >
        {beslisTaak && (() => {
          const off = beslisTaak.offerte
          const excl = off?.subtotaal && off.subtotaal > 0
            ? off.subtotaal
            : off?.totaal ? off.totaal / 1.21 : 0
          const totaalIncl = off?.totaal && off.totaal > 0 ? off.totaal : Math.round(excl * 1.21 * 100) / 100
          return (
            <div className="space-y-4">
              <div className="rounded-lg bg-gray-50 border border-gray-200 px-4 py-3 text-sm">
                <div className="font-medium text-gray-900">{beslisTaak.titel}</div>
                <div className="mt-1 text-gray-500">
                  {beslisTaak.relatie?.bedrijfsnaam || 'Onbekende relatie'}
                  {off?.offertenummer ? <> · offerte <span className="font-mono">{off.offertenummer}</span></> : null}
                  {excl > 0 ? <> · {formatCurrency(excl)} excl.</> : null}
                </div>
              </div>

              {beslisModus === 'keuze' ? (
                <>
                  <p className="text-sm text-gray-600">
                    Is de offerte gewonnen of verloren? Bij <strong>gewonnen</strong> zet je de offerte op
                    akkoord en kies je hoe er gefactureerd wordt — de kans schuift dan naar de factuur-fase.
                    Bij <strong>verloren</strong> wordt de verkoopkans afgesloten. Zo blijft de conversie kloppen.
                  </p>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    <button
                      type="button"
                      disabled={beslisBezig}
                      onClick={() => setBeslisModus('factureer')}
                      className="flex items-center justify-center gap-2 rounded-md bg-[#00a66e] text-white px-4 py-2.5 text-sm font-medium hover:bg-[#00935f] disabled:opacity-60 transition-colors"
                    >
                      <ThumbsUp className="h-4 w-4" />
                      Offerte gewonnen → factureren
                    </button>
                    <button
                      type="button"
                      disabled={beslisBezig}
                      onClick={() => handleBeslis('verloren')}
                      className="flex items-center justify-center gap-2 rounded-md bg-red-50 text-red-700 border border-red-200 px-4 py-2.5 text-sm font-medium hover:bg-red-100 disabled:opacity-60 transition-colors"
                    >
                      <ThumbsDown className="h-4 w-4" />
                      Offerte verloren
                    </button>
                  </div>
                  <button
                    type="button"
                    disabled={beslisBezig}
                    onClick={() => handleBeslis('alleen_taak')}
                    className="w-full flex items-center justify-center gap-1.5 text-sm text-gray-500 hover:text-gray-700 disabled:opacity-60 transition-colors"
                  >
                    Alleen taak afronden (later beslissen) <ArrowRight className="h-3.5 w-3.5" />
                  </button>
                </>
              ) : (
                <>
                  <p className="text-sm text-gray-600">Hoe wil je deze offerte factureren?</p>
                  <div className="space-y-2">
                    <button
                      type="button"
                      disabled={beslisBezig}
                      onClick={() => handleGewonnen('volledig')}
                      className="w-full text-left p-3 rounded-lg border-2 border-gray-200 hover:border-[#00a66e] hover:bg-emerald-50/40 disabled:opacity-60 transition-all"
                    >
                      <p className="font-medium text-sm">100% factureren</p>
                      <p className="text-xs text-gray-500">1 factuur · {formatCurrency(totaalIncl)}</p>
                    </button>
                    <button
                      type="button"
                      disabled={beslisBezig}
                      onClick={() => handleGewonnen('split', 70)}
                      className="w-full text-left p-3 rounded-lg border-2 border-gray-200 hover:border-[#00a66e] hover:bg-emerald-50/40 disabled:opacity-60 transition-all"
                    >
                      <p className="font-medium text-sm">70% / 30% splitsen</p>
                      <p className="text-xs text-gray-500">Aanbetaling {formatCurrency(totaalIncl * 0.7)} · restbetaling {formatCurrency(totaalIncl * 0.3)} (concept)</p>
                    </button>
                    <div className="p-3 rounded-lg border-2 border-gray-200">
                      <p className="font-medium text-sm mb-2">Eigen percentage (2 termijnen)</p>
                      <div className="flex items-center gap-2">
                        <input
                          type="number"
                          min={1}
                          max={99}
                          value={customSplitPercentage}
                          onChange={(e) => setCustomSplitPercentage(Math.min(99, Math.max(1, parseInt(e.target.value) || 50)))}
                          className="w-20 px-3 py-2 border border-gray-300 rounded-md text-sm text-right focus:outline-none focus:ring-2 focus:ring-[#00a66e]"
                        />
                        <span className="text-xs text-gray-500 flex-1">% / {100 - customSplitPercentage}% · {formatCurrency(totaalIncl * customSplitPercentage / 100)} + {formatCurrency(totaalIncl * (100 - customSplitPercentage) / 100)}</span>
                        <Button size="sm" disabled={beslisBezig} onClick={() => handleGewonnen('split', customSplitPercentage)}>Factureren</Button>
                      </div>
                    </div>
                    {(() => {
                      const [p1, p2, p3] = split3Percentages
                      const som = p1 + p2 + p3
                      const valid = som === 100 && p1 >= 1 && p2 >= 1 && p3 >= 1
                      return (
                        <div className="p-3 rounded-lg border-2 border-gray-200">
                          <p className="font-medium text-sm mb-2">3 termijnen (samen 100%)</p>
                          <div className="grid grid-cols-3 gap-2 mb-2">
                            {[0, 1, 2].map(i => (
                              <input
                                key={i}
                                type="number"
                                min={1}
                                max={98}
                                value={split3Percentages[i]}
                                onChange={(e) => {
                                  const v = Math.min(98, Math.max(1, parseInt(e.target.value) || 0))
                                  setSplit3Percentages(prev => { const next = [...prev] as [number, number, number]; next[i] = v; return next })
                                }}
                                className="w-full px-2 py-2 border border-gray-300 rounded-md text-sm text-center focus:outline-none focus:ring-2 focus:ring-[#00a66e]"
                              />
                            ))}
                          </div>
                          <p className={`text-xs mb-2 ${valid ? 'text-gray-400' : 'text-red-600'}`}>
                            {valid
                              ? `${formatCurrency(totaalIncl * p1 / 100)} + ${formatCurrency(totaalIncl * p2 / 100)} + ${formatCurrency(totaalIncl * p3 / 100)}`
                              : `Som: ${som}% — moet 100% zijn`}
                          </p>
                          <Button size="sm" className="w-full" disabled={beslisBezig || !valid} onClick={() => handleGewonnen('split3', 0, split3Percentages)}>Maak 3 facturen</Button>
                        </div>
                      )
                    })()}
                  </div>
                  <button
                    type="button"
                    disabled={beslisBezig}
                    onClick={() => setBeslisModus('keuze')}
                    className="w-full flex items-center justify-center gap-1.5 text-sm text-gray-500 hover:text-gray-700 disabled:opacity-60 transition-colors"
                  >
                    ← Terug
                  </button>
                </>
              )}
            </div>
          )
        })()}
      </Dialog>
    </div>
  )
}
