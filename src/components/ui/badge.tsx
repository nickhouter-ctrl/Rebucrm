import { cn } from '@/lib/utils'
import { statusKleuren } from '@/lib/constants'

interface BadgeProps {
  status: string
  className?: string
  children?: React.ReactNode
}

export function Badge({ status, className, children }: BadgeProps) {
  const kleur = statusKleuren[status] || 'bg-gray-100 text-gray-700'
  const label = children || status.replace(/_/g, ' ')

  return (
    <span
      className={cn(
        'inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium capitalize',
        kleur,
        className
      )}
    >
      {label}
    </span>
  )
}
