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
import { completeTaak, uncompleteTaak } from '@/lib/actions'
import { Plus, CheckSquare, X, Phone, FileText, ListTodo } from 'lucide-react'

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
  offerte: { totaal: number } | null
  relatie: { bedrijfsnaam: string } | null
}

type TabType = 'alle' | 'opvolgen' | 'offerte' | 'afgerond'

function categorieTaak(taak: { titel: string; status: string; categorie?: string | null }): TabType {
  if (taak.status === 'afgerond') return 'afgerond'
  if (taak.categorie === 'Bellen') return 'opvolgen'
  if (taak.categorie === 'Uitwerken') return 'offerte'
  const t = taak.titel.toLowerCase()
  if (t.includes('offerte') || t.includes('uitwerken') || t.includes('opmeten') || t.includes('nacalcul')) return 'offerte'
  if (t.includes('bellen') || t.includes('opbellen') || t.includes('nabellen') || t.includes('opvolgen') || t.includes('terugbellen') || t.includes('mailen')) return 'opvolgen'
  return 'alle'
}

function getColumns(isAdmin: boolean, onToggle: (id: string, currentStatus: string) => void): ColumnDef<Taak, unknown>[] {
  const cols: ColumnDef<Taak, unknown>[] = [
    {
      id: 'afvinken',
      header: '',
      size: 40,
      cell: ({ row }) => (
        <input
          type="checkbox"
          checked={row.original.status === 'afgerond'}
          className="h-4 w-4 rounded border-gray-300 text-[#00a66e] focus:ring-[#00a66e] cursor-pointer"
          onClick={(e) => {
            e.stopPropagation()
            onToggle(row.original.id, row.original.status)
          }}
          readOnly
        />
      ),
    },
    { accessorKey: 'taaknummer', header: 'Nummer', cell: ({ getValue }) => <span className="text-gray-500 font-mono text-xs">{(getValue() as string) || '-'}</span> },
    { accessorKey: 'titel', header: 'Titel' },
    { id: 'relatie', header: 'Relatie', accessorFn: (row) => row.relatie?.bedrijfsnaam || '-' },
    { accessorKey: 'status', header: 'Status', cell: ({ getValue }) => <Badge status={getValue() as string} /> },
    { accessorKey: 'prioriteit', header: 'Prioriteit', cell: ({ getValue }) => <Badge status={getValue() as string} /> },
    { id: 'project', header: 'Verkoopkans', accessorFn: (row) => row.project?.naam || '-' },
    { id: 'bedrag', header: 'Bedrag', cell: ({ row }) => row.original.offerte?.totaal ? formatCurrency(row.original.offerte.totaal) : '-' },
    { accessorKey: 'deadline', header: 'Deadline', cell: ({ row }) => {
      const d = row.original.deadline
      if (!d) return '-'
      const tijd = row.original.deadline_tijd ? ` ${String(row.original.deadline_tijd).slice(0, 5)}` : ''
      return `${formatDateShort(d)}${tijd}`
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

  async function handleToggle(id: string, currentStatus: string) {
    if (currentStatus === 'afgerond') {
      setTakenLijst(prev => prev.map(t => t.id === id ? { ...t, status: 'open' } : t))
      await uncompleteTaak(id)
    } else {
      setTakenLijst(prev => prev.map(t => t.id === id ? { ...t, status: 'afgerond' } : t))
      await completeTaak(id)
    }
    router.refresh()
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
          columns={getColumns(isAdmin, handleToggle)}
          data={takenLijst}
          searchPlaceholder="Zoek taak..."
          onRowClick={(row) => router.push(`/taken/${row.id}`)}
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
              ? <span className="text-xs text-gray-500">deadline {t.deadline}{t.deadline_tijd ? ` ${t.deadline_tijd}` : ''}</span>
              : null,
          })}
        />
      )}
    </div>
  )
}
