'use client'

import { useEffect } from 'react'
import { addRecentVisit, type RecentVisit } from '@/lib/recent-visits'

export function RecentTracker(props: Omit<RecentVisit, 'visited_at'>) {
  useEffect(() => {
    if (!props.id || !props.label) return
    addRecentVisit(props)
    // Alleen bij verandering van id/type — niet elke re-render
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [props.type, props.id])

  return null
}
