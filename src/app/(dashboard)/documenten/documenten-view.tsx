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
    // Reset de input zodat hetzelfde bestand na een fout direct opnieuw kan.
    e.target.value = ''
    if (!file) return
    setUploading(true)
    const { showToast } = await import('@/components/ui/toast')
    try {
      // Storage-keys staan geen spaties/accenten/rare tekens toe; saneer de naam
      // anders faalt de upload stil. De originele naam bewaren we in de DB-rij.
      const veiligeNaam = file.name.normalize('NFKD').replace(/[^a-zA-Z0-9._-]/g, '_')
      const path = `uploads/${Date.now()}_${veiligeNaam}`
      const { error: uploadError } = await supabase.storage.from('documenten').upload(path, file)
      if (uploadError) {
        showToast('Upload mislukt: ' + uploadError.message, 'error')
        return
      }
      const { data: profiel } = await supabase.from('profielen').select('administratie_id').single()
      const { error: insertError } = await supabase.from('documenten').insert({
        naam: file.name,
        bestandsnaam: file.name,
        bestandstype: file.type || null,
        bestandsgrootte: file.size,
        storage_path: path,
        administratie_id: profiel?.administratie_id,
      })
      if (insertError) {
        // Rij kon niet worden aangemaakt → opgeslagen bestand opruimen zodat er
        // geen wees-bestand in storage achterblijft.
        await supabase.storage.from('documenten').remove([path])
        showToast('Opslaan mislukt: ' + insertError.message, 'error')
        return
      }
      showToast('Document geüpload', 'success')
      window.location.reload()
    } catch (err) {
      showToast('Upload mislukt: ' + (err instanceof Error ? err.message : String(err)), 'error')
    } finally {
      setUploading(false)
    }
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
