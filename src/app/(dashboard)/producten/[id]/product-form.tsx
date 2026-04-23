'use client'

import { useRouter } from 'next/navigation'
import { useState } from 'react'
import { saveProduct, deleteProduct } from '@/lib/actions'
import { PageHeader } from '@/components/ui/page-header'
import { Card, CardContent, CardFooter } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Select } from '@/components/ui/select'
import { Button } from '@/components/ui/button'
import { Save, Trash2, ArrowLeft } from 'lucide-react'

interface ProductData {
  id: string
  naam: string
  omschrijving: string | null
  eenheid: string
  prijs: number
  btw_percentage: number
  type: string
  voorraad_bijhouden: boolean
  voorraad: number
  artikelnummer: string | null
}

export function ProductForm({ product }: { product: ProductData | null }) {
  const router = useRouter()
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const isNew = !product

  async function handleSubmit(formData: FormData) {
    setLoading(true)
    setError('')
    if (product) formData.set('id', product.id)
    const result = await saveProduct(formData)
    if (result.error) {
      setError(result.error)
      setLoading(false)
    } else {
      router.push('/producten')
    }
  }

  async function handleDelete() {
    if (!product || !confirm('Weet u zeker dat u dit product wilt verwijderen?')) return
    const result = await deleteProduct(product.id)
    if (result.error) setError(result.error)
    else router.push('/producten')
  }

  return (
    <div>
      <PageHeader
        title={isNew ? 'Nieuw product' : 'Product bewerken'}
        actions={
          <Button variant="ghost" onClick={() => router.back()}>
              <ArrowLeft className="h-4 w-4" />
              Terug
          </Button>
        }
      />

      {error && <div className="bg-red-50 text-red-600 text-sm p-3 rounded-md mb-4">{error}</div>}

      <form action={handleSubmit}>
        <Card>
          <CardContent className="space-y-4 pt-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <Input id="naam" name="naam" label="Naam *" defaultValue={product?.naam || ''} required />
              <Select
                id="type"
                name="type"
                label="Type"
                defaultValue={product?.type || 'product'}
                options={[
                  { value: 'product', label: 'Product' },
                  { value: 'dienst', label: 'Dienst' },
                ]}
              />
              <Input id="artikelnummer" name="artikelnummer" label="Artikelnummer" defaultValue={product?.artikelnummer || ''} />
              <Input id="eenheid" name="eenheid" label="Eenheid" defaultValue={product?.eenheid || 'stuk'} />
              <Input id="prijs" name="prijs" label="Prijs *" type="number" step="0.01" defaultValue={product?.prijs || ''} required />
              <Select
                id="btw_percentage"
                name="btw_percentage"
                label="BTW-percentage"
                defaultValue={String(product?.btw_percentage ?? 21)}
                options={[
                  { value: '0', label: '0%' },
                  { value: '9', label: '9%' },
                  { value: '21', label: '21%' },
                ]}
              />
              <Select
                id="voorraad_bijhouden"
                name="voorraad_bijhouden"
                label="Voorraad bijhouden"
                defaultValue={product?.voorraad_bijhouden ? 'true' : 'false'}
                options={[
                  { value: 'false', label: 'Nee' },
                  { value: 'true', label: 'Ja' },
                ]}
              />
              <Input id="voorraad" name="voorraad" label="Voorraad" type="number" defaultValue={product?.voorraad || 0} />
            </div>
            <div>
              <label htmlFor="omschrijving" className="block text-sm font-medium text-gray-700 mb-1">Omschrijving</label>
              <textarea
                id="omschrijving"
                name="omschrijving"
                rows={3}
                defaultValue={product?.omschrijving || ''}
                className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent"
              />
            </div>
          </CardContent>
          <CardFooter className="flex justify-between">
            <div>
              {!isNew && (
                <Button type="button" variant="danger" onClick={handleDelete}>
                  <Trash2 className="h-4 w-4" />
                  Verwijderen
                </Button>
              )}
            </div>
            <Button type="submit" disabled={loading}>
              <Save className="h-4 w-4" />
              {loading ? 'Opslaan...' : 'Opslaan'}
            </Button>
          </CardFooter>
        </Card>
      </form>
    </div>
  )
}
