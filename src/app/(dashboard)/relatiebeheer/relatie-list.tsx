'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { type ColumnDef } from '@tanstack/react-table'
import { DataTable } from '@/components/ui/data-table'
import { PageHeader } from '@/components/ui/page-header'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { EmptyState } from '@/components/ui/empty-state'
import { Plus, Users, Search, Upload } from 'lucide-react'
import { ImportRelatiesDialog } from './import-relaties-dialog'

interface Relatie {
  id: string
  bedrijfsnaam: string
  type: string
  contactpersoon: string | null
  email: string | null
  telefoon: string | null
  plaats: string | null
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
  { accessorKey: 'telefoon', header: 'Telefoon' },
  { accessorKey: 'plaats', header: 'Plaats' },
]

export function RelatieList({ relaties }: { relaties: Relatie[] }) {
  const router = useRouter()
  const [importOpen, setImportOpen] = useState(false)

  return (
    <div>
      <PageHeader
        title="Relatiebeheer"
        description="Beheer uw klanten"
        actions={
          <div className="flex gap-2">
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

      {relaties.length === 0 ? (
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
          data={relaties}
          searchPlaceholder="Zoek relatie..."
          onRowClick={(row) => router.push(`/relatiebeheer/${row.id}`)}
        />
      )}
    </div>
  )
}
