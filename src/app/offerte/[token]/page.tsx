import { getOfferteByToken } from '@/lib/actions'
import { OffertePublic } from './offerte-public'
import { notFound } from 'next/navigation'

export default async function OffertePublicPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params
  const offerte = await getOfferteByToken(token)

  if (!offerte) {
    notFound()
  }

  return <OffertePublic offerte={offerte} token={token} />
}
