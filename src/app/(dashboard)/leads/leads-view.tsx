'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { type ColumnDef } from '@tanstack/react-table'
import { DataTable } from '@/components/ui/data-table'
import { PageHeader } from '@/components/ui/page-header'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { EmptyState } from '@/components/ui/empty-state'
import { Input } from '@/components/ui/input'
import { Dialog } from '@/components/ui/dialog'
import { Plus, UserSearch, Loader2, Phone, Upload } from 'lucide-react'
import { createLead } from '@/lib/actions'
import { ImportLeadsDialog } from './import-leads-dialog'
import { KvkSearch } from '@/components/kvk-search'
import { formatDateShort } from '@/lib/utils'

interface Lead {
  id: string
  bedrijfsnaam: string
  contactpersoon: string | null
  email: string | null
  telefoon: string | null
  plaats: string | null
  status: string
  terugbel_datum: string | null
  created_at: string
}

const statusTabs = [
  { label: 'Alle', value: 'alle' },
  { label: 'Nieuw', value: 'nieuw' },
  { label: 'Gecontacteerd', value: 'gecontacteerd' },
  { label: 'Offerte verstuurd', value: 'offerte_verstuurd' },
]

const columns: ColumnDef<Lead, unknown>[] = [
  { accessorKey: 'bedrijfsnaam', header: 'Bedrijfsnaam' },
  { accessorKey: 'contactpersoon', header: 'Contactpersoon' },
  { accessorKey: 'telefoon', header: 'Telefoon' },
  {
    accessorKey: 'status',
    header: 'Status',
    cell: ({ getValue }) => <Badge status={getValue() as string} />,
  },
  {
    accessorKey: 'terugbel_datum',
    header: 'Terugbellen',
    cell: ({ getValue }) => {
      const val = getValue() as string | null
      if (!val) return <span className="text-gray-400">-</span>
      const date = new Date(val)
      const isPast = date < new Date()
      return (
        <span className={isPast ? 'text-red-600 font-medium' : 'text-gray-700'}>
          <Phone className="inline h-3 w-3 mr-1" />
          {formatDateShort(val)}
        </span>
      )
    },
  },
  {
    accessorKey: 'created_at',
    header: 'Aangemaakt',
    cell: ({ getValue }) => formatDateShort(getValue() as string),
  },
]

export function LeadsView({ leads }: { leads: Lead[] }) {
  const router = useRouter()
  const [activeTab, setActiveTab] = useState('alle')
  const [dialogOpen, setDialogOpen] = useState(false)
  const [leadForm, setLeadForm] = useState({ bedrijfsnaam: '', contactpersoon: '', telefoon: '', email: '', plaats: '', adres: '', postcode: '', kvk_nummer: '', notities: '' })
  const [importOpen, setImportOpen] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const filtered = activeTab === 'alle'
    ? leads
    : leads.filter(l => l.status === activeTab)

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setSaving(true)
    setError('')
    const formData = new FormData(e.currentTarget)
    const result = await createLead(formData)
    setSaving(false)
    if (result.error) {
      setError(result.error)
    } else {
      setDialogOpen(false)
      router.refresh()
    }
  }

  return (
    <div>
      <PageHeader
        title="Leads"
        description="Beheer uw verkooppijplijn"
        actions={
          <div className="flex gap-2">
            <Button variant="secondary" onClick={() => setImportOpen(true)}>
              <Upload className="h-4 w-4" />
              Importeren
            </Button>
            <Button onClick={() => setDialogOpen(true)}>
              <Plus className="h-4 w-4" />
              Lead toevoegen
            </Button>
          </div>
        }
      />

      <div className="flex gap-2 mb-4">
        {statusTabs.map(tab => (
          <button
            key={tab.value}
            onClick={() => setActiveTab(tab.value)}
            className={`px-3 py-1.5 rounded-full text-sm font-medium transition-colors ${
              activeTab === tab.value
                ? 'bg-gray-900 text-white'
                : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
            }`}
          >
            {tab.label}
            {tab.value !== 'alle' && (
              <span className="ml-1.5 text-xs">
                {leads.filter(l => l.status === tab.value).length}
              </span>
            )}
          </button>
        ))}
      </div>

      {filtered.length === 0 ? (
        <EmptyState
          icon={UserSearch}
          title="Geen leads"
          description={activeTab === 'alle' ? 'Voeg uw eerste lead toe om te beginnen.' : 'Geen leads met deze status.'}
          action={
            activeTab === 'alle' ? (
              <Button onClick={() => setDialogOpen(true)}>
                <Plus className="h-4 w-4" />
                Lead toevoegen
              </Button>
            ) : undefined
          }
        />
      ) : (
        <DataTable
          columns={columns}
          data={filtered}
          searchPlaceholder="Zoek lead..."
          onRowClick={(row) => router.push(`/leads/${row.id}`)}
        />
      )}

      <Dialog open={dialogOpen} onClose={() => setDialogOpen(false)} title="Lead toevoegen">
        <form onSubmit={handleSubmit} className="space-y-4">
          {error && <p className="text-sm text-red-600 bg-red-50 p-2 rounded">{error}</p>}
          <KvkSearch
            label="Zoek in KVK-register (optioneel)"
            onSelect={r => setLeadForm(f => ({
              ...f,
              bedrijfsnaam: r.naam,
              adres: r.adres,
              postcode: r.postcode,
              plaats: r.plaats,
              kvk_nummer: r.kvkNummer,
              email: r.email || f.email,
              telefoon: r.telefoon || f.telefoon,
            }))}
          />
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Bedrijfsnaam *</label>
            <Input name="bedrijfsnaam" required value={leadForm.bedrijfsnaam} onChange={e => setLeadForm(f => ({ ...f, bedrijfsnaam: e.target.value }))} />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Contactpersoon</label>
              <Input name="contactpersoon" value={leadForm.contactpersoon} onChange={e => setLeadForm(f => ({ ...f, contactpersoon: e.target.value }))} />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Telefoon</label>
              <Input name="telefoon" value={leadForm.telefoon} onChange={e => setLeadForm(f => ({ ...f, telefoon: e.target.value }))} />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">E-mail</label>
              <Input name="email" type="email" value={leadForm.email} onChange={e => setLeadForm(f => ({ ...f, email: e.target.value }))} />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Plaats</label>
              <Input name="plaats" value={leadForm.plaats} onChange={e => setLeadForm(f => ({ ...f, plaats: e.target.value }))} />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Adres</label>
              <Input name="adres" value={leadForm.adres} onChange={e => setLeadForm(f => ({ ...f, adres: e.target.value }))} />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Postcode</label>
              <Input name="postcode" value={leadForm.postcode} onChange={e => setLeadForm(f => ({ ...f, postcode: e.target.value }))} />
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Notities</label>
            <textarea
              name="notities"
              rows={3}
              value={leadForm.notities}
              onChange={e => setLeadForm(f => ({ ...f, notities: e.target.value }))}
              className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="secondary" onClick={() => setDialogOpen(false)}>
              Annuleren
            </Button>
            <Button type="submit" disabled={saving}>
              {saving && <Loader2 className="h-4 w-4 animate-spin" />}
              Toevoegen
            </Button>
          </div>
        </form>
      </Dialog>

      <ImportLeadsDialog open={importOpen} onClose={() => { setImportOpen(false); router.refresh() }} />
    </div>
  )
}
