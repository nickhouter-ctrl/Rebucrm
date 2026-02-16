import { getProducten } from '@/lib/actions'
import { ProductList } from './product-list'

export default async function ProductenPage() {
  const producten = await getProducten()
  return <ProductList producten={producten} />
}
