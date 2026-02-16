import { getProduct } from '@/lib/actions'
import { ProductForm } from './product-form'

export default async function ProductDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const product = id === 'nieuw' ? null : await getProduct(id)
  return <ProductForm product={product} />
}
