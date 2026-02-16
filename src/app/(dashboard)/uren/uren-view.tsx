'use client'

import { useState } from 'react'
import { type ColumnDef } from '@tanstack/react-table'
import { DataTable } from '@/components/ui/data-table'
import { PageHeader } from '@/components/ui/page-header'
import { Button } from '@/components/ui/button'
import { Dialog } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Select } from '@/components/ui/select'
import { EmptyState } from '@/components/ui/empty-state'
import { formatDateShort } from '@/lib/utils'
import { saveUur, deleteUur } from '@/lib/actions'
import { Plus, Clock, Trash2 } from 'lucide-react'

interface Uur {
  id: string
  datum: string
  uren: number
  omschrijving: string | null
  facturabel: boolean
  project: { naam: string } | null
  gebruiker: { naam: string } | null
}

interface Project {
  id: string
  naam: string
}

const columns: ColumnDef<Uur, unknown>[] = [
  { accessorKey: 'datum', header: 'Datum', cell: ({ getValue }) => formatDateShort(getValue() as string) },
  { id: 'project', header: 'Project', accessorFn: (row) => row.project?.naam || '-' },
  { accessorKey: 'uren', header: 'Uren' },
  { accessorKey: 'omschrijving', header: 'Omschrijving' },
  { accessorKey: 'facturabel', header: 'Facturabel', cell: ({ getValue }) => getValue() ? 'Ja' : 'Nee' },
]

export function UrenView({ uren, projecten }: { uren: Uur[]; projecten: Project[] }) {
  const [showForm, setShowForm] = useState(false)
  const [error, setError] = useState('')

  const totaalUren = uren.reduce((sum, u) => sum + u.uren, 0)

  async function handleSubmit(formData: FormData) {
    setError('')
    const result = await saveUur(formData)
    if (result.error) setError(result.error)
    else setShowForm(false)
  }

  async function handleDelete(id: string) {
    if (!confirm('Verwijderen?')) return
    await deleteUur(id)
  }

  return (
    <div>
      <PageHeader
        title="Urenregistratie"
        description={`Totaal: ${totaalUren} uren`}
        actions={
          <Button onClick={() => setShowForm(true)}>
            <Plus className="h-4 w-4" />
            Uren registreren
          </Button>
        }
      />

      <Dialog open={showForm} onClose={() => setShowForm(false)} title="Uren registreren">
        {error && <div className="bg-red-50 text-red-600 text-sm p-3 rounded-md mb-4">{error}</div>}
        <form action={handleSubmit} className="space-y-4">
          <Input id="datum" name="datum" label="Datum *" type="date" defaultValue={new Date().toISOString().split('T')[0]} required />
          <Select id="project_id" name="project_id" label="Project" placeholder="Selecteer project..." options={projecten.map(p => ({ value: p.id, label: p.naam }))} />
          <Input id="uren" name="uren" label="Uren *" type="number" step="0.25" min="0" required />
          <Input id="omschrijving" name="omschrijving" label="Omschrijving" />
          <Select id="facturabel" name="facturabel" label="Facturabel" defaultValue="true" options={[{ value: 'true', label: 'Ja' }, { value: 'false', label: 'Nee' }]} />
          <div className="flex justify-end gap-2">
            <Button type="button" variant="secondary" onClick={() => setShowForm(false)}>Annuleren</Button>
            <Button type="submit">Opslaan</Button>
          </div>
        </form>
      </Dialog>

      {uren.length === 0 ? (
        <EmptyState icon={Clock} title="Geen uren" description="U heeft nog geen uren geregistreerd." action={<Button onClick={() => setShowForm(true)}><Plus className="h-4 w-4" />Uren registreren</Button>} />
      ) : (
        <DataTable
          columns={[
            ...columns,
            {
              id: 'actions',
              header: '',
              cell: ({ row }) => (
                <button onClick={(e) => { e.stopPropagation(); handleDelete(row.original.id) }} className="text-gray-400 hover:text-red-500">
                  <Trash2 className="h-4 w-4" />
                </button>
              ),
            },
          ]}
          data={uren}
          searchPlaceholder="Zoek uren..."
        />
      )}
    </div>
  )
}
