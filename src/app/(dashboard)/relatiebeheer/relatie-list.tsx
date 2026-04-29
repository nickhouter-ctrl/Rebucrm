'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { type ColumnDef } from '@tanstack/react-table'
import { DataTable } from '@/components/ui/data-table'
import { PageHeader } from '@/components/ui/page-header'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { EmptyState } from '@/components/ui/empty-state'
import { Plus, Users, Search, Upload, Download, Loader2 } from 'lucide-react'
import { ImportRelatiesDialog } from './import-relaties-dialog'
import { exportRelaties, sendBroadcastEmail } from '@/lib/actions'
import { formatCurrency } from '@/lib/utils'
import { Dialog } from '@/components/ui/dialog'
import { Mail, Send } from 'lucide-react'

interface Relatie {
  id: string
  bedrijfsnaam: string
  type: string
  contactpersoon: string | null
  email: string | null
  telefoon: string | null
  plaats: string | null
  laatste_notitie: string | null
  laatste_notitie_datum: string | null
  actieve_verkoopkansen: number
  open_taken: number
  openstaand_bedrag: number
  heeft_vervallen: boolean
  laatste_contact: string | null
  totaal_geoffereerd?: number
  totaal_geaccepteerd?: number
}

function relatieveDatum(datum: string): string {
  const nu = new Date()
  const d = new Date(datum)
  const diffMs = nu.getTime() - d.getTime()
  const diffMin = Math.floor(diffMs / 60000)
  if (diffMin < 1) return 'zojuist'
  if (diffMin < 60) return `${diffMin}m geleden`
  const diffUur = Math.floor(diffMin / 60)
  if (diffUur < 24) return `${diffUur}u geleden`
  const diffDag = Math.floor(diffUur / 24)
  if (diffDag < 30) return `${diffDag}d geleden`
  const diffMaand = Math.floor(diffDag / 30)
  if (diffMaand < 12) return `${diffMaand}mnd geleden`
  return `${Math.floor(diffMaand / 12)}j geleden`
}

const columns: ColumnDef<Relatie, unknown>[] = [
  { accessorKey: 'bedrijfsnaam', header: 'Bedrijfsnaam' },
  {
    accessorKey: 'type',
    header: 'Type',
    cell: ({ getValue }) => <Badge status={getValue() as string} />,
  },
  { accessorKey: 'contactpersoon', header: 'Contactpersoon' },
  { accessorKey: 'email', header: 'E-mail' },
  {
    accessorKey: 'laatste_notitie',
    header: 'Laatste notitie',
    cell: ({ row }) => {
      const tekst = row.original.laatste_notitie
      const datum = row.original.laatste_notitie_datum
      if (!tekst) return <span className="text-gray-400">—</span>
      return (
        <div className="max-w-[200px]">
          <p className="text-sm truncate">{tekst}</p>
          {datum && <p className="text-xs text-gray-400">{relatieveDatum(datum)}</p>}
        </div>
      )
    },
  },
  {
    accessorKey: 'actieve_verkoopkansen',
    header: 'Verkoopkansen',
    cell: ({ getValue }) => {
      const n = getValue() as number
      if (!n) return <span className="text-gray-400">—</span>
      return (
        <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-purple-100 text-purple-700">
          {n}
        </span>
      )
    },
  },
  {
    accessorKey: 'open_taken',
    header: 'Open taken',
    cell: ({ getValue }) => {
      const n = getValue() as number
      if (!n) return <span className="text-gray-400">—</span>
      return (
        <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-amber-100 text-amber-700">
          {n}
        </span>
      )
    },
  },
  {
    accessorKey: 'totaal_geoffereerd',
    header: 'Geoffereerd excl.',
    cell: ({ getValue }) => {
      const v = (getValue() as number) || 0
      if (!v) return <span className="text-gray-400">—</span>
      return <span className="text-sm text-gray-700">{formatCurrency(v)}</span>
    },
  },
  {
    accessorKey: 'totaal_geaccepteerd',
    header: 'Geaccepteerd excl.',
    cell: ({ getValue }) => {
      const v = (getValue() as number) || 0
      if (!v) return <span className="text-gray-400">—</span>
      return <span className="text-sm font-medium text-[#00a66e]">{formatCurrency(v)}</span>
    },
  },
  {
    accessorKey: 'openstaand_bedrag',
    header: 'Openstaand',
    cell: ({ row }) => {
      const bedrag = row.original.openstaand_bedrag
      if (!bedrag) return <span className="text-gray-400">—</span>
      return (
        <span className={row.original.heeft_vervallen ? 'text-red-600 font-medium' : ''}>
          {formatCurrency(bedrag)}
        </span>
      )
    },
  },
  {
    accessorKey: 'laatste_contact',
    header: 'Laatste contact',
    cell: ({ getValue }) => {
      const datum = getValue() as string | null
      if (!datum) return <span className="text-gray-400">—</span>
      return <span className="text-sm text-gray-500">{relatieveDatum(datum)}</span>
    },
  },
]

