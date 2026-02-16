'use client'

import { useRouter } from 'next/navigation'
import { useState } from 'react'
import { saveOrder, deleteOrder } from '@/lib/actions'
import { PageHeader } from '@/components/ui/page-header'
import { Card, CardContent, CardFooter } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Select } from '@/components/ui/select'
import { Button } from '@/components/ui/button'
import { formatCurrency } from '@/lib/utils'
import { Save, Trash2, ArrowLeft, Plus, X } from 'lucide-react'

interface Regel {
  omschrijving: string
  aantal: number
  prijs: number
  btw_percentage: number
  product_id?: string
}

export function OrderForm({ order, relaties, producten }: {
  order: Record<string, unknown> | null
  relaties: { id: string; bedrijfsnaam: string }[]
  producten: { id: string; naam: string; prijs: number; btw_percentage: number }[]
}) {
  const router = useRouter()
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const isNew = !order

  const [regels, setRegels] = useState<Regel[]>(
    (order?.regels as Regel[]) || [{ omschrijving: '', aantal: 1, prijs: 0, btw_percentage: 21 }]
  )

  function addRegel() {
    setRegels([...regels, { omschrijving: '', aantal: 1, prijs: 0, btw_percentage: 21 }])
  }
  function removeRegel(index: number) {
    setRegels(regels.filter((_, i) => i !== index))
  }
  function updateRegel(index: number, field: keyof Regel, value: string | number) {
    const updated = [...regels]
    updated[index] = { ...updated[index], [field]: value }
    setRegels(updated)
  }
  function selectProduct(index: number, productId: string) {
    const product = producten.find(p => p.id === productId)
    if (product) {
      const updated = [...regels]
      updated[index] = { ...updated[index], product_id: productId, omschrijving: product.naam, prijs: product.prijs, btw_percentage: product.btw_percentage }
      setRegels(updated)
    }
  }

  const subtotaal = regels.reduce((sum, r) => sum + r.aantal * r.prijs, 0)
  const btwTotaal = regels.reduce((sum, r) => sum + (r.aantal * r.prijs * r.btw_percentage) / 100, 0)
  const totaal = subtotaal + btwTotaal

  async function handleSubmit(formData: FormData) {
    setLoading(true)
    setError('')
    if (order) formData.set('id', order.id as string)
    formData.set('regels', JSON.stringify(regels))
    const result = await saveOrder(formData)
    if (result.error) { setError(result.error); setLoading(false) }
    else router.push('/offertes/orders')
  }

  async function handleDelete() {
    if (!order || !confirm('Weet u zeker dat u deze order wilt verwijderen?')) return
    const result = await deleteOrder(order.id as string)
    if (result.error) setError(result.error)
    else router.push('/offertes/orders')
  }

  return (
    <div>
      <PageHeader
        title={isNew ? 'Nieuwe order' : `Order ${order?.ordernummer}`}
        actions={<Button variant="ghost" onClick={() => router.push('/offertes/orders')}><ArrowLeft className="h-4 w-4" />Terug</Button>}
      />
      {error && <div className="bg-red-50 text-red-600 text-sm p-3 rounded-md mb-4">{error}</div>}
      <form action={handleSubmit} className="space-y-4">
        <Card>
          <CardContent className="space-y-4 pt-6">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <Input id="ordernummer" name="ordernummer" label="Ordernummer *" defaultValue={(order?.ordernummer as string) || ''} required />
              <Input id="datum" name="datum" label="Datum *" type="date" defaultValue={(order?.datum as string) || new Date().toISOString().split('T')[0]} required />
              <Input id="leverdatum" name="leverdatum" label="Leverdatum" type="date" defaultValue={(order?.leverdatum as string) || ''} />
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <Select id="relatie_id" name="relatie_id" label="Relatie" defaultValue={(order?.relatie_id as string) || ''} placeholder="Selecteer relatie..." options={relaties.map(r => ({ value: r.id, label: r.bedrijfsnaam }))} />
              <Select id="status" name="status" label="Status" defaultValue={(order?.status as string) || 'nieuw'} options={[
                { value: 'nieuw', label: 'Nieuw' }, { value: 'in_behandeling', label: 'In behandeling' },
                { value: 'geleverd', label: 'Geleverd' }, { value: 'gefactureerd', label: 'Gefactureerd' }, { value: 'geannuleerd', label: 'Geannuleerd' },
              ]} />
            </div>
            <Input id="onderwerp" name="onderwerp" label="Onderwerp" defaultValue={(order?.onderwerp as string) || ''} />
          </CardContent>
        </Card>

        <Card>
          <div className="px-6 py-4 border-b border-gray-200 flex items-center justify-between">
            <h3 className="font-semibold text-gray-900">Regelitems</h3>
            <Button type="button" variant="secondary" size="sm" onClick={addRegel}><Plus className="h-3 w-3" />Regel toevoegen</Button>
          </div>
          <CardContent>
            <div className="space-y-3">
              {regels.map((regel, i) => (
                <div key={i} className="grid grid-cols-12 gap-2 items-end">
                  <div className="col-span-1">
                    <select className="w-full px-2 py-2 border border-gray-300 rounded-md text-xs" value={regel.product_id || ''} onChange={(e) => selectProduct(i, e.target.value)}>
                      <option value="">--</option>
                      {producten.map(p => <option key={p.id} value={p.id}>{p.naam}</option>)}
                    </select>
                  </div>
                  <div className="col-span-4"><input placeholder="Omschrijving" className="w-full px-2 py-2 border border-gray-300 rounded-md text-sm" value={regel.omschrijving} onChange={(e) => updateRegel(i, 'omschrijving', e.target.value)} required /></div>
                  <div className="col-span-2"><input type="number" step="0.01" className="w-full px-2 py-2 border border-gray-300 rounded-md text-sm" value={regel.aantal} onChange={(e) => updateRegel(i, 'aantal', parseFloat(e.target.value) || 0)} /></div>
                  <div className="col-span-2"><input type="number" step="0.01" className="w-full px-2 py-2 border border-gray-300 rounded-md text-sm" value={regel.prijs} onChange={(e) => updateRegel(i, 'prijs', parseFloat(e.target.value) || 0)} /></div>
                  <div className="col-span-1"><select className="w-full px-2 py-2 border border-gray-300 rounded-md text-xs" value={regel.btw_percentage} onChange={(e) => updateRegel(i, 'btw_percentage', parseInt(e.target.value))}><option value={0}>0%</option><option value={9}>9%</option><option value={21}>21%</option></select></div>
                  <div className="col-span-1 text-right text-sm font-medium">{formatCurrency(regel.aantal * regel.prijs)}</div>
                  <div className="col-span-1"><button type="button" onClick={() => removeRegel(i)} className="p-1 text-gray-400 hover:text-red-500"><X className="h-4 w-4" /></button></div>
                </div>
              ))}
            </div>
            <div className="mt-6 flex justify-end">
              <div className="w-64 space-y-1 text-sm">
                <div className="flex justify-between"><span>Subtotaal:</span><span>{formatCurrency(subtotaal)}</span></div>
                <div className="flex justify-between"><span>BTW:</span><span>{formatCurrency(btwTotaal)}</span></div>
                <div className="flex justify-between font-bold text-base border-t pt-1"><span>Totaal:</span><span>{formatCurrency(totaal)}</span></div>
              </div>
            </div>
          </CardContent>
          <CardFooter className="flex justify-between">
            <div>{!isNew && <Button type="button" variant="danger" onClick={handleDelete}><Trash2 className="h-4 w-4" />Verwijderen</Button>}</div>
            <Button type="submit" disabled={loading}><Save className="h-4 w-4" />{loading ? 'Opslaan...' : 'Opslaan'}</Button>
          </CardFooter>
        </Card>
      </form>
    </div>
  )
}
