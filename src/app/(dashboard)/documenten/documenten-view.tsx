'use client'

import { useState } from 'react'
import { type ColumnDef } from '@tanstack/react-table'
import { DataTable } from '@/components/ui/data-table'
import { PageHeader } from '@/components/ui/page-header'
import { Button } from '@/components/ui/button'
import { EmptyState } from '@/components/ui/empty-state'
import { formatDateShort } from '@/lib/utils'
import { createClient } from '@/lib/supabase/client'
import { deleteDocument } from '@/lib/actions'
import { Upload, Inbox, Trash2, Download } from 'lucide-react'

interface Document {
  id: string
  naam: string
  bestandsnaam: string
  bestandstype: string | null
  bestandsgrootte: number | null
  storage_path: string
  created_at: string
}

function formatSize(bytes: number | null): string {
  if (!bytes) return '-'
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

const columns: ColumnDef<Document, unknown>[] = [
  { accessorKey: 'naam', header: 'Naam' },
  { accessorKey: 'bestandsnaam', header: 'Bestand' },
  { accessorKey: 'bestandstype', header: 'Type' },
  { accessorKey: 'bestandsgrootte', header: 'Grootte', cell: ({ getValue }) => formatSize(getValue() as number | null) },
  { accessorKey: 'created_at', header: 'Geüpload', cell: ({ getValue }) => formatDateShort(getValue() as string) },
]

export function DocumentenView({ documenten }: { documenten: Document[] }) {
  const [uploading, setUploading] = useState(false)
  const supabase = createClient()

  async function handleUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setUploading(true)

    const path = `uploads/${Date.now()}_${file.name}`
    const { error: uploadError } = await supabase.storage.from('documenten').upload(path, file)

    if (!uploadError) {
      await supabase.from('documenten').insert({
        naam: file.name,
        bestandsnaam: file.name,
        bestandstype: file.type,
        bestandsgrootte: file.size,
        storage_path: path,
        administratie_id: (await supabase.from('profielen').select('administratie_id').single()).data?.administratie_id,
      })
      window.location.reload()
    }

    setUploading(false)
  }

  async function handleDownload(doc: Document) {
    const { data } = await supabase.storage.from('documenten').download(doc.storage_path)
    if (data) {
      const url = URL.createObjectURL(data)
      const a = document.createElement('a')
      a.href = url
      a.download = doc.bestandsnaam
      a.click()
      URL.revokeObjectURL(url)
    }
  }

  async function handleDelete(id: string) {
    if (!confirm('Verwijderen?')) return
    await deleteDocument(id)
    window.location.reload()
  }

  return (
    <div>
      <PageHeader
        title="Documenten inbox"
        description="Upload en beheer uw documenten"
        actions={
          <label className="cursor-pointer">
            <span className="inline-flex items-center justify-center gap-2 rounded-md font-medium transition-colors bg-primary text-white hover:bg-primary-hover px-4 py-2 text-sm">
              <Upload className="h-4 w-4" />
              {uploading ? 'Uploaden...' : 'Document uploaden'}
            </span>
            <input type="file" className="hidden" onChange={handleUpload} />
          </label>
        }
      />

      {documenten.length === 0 ? (
        <EmptyState icon={Inbox} title="Geen documenten" description="Upload uw eerste document." />
      ) : (
        <DataTable
          columns={[
            ...columns,
            {
              id: 'actions',
              header: '',
              cell: ({ row }) => (
                <div className="flex gap-2">
                  <button onClick={() => handleDownload(row.original)} className="text-gray-400 hover:text-blue-500"><Download className="h-4 w-4" /></button>
                  <button onClick={() => handleDelete(row.original.id)} className="text-gray-400 hover:text-red-500"><Trash2 className="h-4 w-4" /></button>
                </div>
              ),
            },
          ]}
          data={documenten}
          searchPlaceholder="Zoek document..."
        />
      )}
    </div>
  )
}