export function RelatieList({ relaties }: { relaties: Relatie[] }) {
  const router = useRouter()
  const [importOpen, setImportOpen] = useState(false)
  const [exporting, setExporting] = useState(false)
  const [filterType, setFilterType] = useState<'alle' | 'zakelijk' | 'particulier' | 'top'>('alle')
  const [bulkMailDialog, setBulkMailDialog] = useState<{ ids: string[] } | null>(null)
  const [bulkOnderwerp, setBulkOnderwerp] = useState('')
  const [bulkBericht, setBulkBericht] = useState('')
  const [bulkSending, setBulkSending] = useState(false)

  // Filter + (eventueel) sortering op geaccepteerd-bedrag voor de Top-tab.
  let gefilterd: Relatie[]
  if (filterType === 'alle') {
    gefilterd = relaties
  } else if (filterType === 'top') {
    gefilterd = [...relaties].sort((a, b) => (b.totaal_geaccepteerd || 0) - (a.totaal_geaccepteerd || 0))
  } else {
    gefilterd = relaties.filter(r => r.type === filterType)
  }

  async function handleExport() {
    setExporting(true)
    try {
      const result = await exportRelaties()
      if ('error' in result || !result.success || !result.relaties) {
        alert(('error' in result && result.error) || 'Exporteren mislukt')
        return
      }

      if (result.relaties.length === 0) {
        alert('Geen relaties om te exporteren')
        return
      }

      const rows = result.relaties.map(r => ({
        Bedrijfsnaam: r.bedrijfsnaam || '',
        Type: r.type || '',
        Contactpersoon: r.contactpersoon || '',
        'E-mail': r.email || '',
        Telefoon: r.telefoon || '',
        Adres: r.adres || '',
        Postcode: r.postcode || '',
        Plaats: r.plaats || '',
        Land: r.land || '',
        KVK: r.kvk_nummer || '',
        BTW: r.btw_nummer || '',
        IBAN: r.iban || '',
        Opmerkingen: r.opmerkingen || '',
        Actief: r.actief ? 'ja' : 'nee',
        Aangemaakt: r.created_at ? new Date(r.created_at).toLocaleDateString('nl-NL') : '',
      }))

      const XLSX = await import('xlsx')
      const worksheet = XLSX.utils.json_to_sheet(rows)
      const workbook = XLSX.utils.book_new()
      XLSX.utils.book_append_sheet(workbook, worksheet, 'Relaties')

      // Kolombreedtes automatisch bepalen
      const colWidths = Object.keys(rows[0] || {}).map(key => ({
        wch: Math.min(
          50,
          Math.max(
            key.length,
            ...rows.map(r => String((r as Record<string, string>)[key] || '').length)
          ) + 2
        ),
      }))
      worksheet['!cols'] = colWidths

      const datum = new Date().toISOString().split('T')[0]
      XLSX.writeFile(workbook, `relaties-export-${datum}.xlsx`)
    } catch (err) {
      console.error('Export fout:', err)
      alert('Exporteren mislukt')
    } finally {
      setExporting(false)
    }
  }

  return (
    <div>
      <PageHeader
        title="Relatiebeheer"
        description="Beheer uw klanten"
        actions={
          <div className="flex gap-2">
            <Button variant="secondary" onClick={handleExport} disabled={exporting}>
              {exporting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
              Exporteren
            </Button>
            <Button variant="secondary" onClick={() => setImportOpen(true)}>
              <Upload className="h-4 w-4" />
              Importeren
            </Button>
            <Button variant="secondary" onClick={() => router.push('/relatiebeheer/leads')}>
              <Search className="h-4 w-4" />
              Leads zoeken
            </Button>
            <Button onClick={() => router.push('/relatiebeheer/nieuw')}>
              <Plus className="h-4 w-4" />
              Nieuwe relatie
            </Button>
          </div>
        }
      />

      <ImportRelatiesDialog open={importOpen} onClose={() => setImportOpen(false)} />

      {/* Filter zakelijk/particulier */}
      <div className="mb-4 flex items-center gap-2">
        {([
          { value: 'alle' as const, label: 'Alle' },
          { value: 'zakelijk' as const, label: 'Zakelijk' },
          { value: 'particulier' as const, label: 'Particulier' },
          { value: 'top' as const, label: 'Top klanten' },
        ]).map(t => (
          <button
            key={t.value}
            onClick={() => setFilterType(t.value)}
            className={`px-3 py-1.5 text-sm rounded-md font-medium transition-colors ${
              filterType === t.value ? 'bg-primary text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
            }`}
          >
            {t.label}
          </button>
        ))}
        <span className="text-sm text-gray-400 ml-2">{gefilterd.length} relaties</span>
      </div>

      {gefilterd.length === 0 ? (
        <EmptyState
          icon={Users}
          title="Geen relaties"
          description="U heeft nog geen relaties toegevoegd."
          action={
            <Button onClick={() => router.push('/relatiebeheer/nieuw')}>
              <Plus className="h-4 w-4" />
              Relatie toevoegen
            </Button>
          }
        />
      ) : (
        <DataTable
          columns={columns}
          data={gefilterd}
          searchPlaceholder="Zoek relatie..."
          onRowClick={(row) => router.push(`/relatiebeheer/${row.id}`)}
          selectable
          getRowId={(row) => row.id}
          mobileCard={(r) => ({
            title: r.bedrijfsnaam,
            subtitle: [r.contactpersoon, r.plaats].filter(Boolean).join(' · '),
            rightTop: r.actieve_verkoopkansen > 0 ? `${r.actieve_verkoopkansen} verkoopkans${r.actieve_verkoopkansen === 1 ? '' : 'en'}` : null,
            rightBottom: r.openstaand_bedrag > 0
              ? <span className={r.heeft_vervallen ? 'text-red-600' : 'text-gray-700'}>{formatCurrency(r.openstaand_bedrag)} openstaand</span>
              : null,
          })}
          bulkActions={(selectedIds) => (
            <button
              type="button"
              onClick={() => { setBulkMailDialog({ ids: selectedIds }); setBulkOnderwerp(''); setBulkBericht('') }}
              className="inline-flex items-center gap-1 px-3 py-1.5 bg-primary text-white text-xs rounded-md hover:opacity-90"
            >
              <Mail className="h-3 w-3" />
              Bulk e-mail
            </button>
          )}
        />
      )}

      <Dialog
        open={!!bulkMailDialog}
        onClose={() => setBulkMailDialog(null)}
        title={`Bulk e-mail naar ${bulkMailDialog?.ids.length || 0} relaties`}
        className="max-w-2xl"
      >
        <div className="space-y-3">
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">Onderwerp</label>
            <input
              type="text"
              value={bulkOnderwerp}
              onChange={e => setBulkOnderwerp(e.target.value)}
              className="w-full px-3 py-2 text-sm border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-primary"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">Bericht</label>
            <textarea
              value={bulkBericht}
              onChange={e => setBulkBericht(e.target.value)}
              rows={8}
              className="w-full px-3 py-2 text-sm border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-primary"
              placeholder="Typ uw bericht..."
            />
          </div>
          <div className="flex items-center justify-end gap-2 pt-2 border-t">
            <Button variant="ghost" onClick={() => setBulkMailDialog(null)} disabled={bulkSending}>Annuleren</Button>
            <Button
              onClick={async () => {
                if (!bulkMailDialog || !bulkOnderwerp.trim() || !bulkBericht.trim()) return
                setBulkSending(true)
                const result = await sendBroadcastEmail({
                  type: 'selectie',
                  onderwerp: bulkOnderwerp,
                  bericht: bulkBericht,
                  selectedIds: bulkMailDialog.ids,
                })
                setBulkSending(false)
                if ('error' in result && result.error) {
                  alert(result.error)
                } else {
                  alert(`E-mail verstuurd naar ${'aantalOntvangers' in result ? result.aantalOntvangers : 0} relaties`)
                  setBulkMailDialog(null)
                }
              }}
              disabled={bulkSending || !bulkOnderwerp.trim() || !bulkBericht.trim()}
            >
              {bulkSending ? <Loader2 className="h-3 w-3 animate-spin" /> : <Send className="h-3 w-3" />}
              Verstuur
            </Button>
          </div>
        </div>
      </Dialog>
    </div>
  )
}
